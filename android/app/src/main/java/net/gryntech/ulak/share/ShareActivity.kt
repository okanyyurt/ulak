package net.gryntech.ulak.share

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.format.Formatter
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutManagerCompat
import net.gryntech.ulak.R
import net.gryntech.ulak.ui.UlakColors
import net.gryntech.ulak.ui.UlakTheme

/** "Paylaş → Ulak": asks for a channel code (or uses a recent / Direct Share channel) and queues the upload. */
class ShareActivity : ComponentActivity() {

    private val viewModel: ShareViewModel by viewModels()

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val directShare = ChannelShortcuts.channelFromShortcutId(intent.getStringExtra(ShortcutManagerCompat.EXTRA_SHORTCUT_ID))
        viewModel.init(intent, directShare)
        if (viewModel.items.isEmpty()) {
            Toast.makeText(this, "Paylaşılacak içerik bulunamadı.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        setContent {
            UlakTheme {
                ShareSheet(
                    vm = viewModel,
                    autoFocus = directShare == null,
                    onDismiss = { if (!viewModel.isBusy) finish() },
                    onFinished = ::onQueued
                )
            }
        }
    }

    private fun onQueued(done: SharePhase.Finished) {
        val skippedNote = if (done.skipped > 0) " (${done.skipped} öğe atlandı)" else ""
        Toast.makeText(this, "${done.channel} kanalına gönderiliyor…$skippedNote", Toast.LENGTH_SHORT).show()

        // Ask once for notification permission so progress and results are visible
        val flags = getSharedPreferences("ulak_flags", MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !flags.getBoolean("asked_notifications", false)
        ) {
            flags.edit().putBoolean("asked_notifications", true).apply()
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            finish()
        }
    }
}

@Composable
private fun ShareSheet(
    vm: ShareViewModel,
    autoFocus: Boolean,
    onDismiss: () -> Unit,
    onFinished: (SharePhase.Finished) -> Unit
) {
    val recent by vm.recentChannels.collectAsState()
    val deviceName by vm.deviceName.collectAsState()
    val phase = vm.phase
    val busy = vm.isBusy
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    var renaming by remember { mutableStateOf(false) }

    LaunchedEffect(phase) {
        if (phase is SharePhase.Finished) {
            keyboard?.hide()
            onFinished(phase)
        }
    }
    LaunchedEffect(Unit) {
        if (autoFocus && recent.isEmpty()) runCatching { focus.requestFocus() }
    }

    // Tapping the dimmed area closes the sheet
    Box(
        Modifier
            .fillMaxSize()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss)
            .statusBarsPadding(),
        contentAlignment = Alignment.BottomCenter
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(
                Modifier
                    .navigationBarsPadding()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 18.dp)
            ) {
                Header(vm.items)
                Spacer(Modifier.height(14.dp))
                ItemList(vm.items, vm.issues)
                Spacer(Modifier.height(16.dp))

                OutlinedTextField(
                    value = vm.channelInput,
                    onValueChange = { vm.channelInput = it.take(120) },
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    enabled = !busy,
                    singleLine = true,
                    label = { Text("Kanal kodu") },
                    placeholder = { Text("ör. a123") },
                    isError = vm.error != null,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Send
                    ),
                    keyboardActions = KeyboardActions(onSend = { vm.send(vm.channelInput) })
                )

                if (recent.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Text("Son kanallar — dokununca hemen gönderilir", style = MaterialTheme.typography.labelMedium, color = UlakColors.TextMuted)
                    Spacer(Modifier.height(6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(recent, key = { it }) { code ->
                            SuggestionChip(
                                onClick = { vm.send(code) },
                                enabled = !busy,
                                label = { Text(code, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold) }
                            )
                        }
                    }
                }

                vm.error?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }

                vm.missingChannel?.let { missing ->
                    Spacer(Modifier.height(12.dp))
                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(Modifier.padding(14.dp)) {
                            Text("“$missing” kanalı bulunamadı veya süresi dolmuş.", style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(10.dp))
                            OutlinedButton(onClick = { vm.send(missing, createIfMissing = true) }, enabled = !busy) {
                                Text("Bu kodla yeni kanal aç ve gönder")
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Kanal açarak kullanım koşullarını kabul etmiş olursunuz: yasa dışı içerik paylaşılamaz; IP adresi ve zaman kötüye kullanıma karşı belirli süre kaydedilir.",
                                style = MaterialTheme.typography.labelSmall,
                                color = UlakColors.TextMuted
                            )
                        }
                    }
                }

                when (phase) {
                    is SharePhase.Checking -> Progress("Kanal kontrol ediliyor…", null)
                    is SharePhase.Preparing -> Progress("Hazırlanıyor… %${(phase.progress * 100).toInt()}", phase.progress)
                    else -> Unit
                }

                Spacer(Modifier.height(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { renaming = true }, enabled = !busy) {
                        Text("Gönderen: $deviceName", maxLines = 1, overflow = TextOverflow.Ellipsis, color = UlakColors.TextMuted, fontSize = 13.sp)
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDismiss, enabled = !busy) { Text("Vazgeç") }
                    Spacer(Modifier.width(6.dp))
                    Button(onClick = { vm.send(vm.channelInput) }, enabled = !busy && vm.channelInput.isNotBlank()) {
                        Text("Gönder")
                    }
                }
            }
        }
    }

    if (renaming) {
        RenameDialog(deviceName, onSave = { vm.renameDevice(it); renaming = false }, onDismiss = { renaming = false })
    }
}

