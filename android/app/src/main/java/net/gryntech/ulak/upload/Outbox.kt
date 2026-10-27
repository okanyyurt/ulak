package net.gryntech.ulak.upload

import android.content.Context
import net.gryntech.ulak.net.FileSettings
import net.gryntech.ulak.share.SharedItem
import net.gryntech.ulak.share.SharedKind
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * Shared content is copied into the app's private cache before the share sheet closes:
 * the URI read permission granted by the sending app ends with our activity, but the
 * upload continues in the background. Each job lives in cache/outbox/<id>/.
 */
object Outbox {

    private const val MANIFEST = "job.json"
    private const val STALE_AFTER_MS = 48L * 60 * 60 * 1000
    private const val COPY_BUFFER = 256 * 1024

    class TooLargeException(val itemName: String, val maxMB: Int) :
        IOException("$itemName en fazla $maxMB MB olabilir.")

    data class Item(
        val kind: SharedKind,
        val name: String,
        val mime: String,
        val size: Long,
        val path: String?,
        val text: String?,
        var done: Boolean = false,
        var error: String? = null
    )

    data class Job(val id: String, val channel: String, val createdAt: Long, val items: List<Item>)

    private fun root(context: Context) = File(context.cacheDir, "outbox")
    private fun dir(context: Context, id: String) = File(root(context), id)

    /** Copies/compresses everything into a new job. [onProgress] receives a 0..1 fraction. */
    fun create(
        context: Context,
        channel: String,
        items: List<SharedItem>,
        settings: FileSettings?,
        onProgress: (Float) -> Unit
    ): Job {
        val id = UUID.randomUUID().toString()
        val jobDir = dir(context, id).apply { mkdirs() }
        val resolver = context.contentResolver
        val staged = mutableListOf<Item>()

        try {
            items.forEachIndexed { index, item ->
                val base = File(jobDir, "item$index")
                staged += when (item.kind) {
                    SharedKind.TEXT -> Item(SharedKind.TEXT, item.name, item.mime, item.size, null, item.text)

                    SharedKind.IMAGE -> {
                        val out = ImageCompressor.compress(resolver, item.uri!!, item.mime, base)
                        val name = item.name.substringBeforeLast('.') + "." + out.extension
                        Item(SharedKind.IMAGE, name, out.mime, out.file.length(), out.file.path, null)
                    }

                    SharedKind.FILE -> {
                        val maxBytes = settings?.maxFileSizeBytes ?: Long.MAX_VALUE
                        val maxMB = settings?.maxFileSizeMB ?: 0
                        val target = File(base.path + ".bin")
                        var copied = 0L
                        val input = resolver.openInputStream(item.uri!!) ?: throw IOException("${item.name} okunamadı.")
                        input.use { src ->
                            target.outputStream().use { dst ->
                                val buffer = ByteArray(COPY_BUFFER)
                                while (true) {
                                    val n = src.read(buffer)
                                    if (n < 0) break
                                    copied += n
                                    if (copied > maxBytes) throw TooLargeException(item.name, maxMB)
                                    dst.write(buffer, 0, n)
                                    if (item.size > 0) onProgress((index + copied.toFloat() / item.size) / items.size)
                                }
                            }
                        }
                        if (copied == 0L) throw IOException("${item.name} boş bir dosya.")
                        Item(SharedKind.FILE, item.name, item.mime, copied, target.path, null)
                    }
                }
                onProgress((index + 1f) / items.size)
            }
        } catch (e: Exception) {
            jobDir.deleteRecursively()
            throw e
        }

        return Job(id, channel, System.currentTimeMillis(), staged).also { save(context, it) }
    }

    fun save(context: Context, job: Job) {
        val json = JSONObject()
            .put("id", job.id)
            .put("channel", job.channel)
            .put("createdAt", job.createdAt)
            .put("items", JSONArray().apply {
                job.items.forEach { item ->
                    put(JSONObject()
                        .put("kind", item.kind.name)
                        .put("name", item.name)
                        .put("mime", item.mime)
                        .put("size", item.size)
                        .put("path", item.path ?: JSONObject.NULL)
                        .put("text", item.text ?: JSONObject.NULL)
                        .put("done", item.done)
                        .put("error", item.error ?: JSONObject.NULL))
                }
            })
        // Write-then-rename so a crash never leaves a half-written manifest
        val target = File(dir(context, job.id), MANIFEST)
        val tmp = File(target.path + ".tmp")
        tmp.writeText(json.toString())
        if (!tmp.renameTo(target)) {
            target.delete()
            tmp.renameTo(target)
        }
    }

    fun load(context: Context, id: String): Job? {
        if (!id.matches(Regex("^[0-9a-f-]{36}$"))) return null
        val file = File(dir(context, id), MANIFEST)
        if (!file.exists()) return null
        return try {
            val json = JSONObject(file.readText())
            val arr = json.getJSONArray("items")
            Job(
                id = json.getString("id"),
                channel = json.getString("channel"),
                createdAt = json.getLong("createdAt"),
                items = (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    Item(
                        kind = SharedKind.valueOf(o.getString("kind")),
                        name = o.getString("name"),
                        mime = o.getString("mime"),
                        size = o.getLong("size"),
                        path = o.optString("path").takeIf { !o.isNull("path") },
                        text = o.optString("text").takeIf { !o.isNull("text") },
                        done = o.optBoolean("done"),
                        error = o.optString("error").takeIf { !o.isNull("error") }
                    )
                }
            )
        } catch (e: Exception) {
            null
        }
    }

    fun delete(context: Context, id: String) {
        dir(context, id).deleteRecursively()
    }

    fun deleteStaleJobs(context: Context) {
        val now = System.currentTimeMillis()
        root(context).listFiles()?.forEach { if (now - it.lastModified() > STALE_AFTER_MS) it.deleteRecursively() }
    }
}
