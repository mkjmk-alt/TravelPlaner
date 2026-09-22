package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.*
import java.util.UUID

sealed interface ScheduleSection {
    data object Reserve : ScheduleSection
    data class Day(val number: Int) : ScheduleSection
    val token: Int get() = if (this is Day) number else 0
    val title: String get() = if (this is Day) "${number}일차" else "예비 목록"
}
sealed interface ItemKey {
    data class Text(val value: String) : ItemKey
    data class Integer(val value: Long) : ItemKey
    val token: String get() = when (this) { is Text -> "s:$value"; is Integer -> "n:$value" }
    companion object {
        fun from(value: JsonElement): ItemKey {
            require(value is JsonPrimitive && value != JsonNull) { "장소 식별자가 올바르지 않아요." }
            if (value.isString) { require(value.content.isNotBlank()); return Text(value.content) }
            val number = runCatching { value.content.toBigDecimal().longValueExact() }.getOrNull()
            require(number != null && number in -9007199254740991L..9007199254740991L) { "장소 숫자 식별자가 올바르지 않아요." }
            return Integer(number)
        }
        fun fromToken(token: String): ItemKey = when {
            token.startsWith("s:") -> from(JsonPrimitive(token.drop(2)))
            token.startsWith("n:") -> from(Json.parseToJsonElement(token.drop(2)))
            else -> throw IllegalArgumentException("장소 식별자를 읽지 못했어요.")
        }
    }
}
data class PlaceDraft(val name: String = "", val displayName: String = "", val loc: String = "", val time: String = "", val memo: String = "", val emoji: String = "📍") {
    val fields get() = mapOf("name" to name, "displayName" to displayName, "loc" to loc, "time" to time, "memo" to memo, "emoji" to emoji)
    fun validate(original: JsonObject = JsonObject(emptyMap())) {
        require(name.isNotBlank()) { "장소 이름을 입력해주세요." }
        require(TripSchedule.validTime(time)) { "시간은 09:30처럼 입력하거나 비워주세요." }
        mapOf("name" to 200, "displayName" to 200, "loc" to 2000, "memo" to 10000).forEach { (key, limit) ->
            val value = fields.getValue(key)
            require(value == (original[key] as? JsonPrimitive)?.content || value.codePointCount(0, value.length) <= limit) { "$key 입력은 최대 ${limit}자까지 가능해요. 기존 긴 내용은 그대로 보관할 수 있어요." }
        }
    }
    companion object {
        fun from(item: JsonObject) = PlaceDraft(
            (item["name"] as? JsonPrimitive)?.content ?: "", (item["displayName"] as? JsonPrimitive)?.content ?: "",
            (item["loc"] as? JsonPrimitive)?.content ?: "", (item["time"] as? JsonPrimitive)?.content ?: "",
            (item["memo"] as? JsonPrimitive)?.content ?: "", (item["emoji"] as? JsonPrimitive)?.content ?: "📍",
        )
    }
}
sealed interface ScheduleChange {
    val section: ScheduleSection
    data class Add(override val section: ScheduleSection, val id: String, val draft: PlaceDraft) : ScheduleChange
    data class AddPlace(override val section: ScheduleSection, val id: String, val draft: PlaceDraft, val selection: PlaceSelection) : ScheduleChange
    data class Edit(override val section: ScheduleSection, val key: ItemKey, val draft: PlaceDraft) : ScheduleChange
    data class Move(override val section: ScheduleSection, val key: ItemKey, val to: ScheduleSection) : ScheduleChange
    data class Shift(override val section: ScheduleSection, val key: ItemKey, val offset: Int) : ScheduleChange
    data class Remove(override val section: ScheduleSection, val key: ItemKey) : ScheduleChange
    data class SortByTime(override val section: ScheduleSection) : ScheduleChange
}
object TripSchedule {
    fun validTime(value: String) = value.isEmpty() || Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]").matches(value)
    fun items(section: ScheduleSection, trip: TripDocument): List<JsonObject> {
        val array = when (section) {
            ScheduleSection.Reserve -> trip.json["reserveItems"] ?: JsonArray(emptyList())
            is ScheduleSection.Day -> {
                require(section.number in 1..trip.dayCount) { "일차가 변경되었어요. 다시 확인해주세요." }
                trip.json.getValue("itinerary").jsonArray[section.number - 1].jsonObject.getValue("items")
            }
        }
        require(array is JsonArray && array.all { it is JsonObject }) { "저장된 장소를 읽지 못했어요." }
        return array.map { it.jsonObject }
    }
    fun apply(change: ScheduleChange, trip: TripDocument): TripDocument {
        val allKeys = (listOf(ScheduleSection.Reserve) + (1..trip.dayCount).map { ScheduleSection.Day(it) })
            .flatMap { items(it, trip) }.map { ItemKey.from(it["id"] ?: throw IllegalArgumentException("장소 ID가 없어요.")) }
        require(allKeys.size == allKeys.toSet().size) { "장소 ID가 중복되어 변경하지 않았어요." }
        val raw = trip.json.toMutableMap(); val list = items(change.section, trip).toMutableList()
        fun index(key: ItemKey): Int {
            val matches = list.indices.filter { ItemKey.from(list[it].getValue("id")) == key }
            require(matches.size == 1) { "일정이 변경되었어요. 화면을 다시 확인해주세요." }
            return matches.single()
        }
        fun set(items: List<JsonObject>, section: ScheduleSection) {
            if (section is ScheduleSection.Reserve) raw["reserveItems"] = JsonArray(items)
            else {
                val days = raw.getValue("itinerary").jsonArray.toMutableList()
                days[section.token - 1] = JsonObject(days[section.token - 1].jsonObject + ("items" to JsonArray(items)))
                raw["itinerary"] = JsonArray(days)
            }
        }
        when (change) {
            is ScheduleChange.AddPlace -> {
                val payload = change.selection.durablePayload(change.id,change.draft)
                if (ItemKey.Text(change.id) in allKeys) {
                    require(list.singleOrNull { it["id"] == JsonPrimitive(change.id) } == payload) { "같은 저장 요청의 내용이 변경되었습니다. 다시 확인해주세요." }
                    return trip
                }
                list.add(payload)
            }
            is ScheduleChange.Add -> {
                require(runCatching { UUID.fromString(change.id).toString().equals(change.id, true) }.getOrDefault(false) && ItemKey.Text(change.id) !in allKeys) { "새 장소 ID가 올바르지 않아요." }
                change.draft.validate()
                list.add(JsonObject(change.draft.fields.mapValues { JsonPrimitive(it.value) } + ("id" to JsonPrimitive(change.id))))
            }
            is ScheduleChange.Edit -> {
                val i = index(change.key); change.draft.validate(list[i])
                list[i] = JsonObject(list[i] + change.draft.fields.mapValues { JsonPrimitive(it.value) })
            }
            is ScheduleChange.Move -> {
                val i = index(change.key)
                if (change.section == change.to) return trip
                val target = items(change.to, trip) + list.removeAt(i); set(target, change.to)
            }
            is ScheduleChange.Shift -> {
                require(change.offset == -1 || change.offset == 1) { "한 칸씩 이동해주세요." }
                val i = index(change.key); val next = i + change.offset
                if (next !in list.indices) return trip
                java.util.Collections.swap(list, i, next)
            }
            is ScheduleChange.Remove -> list.removeAt(index(change.key))
            is ScheduleChange.SortByTime -> {
                list.forEach { item -> require(item["time"] == null || ((item["time"] as? JsonPrimitive)?.isString == true && validTime(item.getValue("time").jsonPrimitive.content))) { "저장된 시간을 확인해주세요." } }
                list.sortBy { (it["time"] as? JsonPrimitive)?.content?.takeIf(String::isNotEmpty) ?: "99:99" }
            }
        }
        set(list, change.section)
        if (JsonObject(raw) == trip.json) return trip
        raw["updatedAt"] = JsonPrimitive(maxOf(System.currentTimeMillis(), trip.updatedAt + 1))
        return TripDocument.parse(JsonObject(raw).toString())
    }
}
