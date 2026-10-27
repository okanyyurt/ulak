package net.gryntech.ulak.share

import android.app.Application
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.gryntech.ulak.core.ChannelCode
import net.gryntech.ulak.data.Prefs
import net.gryntech.ulak.net.FileSettings
import net.gryntech.ulak.net.UlakApi
import net.gryntech.ulak.upload.Outbox
import net.gryntech.ulak.upload.UploadWorker
import java.io.IOException

sealed interface SharePhase {
    data object Idle : SharePhase
    data object Checking : SharePhase
    data class Preparing(val progress: Float) : SharePhase
    data class Finished(val channel: String, val queued: Int, val skipped: Int) : SharePhase
}

class ShareViewModel(app: Application) : AndroidViewModel(app) {

    private val prefs = Prefs(app)

    var items by mutableStateOf<List<SharedItem>>(emptyList())
        private set
    /** Item index → reason it will not be sent. */
    var issues by mutableStateOf<Map<Int, String>>(emptyMap())
        private set
    var channelInput by mutableStateOf("")
    var phase by mutableStateOf<SharePhase>(SharePhase.Idle)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    /** Set when the typed channel does not exist, so the UI can offer to create it. */
    var missingChannel by mutableStateOf<String?>(null)
        private set

    val recentChannels: StateFlow<List<String>> =
        prefs.recentChannels.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val deviceName: StateFlow<String> =
        prefs.deviceName.stateIn(viewModelScope, SharingStarted.Eagerly, "")

    private var initialized = false

    val isBusy: Boolean get() = phase is SharePhase.Checking || phase is SharePhase.Preparing

    fun init(intent: Intent, directShareChannel: String?) {
        if (initialized) return
        initialized = true
        items = ShareIntentParser.parse(getApplication(), intent)
        if (directShareChannel != null && items.isNotEmpty()) {
            channelInput = directShareChannel
            send(directShareChannel)
        }
    }

    fun renameDevice(name: String) {
        viewModelScope.launch { prefs.setDeviceName(name) }
    }

    fun send(rawChannel: String, createIfMissing: Boolean = false) {
        if (isBusy || phase is SharePhase.Finished) return
        val code = ChannelCode.normalize(rawChannel)
        if (code == null) {
            error = "Geçerli bir kanal kodu girin (ör. a123). Yalnızca harf, rakam, - ve _ kullanılabilir."
            return
        }
        channelInput = code
        error = null
        missingChannel = null

        viewModelScope.launch {
            phase = SharePhase.Checking
            try {
                var info = UlakApi.roomInfo(code)
                if (info == null) {
                    if (!createIfMissing) {
                        missingChannel = code
                        prefs.forgetChannel(code)
                        ChannelShortcuts.remove(getApplication(), code)
                        phase = SharePhase.Idle
                        return@launch
                    }
                    UlakApi.createRoom(code)
                    info = UlakApi.roomInfo(code)
                }
                val settings = info?.files ?: runCatching { UlakApi.settings() }.getOrNull()

                val problems = evaluate(items, settings)
                issues = problems
                val sendable = items.filterIndexed { i, _ -> i !in problems }
                if (sendable.isEmpty()) {
                    error = "Gönderilebilecek öğe yok."
                    phase = SharePhase.Idle
                    return@launch
                }

                phase = SharePhase.Preparing(0f)
                var lastShown = 0f
                val job = withContext(Dispatchers.IO) {
                    Outbox.create(getApplication(), code, sendable, settings) { p ->
                        if (p - lastShown >= 0.02f || p >= 1f) {
                            lastShown = p
                            phase = SharePhase.Preparing(p)
                        }
                    }
                }

                UploadWorker.enqueue(getApplication(), job)
                prefs.rememberChannel(code)
                ChannelShortcuts.publish(getApplication(), code)
                phase = SharePhase.Finished(code, sendable.size, problems.size)
            } catch (e: IOException) {
                error = e.message ?: "Bağlantı hatası."
                phase = SharePhase.Idle
            } catch (e: Exception) {
                error = "Beklenmeyen bir hata oluştu: ${e.message}"
                phase = SharePhase.Idle
            }
        }
    }

    private fun evaluate(items: List<SharedItem>, settings: FileSettings?): Map<Int, String> {
        val result = mutableMapOf<Int, String>()
        items.forEachIndexed { index, item ->
            val problem = when (item.kind) {
                SharedKind.TEXT -> if ((item.text?.length ?: 0) > MAX_TEXT_CHARS) "Metin çok uzun." else null
                SharedKind.IMAGE -> null // always re-encoded to a small JPEG/PNG
                SharedKind.FILE -> when {
                    settings == null -> null // let the server decide
                    !settings.enabled -> "Dosya paylaşımı yönetici tarafından kapatılmış."
                    item.extension !in settings.allowedExtensions -> "Bu dosya türü desteklenmiyor (.${item.extension.ifEmpty { "?" }})."
                    item.size > settings.maxFileSizeBytes -> "En fazla ${settings.maxFileSizeMB} MB gönderilebilir."
                    else -> null
                }
            }
            if (problem != null) result[index] = problem
        }
        return result
    }

    companion object {
        private const val MAX_TEXT_CHARS = 200_000
    }
}