@Composable
private fun Header(items: List<SharedItem>) {
    val context = LocalContext.current
    val knownBytes = items.filter { it.size > 0 && it.kind != SharedKind.TEXT }.sumOf { it.size }
    val summary = buildString {
        append(if (items.size == 1) "1 öğe" else "${items.size} öğe")
        if (knownBytes > 0) append(" · ").append(Formatter.formatShortFileSize(context, knownBytes))
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(UlakColors.Background),
            contentAlignment = Alignment.Center
        ) {
            Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = null, modifier = Modifier.size(52.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text("Ulak ile paylaş", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
            Text(summary, style = MaterialTheme.typography.bodyMedium, color = UlakColors.TextMuted)
        }
    }
}

@Composable
private fun ItemList(items: List<SharedItem>, issues: Map<Int, String>) {
    val context = LocalContext.current
    val visible = items.take(4)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        visible.forEachIndexed { index, item ->
            Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(iconFor(item), fontSize = 20.sp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (item.kind == SharedKind.TEXT) item.text.orEmpty().replace('\n', ' ') else item.name,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium
                        )
                        issues[index]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                    }
                    if (item.size > 0 && item.kind != SharedKind.TEXT) {
                        Spacer(Modifier.width(8.dp))
                        Text(Formatter.formatShortFileSize(context, item.size), style = MaterialTheme.typography.labelMedium, color = UlakColors.TextMuted)
                    }
                }
            }
        }
        if (items.size > visible.size) {
            val hiddenIssues = issues.keys.count { it >= visible.size }
            Text(
                "+${items.size - visible.size} öğe daha" + if (hiddenIssues > 0) " ($hiddenIssues tanesi gönderilemeyecek)" else "",
                style = MaterialTheme.typography.labelMedium, color = UlakColors.TextMuted
            )
        }
    }
}

@Composable
private fun Progress(text: String, fraction: Float?) {
    Spacer(Modifier.height(12.dp))
    if (fraction == null) {
        LinearProgressIndicator(Modifier.fillMaxWidth())
    } else {
        LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
    }
    Spacer(Modifier.height(6.dp))
    Text(text, style = MaterialTheme.typography.labelMedium, color = UlakColors.TextMuted)
}

@Composable
private fun RenameDialog(current: String, onSave: (String) -> Unit, onDismiss: () -> Unit) {
    var value by remember { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cihaz adı") },
        text = {
            Column {
                Text("Kanaldaki diğer cihazlar gönderimlerinizi bu adla görür.", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(value = value, onValueChange = { value = it.take(40) }, singleLine = true)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(value) }) { Text("Kaydet") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } }
    )
}

private fun iconFor(item: SharedItem): String = when (item.kind) {
    SharedKind.TEXT -> "📝"
    SharedKind.IMAGE -> "🖼️"
    SharedKind.FILE -> when (item.extension) {
        "pdf" -> "📕"
        "doc", "docx", "odt", "rtf" -> "📘"
        "xls", "xlsx", "ods", "csv" -> "📗"
        "ppt", "pptx", "odp" -> "📙"
        "zip", "rar", "7z" -> "🗜️"
        else -> "📄"
    }
}
