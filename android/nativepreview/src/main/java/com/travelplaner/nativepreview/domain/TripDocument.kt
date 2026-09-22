package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.UUID

data class TripDraft(val name: String, val country: String, val startDate: String, val endDate: String)

class TripDocument internal constructor(val json: JsonObject) {
    val id: String get() = json.getValue("id").jsonPrimitive.content
    val name: String get() = json.getValue("name").jsonPrimitive.content
    val country: String get() = json.getValue("country").jsonPrimitive.content
    val startDate: String get() = json.getValue("startDate").jsonPrimitive.content
    val endDate: String get() = json.getValue("endDate").jsonPrimitive.content
    val dayCount: Int get() = json.getValue("itinerary").jsonArray.size
    val updatedAt: Long get() = json.getValue("updatedAt").jsonPrimitive.long
    val draft: TripDraft get() = TripDraft(name, country, startDate, endDate)
    fun toJson(): String = json.toString()

    fun edit(draft: TripDraft, now: Long = System.currentTimeMillis()): TripDocument {
        val count = validate(draft)
        val days = json.getValue("itinerary").jsonArray
        // Unknown day metadata is data too, even if its places array is empty.
        require(days.drop(count).all { day ->
            val value = day.jsonObject
            value.keys.all { it == "day" || it == "items" } && value.getValue("items").jsonArray.isEmpty()
        }) { "줄어드는 날짜에 일정이나 저장된 정보가 있어 기간을 줄일 수 없어요." }
        val resized = JsonArray(List(count) { index -> days.getOrNull(index) ?: emptyDay(index + 1) })
        return TripDocument(JsonObject(json + draftFields(draft) + mapOf(
            "itinerary" to resized,
            "updatedAt" to JsonPrimitive(maxOf(now, updatedAt + 1)),
        )))
    }

    companion object {
        fun create(draft: TripDraft, id: String = UUID.randomUUID().toString(), now: Long = System.currentTimeMillis()): TripDocument {
            val count = validate(draft)
            require(id.isNotBlank()) { "여행 ID가 없어요." }
            return TripDocument(JsonObject(WebDefaults.fields(draft.country.trim()) + draftFields(draft) + mapOf(
                "id" to JsonPrimitive(id),
                "createdAt" to JsonPrimitive(now),
                "updatedAt" to JsonPrimitive(now),
                "itinerary" to JsonArray(List(count) { emptyDay(it + 1) }),
            )))
        }

        /** Reject damaged records. Never normalize a read by dropping unknown or malformed data. */
        fun parse(source: String): TripDocument {
            try {
                val value = Json.parseToJsonElement(source) as? JsonObject
                    ?: throw IllegalArgumentException("여행 데이터가 올바른 JSON 객체가 아니에요.")
                listOf("id", "name", "country", "startDate", "endDate").forEach {
                    require((value[it] as? JsonPrimitive)?.isString == true) { "여행 필드를 읽을 수 없어요: " + it }
                }
                require(value.getValue("id").jsonPrimitive.content.isNotBlank()) { "여행 ID가 없어요." }
                listOf("createdAt", "updatedAt").forEach {
                    val timestamp = value[it] as? JsonPrimitive
                    require(timestamp != null && !timestamp.isString && timestamp.longOrNull != null) { "여행 저장 시각을 읽을 수 없어요." }
                }
                val trip = TripDocument(value)
                val count = validate(trip.draft)
                val days = value["itinerary"] as? JsonArray
                require(days != null && days.size == count) { "여행 기간과 일정 데이터가 일치하지 않아요." }
                days.forEachIndexed { index, day ->
                    val item = day as? JsonObject
                    require(item != null && (item["day"] as? JsonPrimitive)?.intOrNull == index + 1 && item["items"] is JsonArray) {
                        "저장된 일정을 읽을 수 없어요."
                    }
                    require(item.getValue("items").jsonArray.all { it is JsonObject }) {
                        "저장된 일정 항목을 읽을 수 없어요."
                    }
                }
                return trip
            } catch (error: IllegalArgumentException) {
                throw error
            } catch (error: Exception) {
                throw IllegalArgumentException("저장된 여행 데이터를 읽을 수 없어요.", error)
            }
        }

        fun validate(draft: TripDraft): Int {
            require(draft.name.trim().isNotEmpty()) { "여행 이름을 입력해 주세요." }
            val start = date(draft.startDate)
            val end = date(draft.endDate)
            val count = ChronoUnit.DAYS.between(start, end) + 1
            require(count >= 1) { "종료일은 시작일보다 빠를 수 없어요." }
            require(count <= 100) { "여행 기간은 시작일을 포함해 최대 100일이에요." }
            return count.toInt()
        }

        private fun date(value: String): LocalDate {
            require(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(value)) { "날짜는 YYYY-MM-DD 형식으로 입력해 주세요." }
            try {
                return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE).also {
                    require(it.year in 1..9999) { "날짜의 연도를 확인해 주세요." }
                }
            } catch (_: DateTimeParseException) {
                throw IllegalArgumentException("실제로 존재하는 날짜를 입력해 주세요.")
            }
        }

        private fun draftFields(draft: TripDraft) = mapOf(
            "name" to JsonPrimitive(draft.name.trim()),
            "country" to JsonPrimitive(draft.country.trim()),
            "startDate" to JsonPrimitive(draft.startDate),
            "endDate" to JsonPrimitive(draft.endDate),
        )

        private fun emptyDay(day: Int) = buildJsonObject { put("day", day); put("items", JsonArray(emptyList())) }
    }
}
