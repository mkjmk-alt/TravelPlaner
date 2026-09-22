package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.*
import java.io.InputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.time.LocalDate

object TripBackup {
    const val maxBytes = 20 * 1024 * 1024
    fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    fun filename(name: String): String = name.map { if (it == '/' || it == '\\' || it.isISOControl()) '_' else it }.joinToString("").take(68).trim().ifEmpty { "trip" } + "-backup.json"
    fun read(input: InputStream): ByteArray {
        val output = ByteArrayOutputStream(); val buffer = ByteArray(65536)
        while (output.size() <= maxBytes) {
            val count = input.read(buffer, 0, minOf(buffer.size, maxBytes + 1 - output.size()))
            if (count < 0) break
            if (count == 0) { val single = input.read(); if (single < 0) break; output.write(single) }
            else output.write(buffer, 0, count)
        }
        require(output.size() <= maxBytes) { "백업은 최대 20 MiB까지 가져올 수 있어요. 데이터를 변경하지 않았어요." }
        return output.toByteArray()
    }
    fun encode(trip: TripDocument): ByteArray = JsonObject(trip.json - "sharedId" - "sharedManagementToken").toString().encodeToByteArray()
    fun decode(bytes: ByteArray): ImportCandidate {
        require(bytes.size <= maxBytes) { "백업은 최대 20 MiB까지 가져올 수 있어요. 데이터를 변경하지 않았어요." }
        val hash = hash(bytes)
        val text = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString().removePrefix("\uFEFF") }
        catch (_: Exception) { throw IllegalArgumentException("UTF-8 JSON 파일을 선택해주세요.") }
        var depth = 0; var quoted = false; var escaped = false
        text.forEach { c ->
            if (quoted) { if (escaped) escaped = false else if (c == '\\') escaped = true else if (c == '"') quoted = false }
            else if (c == '"') quoted = true
            else if (c == '{' || c == '[') { depth++; require(depth <= 64) { "백업의 중첩 구조가 너무 깊어요. 데이터를 변경하지 않았어요." } }
            else if (c == '}' || c == ']') depth--
        }
        val raw = (Json.parseToJsonElement(text) as? JsonObject)?.toMutableMap() ?: throw IllegalArgumentException("단일 여행 JSON 파일을 선택해주세요.")
        require((raw["name"] as? JsonPrimitive)?.let { it.isString && it.content.isNotBlank() } == true) { "여행 이름을 확인해주세요." }
        val start = (raw["startDate"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw IllegalArgumentException("시작일이 없어요.")
        val days = (raw["itinerary"] as? JsonArray)?.toMutableList() ?: throw IllegalArgumentException("일정이 없어요.")
        require(days.size in 1..100) { "일정은 1~100일이어야 해요." }
        val warnings = mutableListOf<String>()
        fun fill(key: String, value: JsonElement) { if (key !in raw) { raw[key] = value; warnings.add("$key 누락 항목 보완") } }
        fill("id", JsonPrimitive("import-$hash")); fill("country", JsonPrimitive(""))
        val startDate = try { LocalDate.parse(start) } catch (_: java.time.DateTimeException) { throw IllegalArgumentException("올바른 시작일을 확인해주세요.") }
        fill("endDate", JsonPrimitive(startDate.plusDays(days.size - 1L).toString()))
        fill("createdAt", raw["updatedAt"] ?: JsonPrimitive(0)); fill("updatedAt", raw["createdAt"] ?: JsonPrimitive(0))
        listOf("createdAt", "updatedAt").forEach { key ->
            val value = raw[key] as? JsonPrimitive
            require(value != null && !value.isString && value.longOrNull?.let { it in -9007199254740991L..9007199254740991L } == true) { "저장 시각이 올바르지 않아요." }
        }
        listOf("reserveItems", "expenses", "journalEntries", "checklist", "settlementParticipants").forEach { key ->
            fill(key, JsonArray(emptyList())); require(raw[key] is JsonArray && raw.getValue(key).jsonArray.all { it is JsonObject }) { "$key 형식을 확인해주세요." }
        }
        raw["journalEntries"] = JsonArray(raw.getValue("journalEntries").jsonArray.mapIndexed { index, value ->
            val entry = value.jsonObject.toMutableMap()
            if (entry.remove("imageFileName") != null) {
                val title = entry["title"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
                val label = title.ifEmpty { "기록 ${index + 1}" }
                warnings.add("${label}의 외부 사진 참조는 가져오지 않음")
            }
            JsonObject(entry)
        })
        listOf("budgetSettings", "travelDetails", "reminders").forEach { key -> fill(key, JsonObject(emptyMap())); require(raw[key] is JsonObject) { "$key 형식을 확인해주세요." } }
        val keys = mutableSetOf<ItemKey>(); var count = 0
        fun normalizeItems(value: JsonElement?, prefix: String): JsonArray {
            require(value is JsonArray && value.all { it is JsonObject }) { "장소 목록을 확인해주세요." }
            count += value.size; require(count <= 10000) { "장소는 최대 10,000개까지 가져올 수 있어요." }
            return JsonArray(value.mapIndexed { index, element ->
                val item = element.jsonObject.toMutableMap()
                if ("id" !in item) { item["id"] = JsonPrimitive("import-$hash-$prefix$index"); warnings.add("$prefix$index 장소 ID 보완") }
                require(keys.add(ItemKey.from(item.getValue("id")))) { "중복된 장소 ID가 있어요." }
                require((item["name"] as? JsonPrimitive)?.let { it.isString && it.content.isNotBlank() } == true) { "장소 이름을 확인해주세요." }
                listOf("displayName", "loc", "time", "memo", "emoji").forEach { field -> require(field !in item || (item[field] as? JsonPrimitive)?.isString == true) { "장소 $field 형식이 잘못되었어요." } }
                require(item["time"] == null || TripSchedule.validTime(item.getValue("time").jsonPrimitive.content)) { "잘못된 장소 시간이 있어요." }
                JsonObject(item)
            })
        }
        days.indices.forEach { index ->
            val day = (days[index] as? JsonObject)?.toMutableMap() ?: throw IllegalArgumentException("일차 형식이 잘못되었어요.")
            if ("day" !in day) { day["day"] = JsonPrimitive(index + 1); warnings.add("${index + 1}일차 번호 보완") }
            require((day["day"] as? JsonPrimitive)?.let { !it.isString && it.intOrNull == index + 1 } == true) { "일차 번호가 올바르지 않아요." }
            day["items"] = normalizeItems(day["items"], "day-${index + 1}-item-"); days[index] = JsonObject(day)
        }
        raw["itinerary"] = JsonArray(days); raw["reserveItems"] = normalizeItems(raw["reserveItems"], "reserve-")
        listOf("sharedId", "sharedManagementToken").forEach { if (raw.remove(it) != null) warnings.add("$it 공유 연결은 가져오지 않음") }
        return ImportCandidate(hash, bytes, TripDocument.parse(JsonObject(raw).toString()), warnings.toList())
    }
}
