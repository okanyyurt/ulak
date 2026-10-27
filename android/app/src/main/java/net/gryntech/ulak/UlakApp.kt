package net.gryntech.ulak

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import net.gryntech.ulak.upload.Outbox
import kotlin.concurrent.thread

class UlakApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        // Staged copies of shared files never outlive a failed/abandoned upload for long
        thread(name = "outbox-cleanup", isDaemon = true) { Outbox.deleteStaleJobs(this) }
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_UPLOADS, getString(R.string.channel_uploads), NotificationManager.IMPORTANCE_LOW).apply {
                    description = getString(R.string.channel_uploads_desc)
                    setShowBadge(false)
                },
                NotificationChannel(CHANNEL_RESULTS, getString(R.string.channel_results), NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = getString(R.string.channel_results_desc)
                }
            )
        )
    }

    companion object {
        const val CHANNEL_UPLOADS = "uploads"
        const val CHANNEL_RESULTS = "upload_results"
    }
}
