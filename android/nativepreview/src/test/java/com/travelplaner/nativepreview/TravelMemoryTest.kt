package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.MemoryRowSelector
import com.travelplaner.nativepreview.domain.MemoryChange
import com.travelplaner.nativepreview.domain.TripDocument
import com.travelplaner.nativepreview.domain.TripDraft
import com.travelplaner.nativepreview.domain.TripMemory
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TravelMemoryTest {
    private fun fixture(): TripDocument = TripDocument.parse(requireNotNull(javaClass.getResource("/memory-prep.json")).readText())

    @Test fun reducerChangesOneChecklistRowAndPreservesUnknownFields() {
        val trip = fixture()
        val row = trip.json.getValue("checklist").jsonArray[0].jsonObject
        val next = TripMemory.apply(
            MemoryChange.SetChecklistChecked(MemoryRowSelector.string("passport", row), false), trip, 200
        )
        val updated = next.json.getValue("checklist").jsonArray[0].jsonObject
        assertEquals(JsonPrimitive(false), updated["checked"])
        assertEquals(JsonPrimitive(true), updated["future"]!!.jsonObject["keep"])
        assertEquals(JsonPrimitive(true), next.json.getValue("futureRoot").jsonObject["mustSurvive"])
        assertTrue(next.updatedAt > trip.updatedAt)
    }

    @Test fun replayOfSameAddIsIdempotentAndConflictingOperationFails() {
        val trip = fixture()
        val entry = buildJsonObject { put("id", "new"); put("date", "2026-10-12"); put("title", "새 기록"); put("body", "내용"); put("createdAt", 200); put("updatedAt", 200) }
        val first = TripMemory.apply(MemoryChange.AddJournal("op-1", entry), trip, 200)
        val replay = TripMemory.apply(MemoryChange.AddJournal("op-1", entry), first, 300)
        assertEquals(first.updatedAt, replay.updatedAt)
        assertEquals(5, replay.json.getValue("journalEntries").jsonArray.size)
        assertThrows(IllegalArgumentException::class.java) {
            TripMemory.apply(MemoryChange.AddJournal("op-1", buildJsonObject { put("id", "other"); put("title", "다른 내용"); put("body", "") }), first, 400)
        }
    }

    @Test fun staleLegacyIndexIsRejectedAfterPrecedingRowChanges() {
        val trip = fixture()
        val rows = trip.json.getValue("checklist").jsonArray
        val stale = MemoryRowSelector.legacy(3, rows[3].jsonObject, rows)
        val after = TripMemory.apply(MemoryChange.RemoveChecklist(MemoryRowSelector.string("passport", rows[0].jsonObject)), trip, 200)
        assertThrows(IllegalArgumentException::class.java) { TripMemory.apply(MemoryChange.RemoveChecklist(stale), after, 300) }
    }

    @Test fun detailsAndJournalValidation() {
        val trip = fixture()
        assertThrows(IllegalArgumentException::class.java) {
            TripMemory.apply(MemoryChange.AddJournal("bad", buildJsonObject { put("id", "bad"); put("date", "2026-02-30"); put("title", "제목"); put("body", "") }), trip, 200)
        }
        val next = TripMemory.apply(MemoryChange.SetTravelDetails(mapOf("stayName" to "새 숙소"), mapOf("stayName" to "난바 호텔")), trip, 200)
        assertEquals("새 숙소", next.json.getValue("travelDetails").jsonObject["stayName"]!!.jsonPrimitive.content)
        assertEquals("keep", next.json.getValue("travelDetails").jsonObject["futureDetail"]!!.jsonPrimitive.content)
    }
    @Test fun journalEditCanRemovePhotoWhilePreservingPlaceSnapshotAndUnknownFields() {
        val original = fixture()
        val entries = original.json.getValue("journalEntries").jsonArray.mapIndexed { index, value ->
            if (index != 0) value else buildJsonObject {
                value.jsonObject.forEach { (key, item) -> put(key, item) }
                put("imageFileName", "photo.jpg")
                put("futureEntry", buildJsonObject { put("keep", true) })
            }
        }
        val trip = TripDocument(JsonObject(original.json + ("journalEntries" to JsonArray(entries))))
        val row = entries[0].jsonObject
        val next = TripMemory.apply(
            MemoryChange.EditJournal(
                MemoryRowSelector.string("same-z", row),
                buildJsonObject { put("title", "수정된 기록"); put("imageFileName", JsonNull) },
                buildJsonObject { put("title", "두 번째"); put("imageFileName", "photo.jpg") },
            ),
            trip,
            300,
        )
        val edited = next.json.getValue("journalEntries").jsonArray[0].jsonObject
        assertEquals("수정된 기록", edited["title"]!!.jsonPrimitive.content)
        assertNull(edited["imageFileName"])
        assertEquals("도톤보리", edited["place"]!!.jsonObject["name"]!!.jsonPrimitive.content)
        assertEquals(JsonPrimitive(true), edited["futureEntry"]!!.jsonObject["keep"])
    }
}
