package com.travelplaner.nativepreview.map

object MapConfiguration {
    fun key(raw: String?): String? = raw?.trim()?.takeIf { it.isNotEmpty() && !it.contains("$(") && !it.contains("\${") && !it.startsWith("YOUR_") }
    fun <T> makeIfConfigured(raw: String?,factory: (String)->T): T? = key(raw)?.let(factory)
}
