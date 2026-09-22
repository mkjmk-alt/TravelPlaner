package com.travelplaner.app

import android.net.Uri

object AppConfig {
    val WEB_BASE_URL: String = BuildConfig.WEB_BASE_URL
    val WEB_ORIGIN: String = BuildConfig.WEB_ORIGIN
    private const val AUTHENTICATION_HOST = "eiktqxrgsjrtmoyzuupn.supabase.co"
    private const val AUTH_CALLBACK_SCHEME = "travelplaner"
    private const val AUTH_CALLBACK_HOST = "auth"
    private const val AUTH_CALLBACK_PATH = "/callback"

    private val webSchemes = setOf("http", "https")
    private val externalSchemes = setOf("tel", "mailto", "sms", "geo", "market")

    fun isInternalWebUrl(uri: Uri): Boolean {
        val configured = Uri.parse(WEB_BASE_URL)
        val configuredPort = configured.port.takeUnless { it == -1 } ?: defaultPort(configured.scheme)
        val actualPort = uri.port.takeUnless { it == -1 } ?: defaultPort(uri.scheme)
        return uri.scheme?.lowercase() == configured.scheme?.lowercase() &&
            uri.host?.lowercase() == configured.host?.lowercase() &&
            actualPort == configuredPort
    }

    private fun defaultPort(scheme: String?): Int = if (scheme?.lowercase() == "https") 443 else 80

    fun canOpenExternally(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        return scheme in externalSchemes || (scheme in webSchemes && !isInternalWebUrl(uri))
    }

    fun isAllowedAuthenticationUrl(uri: Uri): Boolean =
        uri.scheme?.lowercase() == "https" && uri.host?.lowercase() == AUTHENTICATION_HOST

    fun isAuthenticationCallback(uri: Uri): Boolean =
        uri.scheme?.lowercase() == AUTH_CALLBACK_SCHEME &&
            uri.host?.lowercase() == AUTH_CALLBACK_HOST &&
            uri.path == AUTH_CALLBACK_PATH

    fun shouldOpenExternally(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme in externalSchemes) return true
        return scheme in webSchemes && !isInternalWebUrl(uri)
    }

    fun deepLinkToWebUrl(uri: Uri): String {
        if (!isAuthenticationCallback(uri)) return WEB_BASE_URL
        val path = uri.path?.ifBlank { "/" } ?: "/"
        val query = uri.encodedQuery?.let { "?$it" }.orEmpty()
        val fragment = uri.encodedFragment?.let { "#$it" }.orEmpty()
        return WEB_BASE_URL.trimEnd('/') + path + query + fragment
    }
}
