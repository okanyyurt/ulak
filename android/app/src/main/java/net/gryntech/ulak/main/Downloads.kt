package net.gryntech.ulak.main

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.URLUtil
import net.gryntech.ulak.share.ShareIntentParser
import java.io.File
import java.io.IOException

/** Saves files the web app offers for download into Downloads/Ulak. */
object Downloads {

    private const val FOLDER = "Ulak"
    private val DATA_URL = Regex("^data:([a-z0-9.+/-]+);base64,(.+)$", RegexOption.IGNORE_CASE)
    private val SAFE_DATA_MIMES = setOf("image/png", "image/jpeg", "image/gif", "image/webp")
    private const val MAX_DATA_URL_CHARS = 12 * 1024 * 1024

    /** Shared photos arrive as data: URLs. Only real images are written. */
    fun saveDataUrl(context: Context, dataUrl: String, suggestedName: String?): String {
        if (dataUrl.length > MAX_DATA_URL_CHARS) throw IOException("Görsel çok büyük.")
        val match = DATA_URL.matchEntire(dataUrl) ?: throw IOException("Desteklenmeyen indirme.")
        val mime = match.groupValues[1].lowercase()
        if (mime !in SAFE_DATA_MIMES) throw IOException("Desteklenmeyen dosya türü.")
        val bytes = Base64.decode(match.groupValues[2], Base64.DEFAULT)
        val ext = mime.substringAfter('/').replace("jpeg", "jpg")
        val name = ShareIntentParser.sanitizeFileName(suggestedName ?: "ulak-${System.currentTimeMillis()}.$ext")
            .let { if (it.contains('.')) it else "$it.$ext" }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IOException("Kaydedilemedi.")
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IOException("Kaydedilemedi.")
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } else {
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER).apply { mkdirs() }
            File(dir, name).writeBytes(bytes)
        }
        return name
    }

    /** Shared documents are served by api.php?action=get_file — hand them to the system downloader. */
    fun enqueue(context: Context, url: String, contentDisposition: String?, mime: String?): String {
        val name = ShareIntentParser.sanitizeFileName(URLUtil.guessFileName(url, contentDisposition, mime))
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(name)
            .setDescription("Ulak")
            .setMimeType(mime)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$FOLDER/$name")
        context.getSystemService(DownloadManager::class.java).enqueue(request)
        return name
    }
}
