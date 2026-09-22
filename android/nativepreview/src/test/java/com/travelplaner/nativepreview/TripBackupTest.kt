package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TripBackupTest {
    @Test fun actualSystemPickerExportsRemainLossless() {
        listOf("ios-export.json", "android-export.json").forEach { name ->
            val bytes = contractBytes(name); val raw = Json.parseToJsonElement(bytes.decodeToString()).jsonObject
            val candidate = TripBackup.decode(bytes)
            assertTrue(candidate.warnings.isEmpty()); assertEquals(raw, candidate.trip.json)
            assertEquals(raw, TripBackup.decode(TripBackup.encode(candidate.trip)).trip.json)
            assertEquals("2026-10-11", candidate.trip.endDate)
            assertEquals(500, raw.getValue("expenses").jsonArray[0].jsonObject.getValue("amount").jsonPrimitive.int)
            assertEquals(Json.parseToJsonElement("""{"keep":[true,null,"[quoted]"]}"""), raw["futureRoot"])
            assertNull(raw["sharedManagementToken"])
        }
    }
    @Test fun portablePhotoFixturesDecodeOnNativeImport() {
        listOf("memory-ios-export.json", "memory-android-export.json").forEach { name ->
            val candidate = TripBackup.decode(contractBytes(name))
            val entry = candidate.trip.json.getValue("journalEntries").jsonArray[0].jsonObject
            val encoded = entry.getValue("imageDataUrl").jsonPrimitive.content.substringAfter(',')
            val image = java.util.Base64.getDecoder().decode(encoded)
            assertEquals("431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460", TripBackup.hash(image))
            assertNull(entry["imageFileName"])
        }
    }
    @Test fun legacyRepairsAreDeterministicAndOriginalPreserved() {
        val bytes = contractBytes("legacy-trip-backup.json"); val candidate = TripBackup.decode(bytes)
        assertArrayEquals(bytes, candidate.sourceBytes); assertEquals(TripBackup.hash(bytes), candidate.sourceHash)
        assertEquals("import-${candidate.sourceHash}", candidate.trip.id); assertEquals("2026-10-11", candidate.trip.endDate)
        assertEquals(0L, candidate.trip.updatedAt); assertTrue(candidate.warnings.size > 5)
        val item = TripSchedule.items(ScheduleSection.Day(1), candidate.trip)[0]
        assertEquals("import-${candidate.sourceHash}-day-1-item-0", item["id"]!!.jsonPrimitive.content)
        assertEquals(35.1, item["lat"]!!.jsonPrimitive.double, 0.0); assertNotNull(item["futurePhoto"])
        assertNull(candidate.trip.json["sharedId"])
        val exported = TripBackup.encode(candidate.trip)
        assertFalse(exported.decodeToString().contains("sharedManagementToken"))
        assertEquals(candidate.trip.json, TripBackup.decode(exported).trip.json)
        assertEquals(candidate.trip.json, TripBackup.decode(bytes).trip.json)
    }
    @Test fun currentWebAndBomAndFilename() {
        val bytes = contractBytes("trip.json"); val candidate = TripBackup.decode(bytes)
        val raw = Json.parseToJsonElement(bytes.decodeToString()).jsonObject
        listOf("expenses", "futureField", "budgetSettings", "itinerary").forEach { assertEquals(raw[it], candidate.trip.json[it]) }
        assertEquals(candidate.trip.id, TripBackup.decode(byteArrayOf(0xef.toByte(), 0xbb.toByte(), 0xbf.toByte()) + bytes).trip.id)
        assertEquals("a_b_c_-backup.json", TripBackup.filename("a/b\\c\n"))
    }
    @Test fun importDropsExternalPhotoReferenceButPreservesEmbeddedPhotoAndSourceBytes() {
        val raw = Json.parseToJsonElement(contractBytes("schedule-edit.json").decodeToString()).jsonObject
        val embedded = "data:image/png;base64,AA=="
        val journal = buildJsonObject {
            put("id", "j1"); put("date", "2026-10-10"); put("title", "사진"); put("body", "")
            put("imageFileName", "local-photo.png"); put("imageDataUrl", embedded)
        }
        val bytes = JsonObject(raw + ("journalEntries" to JsonArray(listOf(journal)))).toString().encodeToByteArray()
        val candidate = TripBackup.decode(bytes)
        val entry = candidate.trip.json.getValue("journalEntries").jsonArray[0].jsonObject
        assertNull(entry["imageFileName"])
        assertEquals(embedded, entry["imageDataUrl"]!!.jsonPrimitive.content)
        assertTrue(candidate.warnings.any { it.contains("외부 사진") })
        assertArrayEquals(bytes, candidate.sourceBytes)
    }
    @Test fun wrongValuesAreNotRepaired() {
        val raw = Json.parseToJsonElement(contractBytes("schedule-edit.json").decodeToString()).jsonObject
        mapOf("country" to JsonNull, "reserveItems" to JsonPrimitive("bad"), "expenses" to JsonNull, "startDate" to JsonPrimitive("2026-02-30"), "createdAt" to JsonPrimitive(true)).forEach { (key, value) ->
            assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(JsonObject(raw + (key to value)).toString().encodeToByteArray()) }
        }
        listOf("[]", "{}", "```json\n{}\n```", "bad").forEach { assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(it.encodeToByteArray()) } }
        val days = raw.getValue("itinerary").jsonArray.toMutableList(); val items = days[0].jsonObject.getValue("items").jsonArray.toMutableList()
        items[0] = JsonObject(items[0].jsonObject + ("time" to JsonPrimitive("24:00")))
        days[0] = JsonObject(days[0].jsonObject + ("items" to JsonArray(items)))
        assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(JsonObject(raw + ("itinerary" to JsonArray(days))).toString().encodeToByteArray()) }
        items[0] = JsonObject(items[0].jsonObject + mapOf("time" to JsonPrimitive(""), "id" to JsonPrimitive("1")))
        days[0] = JsonObject(days[0].jsonObject + ("items" to JsonArray(items)))
        assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(JsonObject(raw + ("itinerary" to JsonArray(days))).toString().encodeToByteArray()) }
    }
    @Test fun limitsAndQuotedDepth() {
        assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(ByteArray(TripBackup.maxBytes + 1)) }
        val raw = Json.parseToJsonElement(contractBytes("schedule-edit.json").decodeToString()).jsonObject
        TripBackup.decode(JsonObject(raw + ("quoted" to JsonPrimitive("[\\\"".repeat(100)))).toString().encodeToByteArray())
        var deep: JsonElement = JsonPrimitive("value"); repeat(64) { deep = JsonArray(listOf(deep)) }
        assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(JsonObject(raw + ("deep" to deep)).toString().encodeToByteArray()) }
        val many = JsonArray(List(10001) { buildJsonObject { put("id", "p-$it"); put("name", "place") } })
        assertThrows(IllegalArgumentException::class.java) { TripBackup.decode(JsonObject(raw + ("reserveItems" to many)).toString().encodeToByteArray()) }
    }
}
