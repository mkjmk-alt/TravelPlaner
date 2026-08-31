package com.travelplaner.app

import android.net.Uri

object AppConfig {
    const val PRODUCTION_URL = "https://travelplaner-545.pages.dev/"

    private val webSchemes = setOf("http", "https")
    private val externalSchemes = setOf("tel", "mailto", "sms", "geo", "market")

    fun isWebUrl(uri: Uri): Boolean = uri.scheme?.lowercase() in webSchemes

    fun shouldOpenExternally(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme in externalSchemes) return true
        if (scheme !in webSchemes) return true
        val host = uri.host?.lowercase().orEmpty()
        val path = uri.path?.lowercase().orEmpty()
        return host == "maps.apple.com" || (host.endsWith("google.com") && path.startsWith("/maps"))
    }

    fun deepLinkToWebUrl(uri: Uri): String {
        val path = uri.path?.ifBlank { "/" } ?: "/"
        val query = uri.encodedQuery?.let { "?$it" }.orEmpty()
        return PRODUCTION_URL.trimEnd('/') + path + query
    }
}
