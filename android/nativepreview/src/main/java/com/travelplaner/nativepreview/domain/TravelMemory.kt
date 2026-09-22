package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.*
import java.time.LocalDate

sealed interface MemoryItemKey {
    data class StringKey(val value: String) : MemoryItemKey
    data class IntKey(val value: Int) : MemoryItemKey
}

data class MemoryRowSelector(
    val key: MemoryItemKey?,
    val index: Int?,
    val expected: JsonObject,
    val expectedRows: JsonArray?
) {
    companion object {
        fun string(value: String, expected: JsonObject) = MemoryRowSelector(MemoryItemKey.StringKey(value), null, expected, null)
        fun legacy(index: Int, expected: JsonObject, expectedRows: JsonArray) = MemoryRowSelector(null, index, expected, expectedRows)
    }
}

sealed interface MemoryChange {
    data class SetTravelDetails(val values: Map<String, String>, val expected: Map<String, String>) : MemoryChange
    data class AddChecklist(val operationId: String, val item: JsonObject) : MemoryChange
    data class SetChecklistChecked(val selector: MemoryRowSelector, val checked: Boolean) : MemoryChange
    data class RemoveChecklist(val selector: MemoryRowSelector) : MemoryChange
    data class AddJournal(val operationId: String, val entry: JsonObject) : MemoryChange
    data class EditJournal(val selector: MemoryRowSelector, val changes: JsonObject, val expected: JsonObject) : MemoryChange
    data class RemoveJournal(val selector: MemoryRowSelector) : MemoryChange
}

object TripMemory {
    fun apply(change: MemoryChange, trip: TripDocument, now: Long): TripDocument {
        var next = trip.json
        var changed = false
        when (change) {
            is MemoryChange.SetTravelDetails -> {
                val details = next["travelDetails"]?.jsonObject ?: error("travelDetails가 올바르지 않습니다.")
                change.expected.forEach { (key, value) -> require((details[key] as? JsonPrimitive)?.contentOrNull.orEmpty() == value) { "여행 준비 정보가 변경되었습니다." } }
                val updated = buildJsonObject {
                    details.forEach { (key, value) -> put(key, value) }
                    change.values.forEach { (key, value) ->
                        if ((details[key] as? JsonPrimitive)?.contentOrNull != value) changed = true
                        put(key, value)
                    }
                }
                next = JsonObject(next + ("travelDetails" to updated))
            }
            is MemoryChange.AddChecklist -> {
                val rows = rows(next, "checklist").toMutableList()
                val existing = rows.firstOrNull { it["operationId"]?.jsonPrimitive?.contentOrNull == change.operationId }
                if (existing != null) {
                    require(existing.without("operationId") == change.item.without("operationId")) { "같은 작업 ID에 다른 내용이 사용되었습니다." }
                    return trip
                }
                rows += JsonObject(change.item + ("operationId" to JsonPrimitive(change.operationId)) + if (change.item["checked"] == null) mapOf("checked" to JsonPrimitive(false)) else emptyMap())
                next = JsonObject(next + ("checklist" to JsonArray(rows))); changed = true
            }
            is MemoryChange.SetChecklistChecked -> {
                val rows = rows(next, "checklist").toMutableList(); val index = locate(change.selector, rows)
                if ((rows[index]["checked"] as? JsonPrimitive)?.booleanOrNull == change.checked) return trip
                rows[index] = JsonObject(rows[index] + ("checked" to JsonPrimitive(change.checked)))
                next = JsonObject(next + ("checklist" to JsonArray(rows))); changed = true
            }
            is MemoryChange.RemoveChecklist -> {
                val rows = rows(next, "checklist").toMutableList(); rows.removeAt(locate(change.selector, rows))
                next = JsonObject(next + ("checklist" to JsonArray(rows))); changed = true
            }
            is MemoryChange.AddJournal -> {
                validateJournal(change.entry)
                val rows = rows(next, "journalEntries").toMutableList()
                val existing = rows.firstOrNull { it["operationId"]?.jsonPrimitive?.contentOrNull == change.operationId }
                if (existing != null) {
                    require(existing.without("operationId") == change.entry.without("operationId")) { "같은 작업 ID에 다른 내용이 사용되었습니다." }
                    return trip
                }
                rows += JsonObject(change.entry + ("operationId" to JsonPrimitive(change.operationId)))
                next = JsonObject(next + ("journalEntries" to JsonArray(rows))); changed = true
            }
            is MemoryChange.EditJournal -> {
                validateJournal(change.changes, partial = true)
                val rows = rows(next, "journalEntries").toMutableList(); val index = locate(change.selector, rows)
                require(change.expected.all { (key, value) -> rows[index][key] == value }) { "기록이 먼저 변경되었습니다." }
                val edited = rows[index].toMutableMap()
                change.changes.forEach { (key, value) ->
                    if (value is JsonNull) edited.remove(key) else edited[key] = value
                }
                next = JsonObject(next + ("journalEntries" to JsonArray(rows.toMutableList().also { it[index] = JsonObject(edited) }))); changed = true
            }
            is MemoryChange.RemoveJournal -> {
                val rows = rows(next, "journalEntries").toMutableList(); rows.removeAt(locate(change.selector, rows))
                next = JsonObject(next + ("journalEntries" to JsonArray(rows))); changed = true
            }
        }
        return if (!changed) trip else TripDocument(JsonObject(next + ("updatedAt" to JsonPrimitive(maxOf(now, trip.updatedAt + 1)))))
    }

