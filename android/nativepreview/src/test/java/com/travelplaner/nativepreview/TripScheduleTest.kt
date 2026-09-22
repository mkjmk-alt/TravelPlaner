package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

fun contractBytes(name: String): ByteArray = File("../../contracts/native/fixtures/$name").readBytes()
class TripScheduleTest {
    private fun fixture() = TripDocument.parse(contractBytes("schedule-edit.json").decodeToString())
    private val draft = PlaceDraft("새 이름", "표시", "주소", "10:30", "변경 메모", "✈️")
    private val day = ScheduleSection.Day(1)
    @Test fun typedIDsFixedSequenceAndPreservation() {
        val before = fixture(); val bytes = before.toJson()
        val edited = TripSchedule.apply(ScheduleChange.Edit(day, ItemKey.Integer(1), draft), before)
        val moved = TripSchedule.apply(ScheduleChange.Move(day, ItemKey.Integer(1), ScheduleSection.Reserve), edited)
        val expected = Json.parseToJsonElement(contractBytes("schedule-expected.json").decodeToString()).jsonObject
        assertEquals(expected["day1IDs"], JsonArray(TripSchedule.items(day, moved).map { it.getValue("id") }))
        val reserve = TripSchedule.items(ScheduleSection.Reserve, moved)
        assertEquals(expected["reserveIDs"], JsonArray(reserve.map { it.getValue("id") }))
        listOf("name" to "movedName", "time" to "movedTime", "memo" to "movedMemo").forEach { (key, expectedKey) -> assertEquals(expected[expectedKey], reserve.last()[key]) }
        listOf("lat", "lng", "reservationNumber", "reservationUrl", "futureField").forEach { assertEquals(TripSchedule.items(day, before)[0][it], reserve.last()[it]) }
        listOf("expenses", "futureRoot", "createdAt").forEach { assertEquals(before.json[it], moved.json[it]) }
        assertEquals(bytes, before.toJson())
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Move(day, ItemKey.Integer(1), ScheduleSection.Reserve), moved) }
    }
    @Test fun addDeleteShiftSortNoOps() {
        val before = fixture(); val second = ScheduleSection.Day(2); val id = UUID.randomUUID().toString()
        val added = TripSchedule.apply(ScheduleChange.Add(second, id, draft), before)
        assertEquals(1, TripSchedule.items(second, added).size); assertTrue(added.updatedAt > before.updatedAt)
        assertEquals(added.toJson(), TripSchedule.apply(ScheduleChange.Shift(second, ItemKey.Text(id), -1), added).toJson())
        assertEquals(added.toJson(), TripSchedule.apply(ScheduleChange.Move(second, ItemKey.Text(id), second), added).toJson())
        assertTrue(TripSchedule.items(second, TripSchedule.apply(ScheduleChange.Remove(second, ItemKey.Text(id)), added)).isEmpty())
        val sorted = TripSchedule.apply(ScheduleChange.SortByTime(day), before)
        assertEquals(listOf(ItemKey.Text("1"), ItemKey.Text("tie"), ItemKey.Integer(1), ItemKey.Text("empty")), TripSchedule.items(day, sorted).map { ItemKey.from(it.getValue("id")) })
        val shifted = TripSchedule.apply(ScheduleChange.Shift(day, ItemKey.Integer(1), 1), before)
        assertEquals(ItemKey.Text("1"), ItemKey.from(TripSchedule.items(day, shifted)[0].getValue("id")))
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Shift(day, ItemKey.Integer(1), 2), before) }
        assertEquals(before.toJson(), TripSchedule.apply(ScheduleChange.SortByTime(second), before).toJson())
    }
    @Test fun invalidDuplicateAndMissingKeysFail() {
        listOf(JsonPrimitive(true), JsonPrimitive(1.5), JsonPrimitive(9007199254740992L), JsonPrimitive("")).forEach { assertThrows(IllegalArgumentException::class.java) { ItemKey.from(it) } }
        val before = fixture(); val days = before.json.getValue("itinerary").jsonArray.toMutableList()
        val items = TripSchedule.items(day, before)
        days[0] = JsonObject(days[0].jsonObject + ("items" to JsonArray(items + items[0])))
        val duplicate = TripDocument.parse(JsonObject(before.json + ("itinerary" to JsonArray(days))).toString())
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Remove(day, ItemKey.Integer(1)), duplicate) }
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Add(ScheduleSection.Day(99), UUID.randomUUID().toString(), draft), before) }
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Add(day, "1", draft), before) }
    }
    @Test fun validationAndUnchangedLegacyFields() {
        val before = fixture()
        listOf("24:00", "12:60", "9:00", " 09:00", "garbage").forEach { assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Edit(day, ItemKey.Integer(1), draft.copy(time = it)), before) } }
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Add(day, UUID.randomUUID().toString(), draft.copy(name = " \n")), before) }
        val long = draft.copy(memo = "a".repeat(10001))
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(ScheduleChange.Edit(day, ItemKey.Integer(1), long), before) }
        val days = before.json.getValue("itinerary").jsonArray.toMutableList(); val items = TripSchedule.items(day, before).toMutableList()
        items[0] = JsonObject(items[0] + ("memo" to JsonPrimitive(long.memo)))
        days[0] = JsonObject(days[0].jsonObject + ("items" to JsonArray(items)))
        val legacy = TripDocument.parse(JsonObject(before.json + ("itinerary" to JsonArray(days))).toString())
        assertEquals(long.memo, TripSchedule.items(day, TripSchedule.apply(ScheduleChange.Edit(day, ItemKey.Integer(1), long), legacy))[0]["memo"]!!.jsonPrimitive.content)
    }
}
