package net.gryntech.ulak.main

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import net.gryntech.ulak.BuildConfig
import net.gryntech.ulak.ui.UlakColors
import net.gryntech.ulak.ui.UlakTheme

/** The live site (https://ulak.gryntech.net) in a WebView that can only ever show that site. */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var loadProgress by mutableIntStateOf(0)
    private var offline by mutableStateOf(false)
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingLegacyDownload: (() -> Unit)? = null

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    private val storagePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) pendingLegacyDownload?.invoke() else toast("Kaydetmek için depolama izni gerekli.")
        pendingLegacyDownload = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        webView = createWebView()
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(startUrl(intent))
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        setContent {
            UlakTheme {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(UlakColors.Background)
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                ) {
                    AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
                    if (loadProgress in 1..99) {
                        LinearProgressIndicator(progress = { loadProgress / 100f }, modifier = Modifier.fillMaxWidth())
                    }
                    if (offline) OfflineScreen()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        webView.loadUrl(startUrl(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        webView.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------------------------------------

    /** Deep links and notifications may open a channel; anything off-site falls back to the home page. */
    private fun startUrl(intent: Intent?): String {
        val data = intent?.data
        return if (data != null && isOwnSite(data)) data.toString() else BuildConfig.BASE_URL + "/"
    }

    private fun isOwnSite(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host.equals(BuildConfig.SITE_HOST, ignoreCase = true)

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        return WebView(this).apply {
            setBackgroundColor(0xFF0B1220.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportMultipleWindows(false)
                javaScriptCanOpenWindowsAutomatically = false
                setGeolocationEnabled(false)
                mediaPlaybackRequiresUserGesture = true
                safeBrowsingEnabled = true
                userAgentString = "$userAgentString UlakAndroid/${BuildConfig.VERSION_NAME}"
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false) // the site is already dark
            }
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    return when {
                        isOwnSite(uri) -> false
                        uri.scheme == "data" -> {
                            handleDataDownload(uri.toString(), null)
                            true
                        }
                        else -> {
                            openExternally(uri)
                            true
                        }
                    }
                }

                override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                    offline = false
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) offline = true
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    loadProgress = newProgress
                }

                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    return try {
                        fileChooser.launch(params.createIntent())
                        true
                    } catch (e: ActivityNotFoundException) {
                        fileCallback = null
                        false
                    }
                }

                // Camera, microphone etc. are never granted to web content
                override fun onPermissionRequest(request: PermissionRequest) = request.deny()
            }

            setDownloadListener { url, _, contentDisposition, mimeType, _ ->
                val uri = Uri.parse(url)
                when {
                    uri.scheme == "data" -> handleDataDownload(url, null)
                    isOwnSite(uri) -> runWithLegacyStorage {
                        val name = Downloads.enqueue(this@MainActivity, url, contentDisposition, mimeType)
                        toast("İndiriliyor: $name")
                    }
                    else -> openExternally(uri)
                }
            }
        }
    }

    private fun handleDataDownload(dataUrl: String, name: String?) = runWithLegacyStorage {
        try {
            val saved = Downloads.saveDataUrl(this, dataUrl, name)
            toast("İndirilenler/Ulak klasörüne kaydedildi: $saved")
        } catch (e: Exception) {
            toast(e.message ?: "Kaydedilemedi.")
        }
    }

    /** Android 8–9 need the storage permission to write into the public Downloads folder. */
    private fun runWithLegacyStorage(action: () -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingLegacyDownload = action
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else {
            action()
        }
    }

    private fun openExternally(uri: Uri) {
        if (uri.scheme != "https" && uri.scheme != "http" && uri.scheme != "mailto") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            toast("Bu bağlantıyı açacak uygulama bulunamadı.")
        }
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    @androidx.compose.runtime.Composable
    private fun OfflineScreen() {
        Column(
            Modifier.fillMaxSize().background(UlakColors.Background).padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("📡", style = MaterialTheme.typography.displayMedium)
            Spacer(Modifier.height(12.dp))
            Text("Bağlantı kurulamadı", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(6.dp))
            Text(
                "İnternet bağlantınızı kontrol edin. Paylaşımlar, bağlantı geldiğinde arka planda otomatik gönderilir.",
                style = MaterialTheme.typography.bodyMedium,
                color = UlakColors.TextMuted,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(18.dp))
            Button(onClick = { offline = false; webView.reload() }) { Text("Tekrar dene") }
        }
    }
}
