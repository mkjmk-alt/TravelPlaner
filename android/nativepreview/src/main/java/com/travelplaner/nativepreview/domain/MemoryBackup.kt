package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.*

object MemoryBackup {
    fun encode(trip: TripDocument, imageResolver: (String) -> ByteArray?): ByteArray {
        val root = buildJsonObject {
            trip.json.forEach { (key, value) -> if (key != "sharedId" && key != "sharedManagementToken") put(key, value) }
            val entries = trip.json["journalEntries"]?.jsonArray
            if (entries != null) {
                put("journalEntries", JsonArray(entries.map { element ->
                    val entry = element.jsonObject.toMutableMap()
                    val fileName = entry["imageFileName"]?.jsonPrimitive?.contentOrNull
                    if (fileName != null) {
                        val bytes = imageResolver(fileName) ?: throw IllegalArgumentException("기록 사진을 찾지 못했어요.")
                        entry["imageDataUrl"] = JsonPrimitive(dataUrl(bytes))
                        entry.remove("imageFileName")
                    }
                    JsonObject(entry)
                }))
            }
        }
        val bytes = root.toString().encodeToByteArray()
        require(bytes.size <= TripBackup.maxBytes) { "백업은 최대 20 MiB까지 내보낼 수 있어요." }
        return bytes
    }

    private fun dataUrl(bytes: ByteArray): String {
        val png = bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))
        return "data:${if (png) "image/png" else "image/jpeg"};base64,${java.util.Base64.getEncoder().encodeToString(bytes)}"
    }
}
