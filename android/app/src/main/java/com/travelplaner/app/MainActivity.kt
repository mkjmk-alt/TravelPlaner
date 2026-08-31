package com.travelplaner.app

import android.Manifest
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
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

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var geolocationCallback: GeolocationPermissions.Callback? = null
    private var geolocationOrigin: String? = null
    private var pendingDownloadData: ByteArray? = null
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
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
        }
        offlineView = createOfflineView()
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(progressBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { gravity = Gravity.TOP })
        root.addView(offlineView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        val initialUrl = intent?.data?.let { AppConfig.deepLinkToWebUrl(it) } ?: AppConfig.PRODUCTION_URL
        if (savedInstanceState == null) webView.loadUrl(initialUrl) else webView.restoreState(savedInstanceState)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
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
                mediaPlaybackRequiresUserGesture = false
                setGeolocationEnabled(true)
                builtInZoomControls = false
                displayZoomControls = false
                userAgentString = "$userAgentString TravelPlanerAndroid/1.0"
            }
            webViewClient = TravelWebViewClient()
            webChromeClient = TravelChromeClient()
            setDownloadListener(TravelDownloadListener())
            addJavascriptInterface(NativeDownloadBridge(), "TravelPlanerAndroid")
        }
    }

    private inner class NativeDownloadBridge {
        @JavascriptInterface
        fun saveBase64File(fileName: String, dataUrl: String) {
            runOnUiThread {
                val currentHost = webView.url?.let { Uri.parse(it).host }
                val productionHost = Uri.parse(AppConfig.PRODUCTION_URL).host
                val encoded = dataUrl.substringAfter(',', "")
                if (currentHost != productionHost || encoded.isEmpty() || encoded.length > MAX_BASE64_LENGTH) return@runOnUiThread

                try {
                    pendingDownloadData = Base64.decode(encoded, Base64.DEFAULT)
                    val safeName = fileName.replace(Regex("[/\\\\]"), "-").ifBlank { "TravelPlaner-file" }
                    createDocumentLauncher.launch(safeName)
                } catch (_: IllegalArgumentException) {
                    pendingDownloadData = null
                    Toast.makeText(this@MainActivity, R.string.download_failed, Toast.LENGTH_SHORT).show()
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
                val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val resolvedMimeType = mimeType.ifBlank {
                    MimeTypeMap.getSingleton().getMimeTypeFromExtension(fileName.substringAfterLast('.')).orEmpty()
                }
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    if (resolvedMimeType.isNotBlank()) setMimeType(resolvedMimeType)
                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url).orEmpty())
                    addRequestHeader("User-Agent", userAgent)
                    setTitle(fileName)
                    setDescription(getString(R.string.download_description))
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                }
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                Toast.makeText(this@MainActivity, R.string.download_started, Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {
                Toast.makeText(this@MainActivity, R.string.download_failed, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handleNavigation(uri: Uri): Boolean {
        if (AppConfig.shouldOpenExternally(uri)) return openExternal(uri)
        return !AppConfig.isWebUrl(uri)
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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.let { webView.loadUrl(AppConfig.deepLinkToWebUrl(it)) }
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
}