    private fun rows(json: JsonObject, key: String): List<JsonObject> = when (val value = json[key]) {
        null -> emptyList()
        is JsonArray -> value.map { it.jsonObject }
        else -> error("$key 목록이 올바르지 않습니다.")
    }

    private fun locate(selector: MemoryRowSelector, rows: List<JsonObject>): Int {
        selector.expectedRows?.let { require(JsonArray(rows) == it) { "다른 변경사항이 먼저 저장되었습니다." } }
        selector.key?.let { key ->
            val matches = rows.mapIndexedNotNull { index, row -> if (itemKey(row) == key) index else null }
            if (matches.size == 1) { val index = matches.single(); require(rows[index] == selector.expected) { "다른 변경사항이 먼저 저장되었습니다." }; return index }
            val index = selector.index
            require(index != null && matches.contains(index) && rows[index] == selector.expected) { if (matches.isEmpty()) "항목을 찾지 못했습니다." else "다른 변경사항이 먼저 저장되었습니다." }
            return index
        }
        val index = selector.index
        require(index != null && index in rows.indices && rows[index] == selector.expected) { "다른 변경사항이 먼저 저장되었습니다." }
        return index
    }

    private fun itemKey(row: JsonObject): MemoryItemKey? = row["id"]?.jsonPrimitive?.let { value ->
        if (value.isString) MemoryItemKey.StringKey(value.content) else value.intOrNull?.let(MemoryItemKey::IntKey)
    }

    private fun validateJournal(entry: JsonObject, partial: Boolean = false) {
        val date = entry["date"]?.jsonPrimitive?.contentOrNull.orEmpty()
        if (date.isNotEmpty()) runCatching { LocalDate.parse(date) }.getOrElse { throw IllegalArgumentException("기록 날짜가 올바르지 않습니다.", it) }
        if (!partial || entry["title"] != null) require(entry["title"]?.jsonPrimitive?.contentOrNull.orEmpty().length <= 80) { "기록 제목이 너무 깁니다." }
        if (!partial || entry["body"] != null) require(entry["body"]?.jsonPrimitive?.contentOrNull.orEmpty().length <= 2000) { "기록 본문이 너무 깁니다." }
        if (!partial) require(entry["title"]?.jsonPrimitive?.contentOrNull.orEmpty().isNotEmpty() || entry["body"]?.jsonPrimitive?.contentOrNull.orEmpty().isNotEmpty() || entry["imageDataUrl"]?.jsonPrimitive?.contentOrNull.orEmpty().isNotEmpty() || entry["imageFileName"]?.jsonPrimitive?.contentOrNull.orEmpty().isNotEmpty()) { "기록 내용을 입력해주세요." }
    }

    private fun JsonObject.without(key: String) = JsonObject(filterKeys { it != key })
}
