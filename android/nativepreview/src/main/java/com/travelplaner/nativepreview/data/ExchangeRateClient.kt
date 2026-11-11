package com.travelplaner.nativepreview.data

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

data class ExchangeRateSnapshot(
    val rates: Map<String, Double>,
    val updatedAtMillis: Long,
    val fetchedAtMillis: Long,
    val isStale: Boolean = false,
) {
    fun krwPerUnit(currency: String): Double? {
        val code = currency.uppercase()
        if (code == "KRW") return 1.0
        val currencyPerKrw = rates[code]?.takeIf { it.isFinite() && it > 0 } ?: return null
        return 1.0 / currencyPerKrw
    }
}

object ExchangeRateClient {
    private const val cacheLifetimeMillis = 6 * 60 * 60 * 1000L
    private val mutex = Mutex()
    private var cachedSnapshot: ExchangeRateSnapshot? = null

    suspend fun latestSnapshot(now: Long = System.currentTimeMillis()): ExchangeRateSnapshot {
        mutex.lock()
        try {
            cachedSnapshot?.takeIf { now - it.fetchedAtMillis < cacheLifetimeMillis }?.let { return it }
            return try {
                fetch(now).also { cachedSnapshot = it }
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Exception) {
                cachedSnapshot?.copy(isStale = true) ?: throw error
            }
        } finally {
            mutex.unlock()
        }
    }

    private suspend fun fetch(now: Long): ExchangeRateSnapshot = withContext(Dispatchers.IO) {
        val connection = URL("https://open.er-api.com/v6/latest/KRW").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            val status = connection.responseCode
            require(status in 200..299) { "환율 서버에 연결할 수 없어요." }
            val payload = Json.parseToJsonElement(connection.inputStream.bufferedReader().use { it.readText() }).jsonObject
            require(payload["result"]?.jsonPrimitive?.content == "success") { "환율 응답을 확인할 수 없어요." }
            require(payload["base_code"]?.jsonPrimitive?.content == "KRW") { "환율 기준 통화가 올바르지 않아요." }
            val rates = payload["rates"]?.jsonObject?.mapNotNull { (code, value) ->
                value.jsonPrimitive.doubleOrNull?.takeIf { it.isFinite() && it > 0 }?.let { code.uppercase() to it }
            }?.toMap().orEmpty()
            require(kotlin.math.abs((rates["KRW"] ?: 0.0) - 1.0) < 0.000001) { "환율 기준 통화가 올바르지 않아요." }
            val updatedAt = payload["time_last_update_unix"]?.jsonPrimitive?.longOrNull?.times(1000) ?: now
            ExchangeRateSnapshot(rates, updatedAt, now)
        } finally {
            connection.disconnect()
        }
    }
}
