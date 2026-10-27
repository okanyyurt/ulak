package net.gryntech.ulak.upload

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import net.gryntech.ulak.R
import net.gryntech.ulak.UlakApp
import net.gryntech.ulak.core.ChannelCode
import net.gryntech.ulak.data.Prefs
import net.gryntech.ulak.main.MainActivity
import net.gryntech.ulak.net.UlakApi
import net.gryntech.ulak.net.UlakApiException
import net.gryntech.ulak.share.SharedKind
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Sends one outbox job to its channel, item by item, surviving process death and network drops. */
class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val jobId = inputData.getString(KEY_JOB).orEmpty()
    private val channel = inputData.getString(KEY_CHANNEL).orEmpty()
    private val notificationId = jobId.hashCode()
    private var lastProgressUpdate = 0L

    override suspend fun getForegroundInfo(): ForegroundInfo =
        foregroundInfo(progressNotification("Hazırlanıyor…", 0, 0))

    override suspend fun doWork(): Result {
        val job = Outbox.load(applicationContext, jobId) ?: return Result.failure()

        try {
            setForeground(getForegroundInfo())
        } catch (e: IllegalStateException) {
            // Background start restrictions: continue as a regular worker
        }

        val prefs = Prefs(applicationContext)
        val senderName = prefs.currentDeviceName()
        val deviceId = prefs.deviceId()

        val totalBytes = job.items.sumOf { it.size }.coerceAtLeast(1)
        var doneBytes = job.items.filter { it.done }.sumOf { it.size }

        for ((index, item) in job.items.withIndex()) {
            if (item.done) continue
            val label = "${index + 1}/${job.items.size} · ${item.name}"
            updateProgress(label, doneBytes, totalBytes, force = true)

            try {
                when (item.kind) {
                    SharedKind.TEXT -> UlakApi.addText(job.channel, item.text.orEmpty(), senderName, deviceId)

                    SharedKind.IMAGE -> {
                        val bytes = File(item.path!!).readBytes()
                        val dataUrl = "data:${item.mime};base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                        UlakApi.addImage(job.channel, dataUrl, item.name, item.size, item.mime, senderName, deviceId)
                    }

                    SharedKind.FILE -> UlakApi.uploadFile(job.channel, File(item.path!!), item.name, senderName, deviceId) { sent, _ ->
                        updateProgress(label, doneBytes + sent, totalBytes)
                    }
                }
                item.done = true
            } catch (e: UlakApiException) {
                if (e.status == 404 && item.kind != SharedKind.FILE) {
                    // The channel itself is gone: nothing else can be delivered
                    return finish(job, fatal = "Kanal bulunamadı veya süresi dolmuş.")
                }
                if (!e.isPermanent) return retryOrFinish(job, e)
                item.done = true
                item.error = e.message
            } catch (e: IOException) {
                return retryOrFinish(job, e)
            }

            doneBytes += item.size
            Outbox.save(applicationContext, job)
        }

        return finish(job, fatal = null)
    }

    private fun retryOrFinish(job: Outbox.Job, error: Exception): Result {
        Outbox.save(applicationContext, job)
        if (runAttemptCount < MAX_RUN_ATTEMPTS) return Result.retry()
        return finish(job, fatal = error.message ?: "Bağlantı hatası.")
    }

    private fun finish(job: Outbox.Job, fatal: String?): Result {
        val sent = job.items.count { it.done && it.error == null }
        val failed = job.items.filter { it.error != null }
        val total = job.items.size

        val (title, text) = when {
            fatal != null -> "Gönderilemedi" to "${job.channel}: $fatal" + if (sent > 0) " ($sent/$total gönderildi)" else ""
            failed.isEmpty() -> "Gönderildi ✓" to (if (total == 1) "${job.items[0].name} → ${job.channel}" else "$total öğe ${job.channel} kanalına gönderildi")
            else -> "Kısmen gönderildi" to "$sent/$total gönderildi. " + failed.joinToString("; ") { "${it.name}: ${it.error}" }
        }
        notify(RESULT_ID_OFFSET + notificationId, resultNotification(title, text))

        Outbox.delete(applicationContext, job.id)
        return if (fatal == null) Result.success() else Result.failure()
    }

    // --------------------------------------------------------------------------------------------
    // Notifications

    private fun updateProgress(label: String, done: Long, total: Long, force: Boolean = false) {
        val now = SystemClock.elapsedRealtime()
        if (!force && now - lastProgressUpdate < PROGRESS_INTERVAL_MS) return // keep binder traffic low
        lastProgressUpdate = now
        val percent = ((done * 100) / total).toInt().coerceIn(0, 100)
        notify(notificationId, progressNotification(label, percent, 100))
    }

    private fun progressNotification(text: String, progress: Int, max: Int): Notification =
        NotificationCompat.Builder(applicationContext, UlakApp.CHANNEL_UPLOADS)
            .setSmallIcon(R.drawable.ic_stat_ulak)
            .setColor(0xFF38BDF8.toInt())
            .setContentTitle("$channel kanalına gönderiliyor")
            .setContentText(text)
            .setProgress(max, progress, max == 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(0, "İptal", WorkManager.getInstance(applicationContext).createCancelPendingIntent(id))
            .build()

    private fun resultNotification(title: String, text: String): Notification {
        val open = Intent(Intent.ACTION_VIEW, Uri.parse(ChannelCode.webUrl(channel)), applicationContext, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(
            applicationContext, notificationId, open,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(applicationContext, UlakApp.CHANNEL_RESULTS)
            .setSmallIcon(R.drawable.ic_stat_ulak)
            .setColor(0xFF38BDF8.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
    }

    private fun foregroundInfo(notification: Notification): ForegroundInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, notification)
        }

    private fun notify(id: Int, notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        NotificationManagerCompat.from(applicationContext).notify(id, notification)
    }

    companion object {
        private const val KEY_JOB = "job"
        private const val KEY_CHANNEL = "channel"
        private const val MAX_RUN_ATTEMPTS = 4
        private const val PROGRESS_INTERVAL_MS = 400L
        private const val RESULT_ID_OFFSET = 1_000_000

        fun enqueue(context: Context, job: Outbox.Job) {
            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setInputData(workDataOf(KEY_JOB to job.id, KEY_CHANNEL to job.channel))
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .addTag("upload")
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("upload-${job.id}", ExistingWorkPolicy.KEEP, request)
        }
    }
}
