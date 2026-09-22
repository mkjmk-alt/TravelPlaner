package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

class MemoryBackupTest {
    @Test fun localPhotoBecomesPortableDataUrl() {
        val trip = fixture()
        val source = portablePng()
        val exported = MemoryBackup.encode(trip) { if (it == "photo.png") source else null }
        val entry = Json.parseToJsonElement(exported.decodeToString()).jsonObject["journalEntries"]!!.jsonArray[0].jsonObject
        assertNull(entry["imageFileName"])
        val encoded = entry["imageDataUrl"]!!.jsonPrimitive.content.substringAfter(',')
        val decoded = Base64.getDecoder().decode(encoded)
        assertArrayEquals(source, decoded)
        assertEquals(68, decoded.size)
        assertEquals("431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460", TripBackup.hash(decoded))
    }

    @Test fun embeddedPhotoIsPreservedWhenThereIsNoLocalReference() {
        val source = portablePng()
        val dataUrl = "data:image/png;base64,${Base64.getEncoder().encodeToString(source)}"
        val raw = fixture().json.toMutableMap()
        raw["journalEntries"] = JsonArray(listOf(buildJsonObject {
            put("id", "embedded"); put("date", "2026-10-10"); put("title", "사진"); put("body", ""); put("imageDataUrl", dataUrl)
        }))
        val exported = MemoryBackup.encode(TripDocument.parse(JsonObject(raw).toString())) {
            fail("이미 포함된 사진은 로컬 파일을 다시 읽으면 안 됩니다.")
            null
        }
        val entry = Json.parseToJsonElement(exported.decodeToString()).jsonObject["journalEntries"]!!.jsonArray[0].jsonObject
        assertEquals(dataUrl, entry["imageDataUrl"]!!.jsonPrimitive.content)
    }

    @Test fun portableExportEnforcesTheTwentyMiBBoundary() {
        val below = encodeTripWithBody(TripBackup.maxBytes - 1024)
        assertTrue(below.size <= TripBackup.maxBytes)
        assertThrows(IllegalArgumentException::class.java) { encodeTripWithBody(TripBackup.maxBytes + 1024) }
    }

    @Test fun missingPhotoFailsAndTripIsNotMutated() {
        val trip = fixture(); assertThrows(IllegalArgumentException::class.java) { MemoryBackup.encode(trip) { null } }
        assertEquals("photo.png", trip.json["journalEntries"]!!.jsonArray[0].jsonObject["imageFileName"]!!.jsonPrimitive.content)
    }

    private fun fixture(): TripDocument {
        val raw = TripDocument.create(TripDraft("사진 여행", "일본", "2026-10-10", "2026-10-10"), "memory-backup", 1).json.toMutableMap()
        raw["journalEntries"] = JsonArray(listOf(buildJsonObject { put("id", "j1"); put("date", "2026-10-10"); put("title", "사진"); put("body", ""); put("imageFileName", "photo.png") }))
        return TripDocument.parse(JsonObject(raw).toString())
    }

    private fun encodeTripWithBody(length: Int): ByteArray {
        val raw = fixture().json.toMutableMap()
        raw["journalEntries"] = JsonArray(listOf(buildJsonObject {
            put("id", "large"); put("date", "2026-10-10"); put("title", "경계"); put("body", "a".repeat(length))
        }))
        return MemoryBackup.encode(TripDocument.parse(JsonObject(raw).toString())) { null }
    }

    private fun portablePng(): ByteArray = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
}
