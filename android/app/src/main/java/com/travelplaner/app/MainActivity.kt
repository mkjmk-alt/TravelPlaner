package com.travelplaner.app

import android.Manifest
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.GeolocationPermissions
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var geolocationCallback: GeolocationPermissions.Callback? = null
    private var geolocationOrigin: String? = null
    private var pendingDownloadData: ByteArray? = null
    private var pendingWebDownload: WebDownload? = null
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileChooserCallback?.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        )
        fileChooserCallback = null
    }
    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        geolocationCallback?.invoke(geolocationOrigin, granted, false)
        geolocationCallback = null
        geolocationOrigin = null
    }
    private val storagePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val download = pendingWebDownload
        pendingWebDownload = null
        if (granted && download != null) {
            enqueueWebDownload(download)
        } else if (!granted) {
            Toast.makeText(this, R.string.download_permission_denied, Toast.LENGTH_SHORT).show()
        }
    }
    private val createDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream")
    ) { uri ->
        val data = pendingDownloadData
        pendingDownloadData = null
        if (uri == null || data == null) return@registerForActivityResult
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(data) }
                ?: error("Output stream is unavailable")
            Toast.makeText(this, R.string.download_saved, Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        val root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
        webView = createWebView()
        WebView.setWebContentsDebuggingEnabled(
            applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        )
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
        }
        offlineView = createOfflineView()
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(progressBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { gravity = Gravity.TOP })
        root.addView(offlineView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        val initialUrl = intent?.data
            ?.takeIf(AppConfig::isAuthenticationCallback)
            ?.let(AppConfig::deepLinkToWebUrl)
            ?: AppConfig.PRODUCTION_URL
        if (savedInstanceState == null) webView.loadUrl(initialUrl) else webView.restoreState(savedInstanceState)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    """
                    (() => {
                      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
                      const dialog = dialogs.reverse().find((element) => {
                        const style = window.getComputedStyle(element);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                      });
                      const closeButton = dialog?.querySelector('button[aria-label*="닫기"]');
                      if (!closeButton) return false;
                      closeButton.click();
                      return true;
                    })()
                    """.trimIndent()
                ) { handled ->
                    if (handled == "true") return@evaluateJavascript
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })
    }

    private fun createWebView(): WebView {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        return WebView(this).apply {
            setBackgroundColor(Color.WHITE)
            cookieManager.setAcceptThirdPartyCookies(this, true)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                safeBrowsingEnabled = true
                mediaPlaybackRequiresUserGesture = false
                setGeolocationEnabled(true)
                builtInZoomControls = false
                displayZoomControls = false
                userAgentString = "$userAgentString TravelPlanerAndroid/1.0"
            }
            webViewClient = TravelWebViewClient()
            webChromeClient = TravelChromeClient()
            setDownloadListener(TravelDownloadListener())
            configureNativeBridge(this)
        }
    }

    private fun configureNativeBridge(target: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return

        WebViewCompat.addWebMessageListener(
            target,
            "TravelPlanerAndroid",
            setOf(AppConfig.PRODUCTION_ORIGIN)
        ) { _, message, sourceOrigin, isMainFrame, _ ->
            if (!isMainFrame || !AppConfig.isInternalWebUrl(sourceOrigin)) return@addWebMessageListener
            val payload = message.data?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return@addWebMessageListener
            runOnUiThread { handleNativeMessage(payload) }
        }
    }

    private fun handleNativeMessage(payload: JSONObject) {
        when (payload.optString("type")) {
            "openAuth" -> {
                val authUri = payload.optString("url")
                    .takeIf(String::isNotBlank)
                    ?.let { runCatching { Uri.parse(it) }.getOrNull() }
                if (authUri != null && AppConfig.isAllowedAuthenticationUrl(authUri)) {
                    openExternal(authUri)
                }
            }

            "saveBase64File" -> {
                val encoded = payload.optString("dataUrl").substringAfter(',', "")
                if (encoded.isEmpty() || encoded.length > MAX_BASE64_LENGTH) return
                try {
                    pendingDownloadData = Base64.decode(encoded, Base64.DEFAULT)
                    createDocumentLauncher.launch(sanitizeFileName(payload.optString("fileName")))
                } catch (_: IllegalArgumentException) {
                    pendingDownloadData = null
                    Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private inner class TravelWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = handleNavigation(request.url)

        @Deprecated("Deprecated in Android")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleNavigation(Uri.parse(url))

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            CookieManager.getInstance().flush()
            progressBar.visibility = View.GONE
            offlineView.visibility = View.GONE
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) {
                progressBar.visibility = View.GONE
                offlineView.visibility = if (isOnline()) View.GONE else View.VISIBLE
            }
        }
    }

    private inner class TravelChromeClient : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progressBar.progress = newProgress
            progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            val originUri = runCatching { Uri.parse(origin) }.getOrNull()
            if (originUri == null || !AppConfig.isInternalWebUrl(originUri)) {
                callback.invoke(origin, false, false)
                return
            }
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(origin, true, false)
            } else {
                geolocationOrigin = origin
                geolocationCallback = callback
                locationPermissionLauncher.launch(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                )
            }
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                request.deny()
            }
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams
        ): Boolean {
            val currentUri = webView.url?.let(Uri::parse)
            if (currentUri == null || !AppConfig.isInternalWebUrl(currentUri)) {
                filePathCallback.onReceiveValue(null)
                return false
            }
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback
            return try {
                fileChooserLauncher.launch(fileChooserParams.createIntent())
                true
            } catch (_: ActivityNotFoundException) {
                fileChooserCallback = null
                Toast.makeText(this@MainActivity, R.string.no_file_picker, Toast.LENGTH_SHORT).show()
                false
            }
        }
    }

    private inner class TravelDownloadListener : DownloadListener {
        override fun onDownloadStart(
            url: String,
            userAgent: String,
            contentDisposition: String,
            mimeType: String,
            contentLength: Long
        ) {
            try {
                val downloadUri = Uri.parse(url)
                if (!AppConfig.isInternalWebUrl(downloadUri)) {
                    openExternal(downloadUri)
                    return
                }
                val fileName = sanitizeFileName(URLUtil.guessFileName(url, contentDisposition, mimeType))
                val resolvedMimeType = mimeType.ifBlank {
                    MimeTypeMap.getSingleton().getMimeTypeFromExtension(fileName.substringAfterLast('.')).orEmpty()
                }
                val download = WebDownload(url, userAgent, fileName, resolvedMimeType)
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
                    checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
                ) {
                    pendingWebDownload = download
                    storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                } else {
                    enqueueWebDownload(download)
                }
            } catch (_: Exception) {
                Toast.makeText(this@MainActivity, R.string.download_failed, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun enqueueWebDownload(download: WebDownload) {
        try {
            val request = DownloadManager.Request(Uri.parse(download.url)).apply {
                if (download.mimeType.isNotBlank()) setMimeType(download.mimeType)
                addRequestHeader("Cookie", CookieManager.getInstance().getCookie(download.url).orEmpty())
                addRequestHeader("User-Agent", download.userAgent)
                setTitle(download.fileName)
                setDescription(getString(R.string.download_description))
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, download.fileName)
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
        }
    }

    private fun handleNavigation(uri: Uri): Boolean {
        if (AppConfig.isInternalWebUrl(uri)) return false
        if (AppConfig.shouldOpenExternally(uri) && AppConfig.canOpenExternally(uri)) return openExternal(uri)
        return true
    }

    private fun openExternal(uri: Uri): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, uri))
        true
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(this, R.string.no_matching_app, Toast.LENGTH_SHORT).show()
        true
    }

    private fun createOfflineView(): View {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(Color.WHITE)
            visibility = View.GONE
        }
        layout.addView(TextView(this).apply {
            text = getString(R.string.offline_title)
            textSize = 20f
            setTextColor(Color.rgb(31, 41, 55))
            gravity = Gravity.CENTER
        })
        layout.addView(TextView(this).apply {
            text = getString(R.string.offline_message)
            textSize = 14f
            setTextColor(Color.rgb(107, 114, 128))
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(18))
        })
        layout.addView(Button(this).apply {
            text = getString(R.string.retry)
            setOnClickListener {
                offlineView.visibility = View.GONE
                webView.reload()
            }
        })
        return layout
    }

    private fun isOnline(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun sanitizeFileName(fileName: String): String {
        val sanitized = fileName
            .replace(Regex("[/\\\\:\\p{Cntrl}]"), "-")
            .trim()
        return sanitized.takeUnless { it.isBlank() || it == "." || it == ".." }
            ?: "TravelPlaner-file"
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data
            ?.takeIf(AppConfig::isAuthenticationCallback)
            ?.let { webView.loadUrl(AppConfig.deepLinkToWebUrl(it)) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        webView.apply {
            stopLoading()
            webChromeClient = null
            removeAllViews()
            destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val MAX_BASE64_LENGTH = 34 * 1024 * 1024
    }

    private data class WebDownload(
        val url: String,
        val userAgent: String,
        val fileName: String,
        val mimeType: String
    )
}
