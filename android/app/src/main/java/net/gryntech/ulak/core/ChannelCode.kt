package net.gryntech.ulak.core

import android.net.Uri
import net.gryntech.ulak.BuildConfig

/**
 * Channel (room) codes follow the server's rules: lowercase a-z, 0-9, '-' and '_', at most 32 chars.
 * Users may also paste a full link such as https://ulak.gryntech.net/a123 or ...?r=a123.
 */
object ChannelCode {
    private val VALID = Regex("^[a-z0-9_-]{1,32}$")
    private val RESERVED = setOf("index.html", "index.php", "api.php", "admin.html", "app.js", "style.css", "c", "chat", "s")

    fun normalize(input: String): String? {
        var value = input.trim()
        if (value.isEmpty()) return null

        if (value.contains("/") || value.contains("?")) {
            val uri = Uri.parse(if (value.contains("://")) value else "https://$value")
            uri.getQueryParameter("r")?.let { value = it }
                ?: uri.getQueryParameter("room")?.let { value = it }
                ?: run {
                    val segments = uri.pathSegments.filter { it.isNotBlank() && it !in RESERVED }
                    value = segments.lastOrNull() ?: return null
                }
        }

        value = value.lowercase()
        return if (VALID.matches(value) && value !in RESERVED) value else null
    }

    fun webUrl(code: String): String = "${BuildConfig.BASE_URL}/$code"
}
