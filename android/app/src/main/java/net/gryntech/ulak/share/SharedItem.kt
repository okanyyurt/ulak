package net.gryntech.ulak.share

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.core.content.IntentCompat

enum class SharedKind { TEXT, IMAGE, FILE }

data class SharedItem(
    val kind: SharedKind,
    val uri: Uri?,
    val text: String?,
    val name: String,
    val mime: String,
    /** Size in bytes, or -1 when the provider does not report it. */
    val size: Long
) {
    val extension: String get() = name.substringAfterLast('.', "").lowercase()
}

object ShareIntentParser {

    // Raster formats the image pipeline can decode and re-encode
    private val DECODABLE_IMAGES = setOf("image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/bmp")

    fun parse(context: Context, intent: Intent): List<SharedItem> {
        val items = mutableListOf<SharedItem>()
        val uris = LinkedHashSet<Uri>()

        when (intent.action) {
            Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris += it }
            Intent.ACTION_SEND_MULTIPLE -> IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris += it }
        }
        intent.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris += it }
        }

        for (uri in uris) describe(context, uri, intent.type)?.let { items += it }

        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()
        if (!text.isNullOrEmpty() && uris.isEmpty()) {
            val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()
            val content = if (!subject.isNullOrEmpty() && !text.contains(subject)) "$subject\n$text" else text
            items += SharedItem(SharedKind.TEXT, null, content, "Metin", "text/plain", content.length.toLong())
        }
        return items
    }

    private fun describe(context: Context, uri: Uri, fallbackMime: String?): SharedItem? {
        // Only content:// is accepted. file:// could point into this app's private storage
        // (a known share-intent exfiltration trick), and modern apps never send it anyway.
        if (uri.scheme != ContentResolver.SCHEME_CONTENT) return null
        if (uri.authority?.startsWith(context.packageName) == true) return null

        val resolver = context.contentResolver
        var name: String? = null
        var size = -1L
        try {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = c.getString(it) }
                    c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !c.isNull(it) }?.let { size = c.getLong(it) }
                }
            }
        } catch (e: Exception) {
            // Some providers reject queries; fall back to the URI itself
        }

        val mime = (resolver.getType(uri) ?: fallbackMime ?: "application/octet-stream").lowercase()
        var fileName = sanitizeFileName(name ?: uri.lastPathSegment ?: "dosya")
        if (!fileName.contains('.')) {
            MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)?.let { fileName = "$fileName.$it" }
        }

        val kind = if (mime in DECODABLE_IMAGES) SharedKind.IMAGE else SharedKind.FILE
        return SharedItem(kind, uri, null, fileName, mime, size)
    }

    fun sanitizeFileName(raw: String): String {
        val cleaned = raw.substringAfterLast('/').substringAfterLast('\\')
            .replace(Regex("[\\x00-\\x1F\\x7F\"<>:|?*]"), "")
            .trim(' ', '.')
        return cleaned.ifEmpty { "dosya" }.take(150)
    }
}
