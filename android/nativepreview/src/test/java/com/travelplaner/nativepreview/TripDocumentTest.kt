package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.TripDocument
import com.travelplaner.nativepreview.domain.TripDraft
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.util.TimeZone

class TripDocumentTest {
    private val draft = TripDraft("  오사카 여행  ", "일본", "2026-10-10", "2026-10-11")
    private fun fixture() = TripDocument.parse(requireNotNull(javaClass.getResource("/trip.json")).readText())

    @Test fun creationTrimsNameAndUsesWebDefaults() {
        val trip = TripDocument.create(draft, "new-id", 1234)
        assertEquals("오사카 여행", trip.name)
        assertEquals(2, trip.dayCount)
        assertEquals(JsonPrimitive(1234), trip.json["createdAt"])
        assertEquals("JPY", trip.json["budgetSettings"]!!.jsonObject["travelCurrency"]!!.jsonPrimitive.content)
        assertEquals(JsonArray(emptyList()), trip.json["expenses"])
        assertEquals("나", trip.json["settlementParticipants"]!!.jsonArray[0].jsonObject["name"]!!.jsonPrimitive.content)
        assertEquals(JsonPrimitive(false), trip.json["reminders"]!!.jsonObject["enabled"])
        assertEquals(trip.json, TripDocument.parse(trip.toJson()).json)
    }

    @Test fun rejectsBlankNameAndStrictlyInvalidDates() {
        assertThrows(IllegalArgumentException::class.java) { TripDocument.create(draft.copy(name = " \n\t")) }
        for (date in listOf("2026-02-29", "2026-04-31", "2026-2-01", "2026-10-10T00:00:00Z", "0000-01-01", "+2026-10-10", " 2026-10-10")) {
            assertThrows("date $date", IllegalArgumentException::class.java) { TripDocument.create(draft.copy(startDate = date)) }
        }
        assertThrows(IllegalArgumentException::class.java) { TripDocument.create(draft.copy(endDate = "2026-10-09")) }
    }

    @Test fun inclusiveOneAndHundredDayLimits() {
        assertEquals(1, TripDocument.create(draft.copy(endDate = "2026-10-10")).dayCount)
        assertEquals(100, TripDocument.create(draft.copy(startDate = "2026-01-01", endDate = "2026-04-10")).dayCount)
        assertThrows(IllegalArgumentException::class.java) {
            TripDocument.create(draft.copy(startDate = "2026-01-01", endDate = "2026-04-11"))
        }
        assertEquals(2, TripDocument.create(draft.copy(startDate = "2028-02-28", endDate = "2028-02-29")).dayCount)
    }

    @Test fun dateOnlyDoesNotChangeAcrossTimeZonesOrDst() {
        val previous = TimeZone.getDefault()
        try {
            for (zone in listOf("America/Los_Angeles", "Asia/Seoul", "Pacific/Kiritimati")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                assertEquals(3, TripDocument.create(draft.copy(startDate = "2026-03-07", endDate = "2026-03-09")).dayCount)
            }
        } finally { TimeZone.setDefault(previous) }
    }

    @Test fun editingPreservesAllUneditedFieldsAndAppendsEmptyDays() {
        val original = fixture()
        val edited = original.edit(draft.copy(name = "  새 이름 ", endDate = "2026-10-12"), 1790000001000)
        assertEquals(original.id, edited.id)
        assertEquals("새 이름", edited.name)
        assertEquals(3, edited.dayCount)
        assertEquals(original.json["futureField"], edited.json["futureField"])
        val editedKeys = setOf("name", "country", "startDate", "endDate", "itinerary", "updatedAt")
        original.json.filterKeys { it !in editedKeys }.forEach { (key, value) -> assertEquals(key, value, edited.json[key]) }
        assertEquals(original.json["itinerary"]!!.jsonArray[1], edited.json["itinerary"]!!.jsonArray[1])
        assertEquals(Json.parseToJsonElement("{\"day\":3,\"items\":[]}"), edited.json["itinerary"]!!.jsonArray[2])
        assertTrue(edited.updatedAt > original.updatedAt)
    }

    @Test fun shrinkingRejectsNonemptyDaysAndNeverMutatesOriginal() {
        val trip = fixture()
        val before = trip.toJson()
        assertThrows(IllegalArgumentException::class.java) { trip.edit(draft.copy(endDate = "2026-10-10")) }
        assertEquals(before, trip.toJson())
        val empty = TripDocument.create(draft)
        assertEquals(1, empty.edit(draft.copy(endDate = "2026-10-10")).dayCount)
    }

    @Test fun shrinkingAlsoProtectsUnknownDayMetadata() {
        val trip = TripDocument.create(draft)
        val days = trip.json["itinerary"]!!.jsonArray.toMutableList()
        days[1] = JsonObject(days[1].jsonObject + ("futureNote" to JsonPrimitive("keep")))
        val withMetadata = TripDocument.parse(JsonObject(trip.json + ("itinerary" to JsonArray(days))).toString())
        assertThrows(IllegalArgumentException::class.java) { withMetadata.edit(draft.copy(endDate = "2026-10-10")) }
    }

    @Test fun malformedJsonAndItineraryAreErrorsInsteadOfEmptyTrips() {
        for (invalid in listOf("{", "[]", "{}")) {
            assertThrows(IllegalArgumentException::class.java) { TripDocument.parse(invalid) }
        }
        val malformed = JsonObject(fixture().json + ("itinerary" to JsonArray(emptyList())))
        assertThrows(IllegalArgumentException::class.java) { TripDocument.parse(malformed.toString()) }
    }

    @Test fun rejectsNonObjectItineraryItemsAsCorruptData() {
        val trip = fixture()
        val days = trip.json["itinerary"]!!.jsonArray.toMutableList()
        for (invalid in listOf(JsonPrimitive("broken place"), JsonNull, JsonArray(emptyList()))) {
            days[0] = buildJsonObject { put("day", 1); put("items", JsonArray(listOf(invalid))) }
            val corrupted = JsonObject(trip.json + ("itinerary" to JsonArray(days)))
            assertThrows(IllegalArgumentException::class.java) { TripDocument.parse(corrupted.toString()) }
        }
    }
}
