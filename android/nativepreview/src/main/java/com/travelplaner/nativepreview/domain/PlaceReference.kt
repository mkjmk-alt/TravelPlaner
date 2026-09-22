package com.travelplaner.nativepreview.domain
import kotlinx.serialization.json.*

data class Coordinate(val latitude: Double, val longitude: Double) {
    init { require(latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0) { "위도(-90~90)와 경도(-180~180)를 함께 확인해주세요." } }
    companion object {
        fun from(item: JsonObject): Coordinate? {
            val lat = item["lat"] as? JsonPrimitive ?: return null
            val lng = item["lng"] as? JsonPrimitive ?: return null
            if (lat.isString || lng.isString) return null
            return runCatching { Coordinate(lat.double,lng.double) }.getOrNull()
        }
    }
}
sealed interface PlaceReference {
    data class Manual(val coordinate: Coordinate): PlaceReference
    data class Google(val placeID: String): PlaceReference
    data object Existing: PlaceReference
    data object Unlocated: PlaceReference
}
data class PlaceSelection(val reference: PlaceReference, val originalItem: JsonObject? = null, val sourceTripID: String? = null, val sourceItemKey: ItemKey? = null, val sourceSavedID: String? = null) {
    fun validated(): PlaceSelection {
        if (reference is PlaceReference.Google) {
            val id = reference.placeID.trim()
            require(id.codePointCount(0,id.length) in 1..1024) { "장소 정보를 다시 선택해주세요." }
            return PlaceSelection(PlaceReference.Google(id))
        }
        if (reference == PlaceReference.Existing) {
            require(originalItem != null)
            if (sourceSavedID != null) require(sourceTripID == null && sourceSavedID.isNotEmpty() && originalItem["id"] == JsonPrimitive(sourceSavedID))
            else require(!sourceTripID.isNullOrEmpty() && sourceItemKey != null && originalItem["id"]?.let(ItemKey::from) == sourceItemKey) { "원본 장소 정보를 확인하지 못했어요." }
        }
        return this
    }
    fun sourceKey(creationID: String): String {
        val value = validated()
        return when (val reference = value.reference) {
            is PlaceReference.Google -> "google:" + reference.placeID
            is PlaceReference.Manual, PlaceReference.Unlocated -> "manual:" + creationID
            PlaceReference.Existing -> {
                val parts = value.sourceSavedID?.let { listOf("saved",it) } ?: listOf("existing",value.sourceTripID!!,value.sourceItemKey!!.token)
                "existing:" + TripBackup.hash(JsonArray(parts.map(::JsonPrimitive)).toString().encodeToByteArray())
            }
        }
    }
    fun durablePayload(id: String,draft: PlaceDraft): JsonObject {
        require(runCatching { java.util.UUID.fromString(id).toString().equals(id,true) }.getOrDefault(false))
        val value = validated()
        val raw = if (value.reference == PlaceReference.Existing) value.originalItem!!.toMutableMap() else mutableMapOf()
        draft.validate(JsonObject(raw)); raw["id"] = JsonPrimitive(id)
        raw.putAll(draft.fields.mapValues { JsonPrimitive(it.value) })
        when(val ref = value.reference) {
            is PlaceReference.Manual -> { raw["lat"] = JsonPrimitive(ref.coordinate.latitude); raw["lng"] = JsonPrimitive(ref.coordinate.longitude) }
            is PlaceReference.Google -> { raw["placeId"] = JsonPrimitive(ref.placeID); raw["nativePlaceSource"] = JsonPrimitive("google") }
            PlaceReference.Existing, PlaceReference.Unlocated -> Unit
        }
        return JsonObject(raw)
    }
}
data class ResolvedPlace(val placeID: String, val coordinate: Coordinate, val displayName: String, val address: String, val attribution: List<String>, val fetchedAt: Long)
