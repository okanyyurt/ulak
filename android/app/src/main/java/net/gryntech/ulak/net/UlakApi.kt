package net.gryntech.ulak.net

import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import net.gryntech.ulak.BuildConfig
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Error with a user-facing (Turkish) message from the server, plus the HTTP status. */
class UlakApiException(message: String, val status: Int, val received: Long? = null) : IOException(message) {
    /** 4xx answers (except timeouts / rate limits) will not succeed on retry. */
    val isPermanent: Boolean get() = status in 400..499 && status != 408 && status != 429
}

data class FileSettings(
    val enabled: Boolean,
    val maxFileSizeBytes: Long,
    val maxFileSizeMB: Int,
    val chunkSize: Int,
    val allowedExtensions: Set<String>
)

data class RoomInfo(val roomId: String, val ttlMode: String, val files: FileSettings?)

/**
 * Client for the PHP API at https://ulak.gryntech.net/api.php.
 * One shared OkHttp client (connection pool + HTTP/2), cancellable calls, retries for transient failures.
 */
object UlakApi {

    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val OCTET = "application/octet-stream".toMediaType()
    private const val MAX_ATTEMPTS = 3

    private val baseUrl: HttpUrl = "${BuildConfig.BASE_URL}/api.php".toHttpUrl()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .followRedirects(false) // the API never redirects; refuse to be bounced elsewhere
        .addInterceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("User-Agent", "UlakAndroid/${BuildConfig.VERSION_NAME}")
                    .header("Accept", "application/json")
                    .build()
            )
        }
        .build()

    @Volatile private var cachedSettings: Pair<Long, FileSettings>? = null

    private fun url(action: String, vararg params: Pair<String, String>): HttpUrl =
        baseUrl.newBuilder().addQueryParameter("action", action).apply {
            params.forEach { (k, v) -> addQueryParameter(k, v) }
        }.build()

    // ---------------------------------------------------------------------------------------------

    suspend fun settings(): FileSettings {
        cachedSettings?.let { (at, value) -> if (System.currentTimeMillis() - at < 5 * 60_000) return value }
        val json = getJson(url("get_settings"))
        return parseSettings(json.getJSONObject("files")).also {
            cachedSettings = System.currentTimeMillis() to it
        }
    }

    /** Returns null when the channel does not exist or has expired. Does not join the room. */
    suspend fun roomInfo(code: String): RoomInfo? {
        val json = try {
            getJson(url("room_info", "id" to code))
        } catch (e: UlakApiException) {
            if (e.status == 404) return null else throw e
        }
        if (!json.has("exists")) {
            // Older server without room_info: fall back to a presence-free get_room
            return try {
                val room = getJson(url("get_room", "id" to code))
                RoomInfo(room.optString("roomId", code), room.optString("ttlMode"), null)
            } catch (e: UlakApiException) {
                if (e.status == 404) null else throw e
            }
        }
        val files = json.optJSONObject("files")?.let { parseSettings(it) }
        files?.let { cachedSettings = System.currentTimeMillis() to it }
        return RoomInfo(json.optString("roomId", code), json.optString("ttlMode"), files)
    }

    /** The share sheet tells the user that creating a channel accepts the terms of use. */
    suspend fun createRoom(code: String, ttlMode: String = "1h"): String {
        val body = JSONObject().put("customId", code).put("ttlMode", ttlMode).put("acceptTerms", true)
        return postJson(url("create_room"), body).getString("roomId")
    }

    suspend fun addText(code: String, text: String, senderName: String, deviceId: String) {
        val body = JSONObject()
            .put("roomId", code)
            .put("type", "text")
            .put("content", text)
            .put("senderName", senderName)
            .put("senderDeviceId", deviceId)
        withRetry { postJson(url("add_item"), body) }
    }

    suspend fun addImage(code: String, dataUrl: String, fileName: String, fileSize: Long, mime: String, senderName: String, deviceId: String) {
        val body = JSONObject()
            .put("roomId", code)
            .put("type", "image")
            .put("content", dataUrl)
            .put("fileName", fileName)
            .put("fileSize", fileSize)
            .put("fileType", mime)
            .put("senderName", senderName)
            .put("senderDeviceId", deviceId)
        withRetry { postJson(url("add_item"), body) }
    }

    /**
     * Chunked upload (upload_init → upload_chunk × N → upload_complete).
     * Each chunk is retried on its own; on an offset mismatch the server's position is used.
     */
    suspend fun uploadFile(
        code: String,
        file: File,
        fileName: String,
        senderName: String,
        deviceId: String,
        onProgress: (sent: Long, total: Long) -> Unit
    ) {
        val total = file.length()
        val init = withRetry {
            postJson(url("upload_init"), JSONObject().put("roomId", code).put("fileName", fileName).put("fileSize", total))
        }
        val uploadId = init.getString("uploadId")
        val chunkSize = init.optInt("chunkSize", 1024 * 1024).coerceIn(64 * 1024, 4 * 1024 * 1024)

        val buffer = ByteArray(chunkSize)
        RandomAccessFile(file, "r").use { raf ->
            var offset = 0L
            while (offset < total) {
                raf.seek(offset)
                val read = raf.read(buffer, 0, minOf(chunkSize.toLong(), total - offset).toInt())
                if (read <= 0) throw IOException("Dosya okunamadı.")
                val body = buffer.toRequestBody(OCTET, 0, read)
                val chunkUrl = url("upload_chunk", "uploadId" to uploadId, "offset" to offset.toString())

                offset = try {
                    withRetry { postJson(chunkUrl, body) }.getLong("received")
                } catch (e: UlakApiException) {
                    // 409: a retried chunk already landed — continue from where the server is
                    if (e.status == 409 && e.received != null) e.received else throw e
                }
                onProgress(offset, total)
            }
        }

        val completeUrl = url("upload_complete", "uploadId" to uploadId)
        val completeBody = JSONObject().put("senderName", senderName).put("senderDeviceId", deviceId)
        var attempt = 0
        while (true) {
            attempt++
            try {
                postJson(completeUrl, completeBody)
                return
            } catch (e: UlakApiException) {
                // A retry after a lost response finds the upload already finalized
                if (e.status == 404 && attempt > 1) return
                if (e.isPermanent || attempt >= MAX_ATTEMPTS) throw e
            } catch (e: IOException) {
                if (attempt >= MAX_ATTEMPTS) throw IOException("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.", e)
            }
            delay(1000L shl (attempt - 1))
        }
    }

    // ---------------------------------------------------------------------------------------------

    private fun parseSettings(json: JSONObject): FileSettings {
        val exts = json.optJSONArray("allowedExtensions")
        return FileSettings(
            enabled = json.optBoolean("enabled", false),
            maxFileSizeBytes = json.optLong("maxFileSizeBytes", 25L * 1024 * 1024),
            maxFileSizeMB = json.optInt("maxFileSizeMB", 25),
            chunkSize = json.optInt("chunkSize", 1024 * 1024),
            allowedExtensions = (0 until (exts?.length() ?: 0)).map { exts!!.getString(it).lowercase() }.toSet()
        )
    }

    private suspend fun <T> withRetry(block: suspend () -> T): T {
        var attempt = 0
        while (true) {
            try {
                return block()
            } catch (e: UlakApiException) {
                if (e.isPermanent || ++attempt >= MAX_ATTEMPTS) throw e
            } catch (e: IOException) {
                if (++attempt >= MAX_ATTEMPTS) throw IOException("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.", e)
            }
            delay(1000L shl (attempt - 1)) // 1s, 2s
        }
    }

    private suspend fun getJson(url: HttpUrl): JSONObject =
        execute(Request.Builder().url(url).get().build())

    private suspend fun postJson(url: HttpUrl, body: JSONObject): JSONObject =
        postJson(url, body.toString().toRequestBody(JSON))

    private suspend fun postJson(url: HttpUrl, body: RequestBody): JSONObject =
        execute(Request.Builder().url(url).post(body).build())

    private suspend fun execute(request: Request): JSONObject {
        val response = client.newCall(request).await()
        response.use {
            val text = it.body?.string().orEmpty()
            val json = try {
                JSONObject(text)
            } catch (e: Exception) {
                throw UlakApiException("Sunucudan beklenmeyen yanıt (${it.code}).", it.code)
            }
            if (!it.isSuccessful || json.has("error")) {
                val received = if (json.has("received")) json.getLong("received") else null
                throw UlakApiException(json.optString("error", "Sunucu hatası (${it.code})."), it.code, received)
            }
            return json
        }
    }

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) = cont.resume(response)
            override fun onFailure(call: Call, e: IOException) {
                if (!cont.isCancelled) cont.resumeWithException(e)
            }
        })
    }
}
