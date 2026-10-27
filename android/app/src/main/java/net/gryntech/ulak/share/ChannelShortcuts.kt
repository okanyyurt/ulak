package net.gryntech.ulak.share

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import net.gryntech.ulak.R
import net.gryntech.ulak.core.ChannelCode
import net.gryntech.ulak.main.MainActivity

/**
 * Recently used channels are published as long-lived sharing shortcuts, so the system
 * share sheet offers "Ulak · a123" directly and one tap sends without typing the code.
 */
object ChannelShortcuts {

    private const val CATEGORY = "net.gryntech.ulak.category.CHANNEL_SHARE"
    private const val PREFIX = "ch_"

    fun channelFromShortcutId(id: String?): String? =
        id?.takeIf { it.startsWith(PREFIX) }?.removePrefix(PREFIX)?.let { ChannelCode.normalize(it) }

    fun publish(context: Context, code: String) {
        val shortcut = ShortcutInfoCompat.Builder(context, PREFIX + code)
            .setShortLabel(code)
            .setLongLabel("Ulak · $code")
            .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
            .setIntent(Intent(Intent.ACTION_VIEW, Uri.parse(ChannelCode.webUrl(code)), context, MainActivity::class.java))
            .setCategories(setOf(CATEGORY))
            .setLongLived(true)
            .build()
        try {
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
        } catch (e: Exception) {
            // Launcher rate limits must never break sharing
        }
    }

    fun remove(context: Context, code: String) {
        try {
            ShortcutManagerCompat.removeLongLivedShortcuts(context, listOf(PREFIX + code))
        } catch (e: Exception) {
        }
    }
}
