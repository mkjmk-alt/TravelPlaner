package com.travelplaner.nativepreview.domain
import kotlinx.serialization.json.*

data class SavedPlaceDocument(val id: String, val sourceKey: String, val payload: JsonObject, val createdAt: Long, val updatedAt: Long) {
    val draft get() = PlaceDraft.from(payload)
    // A saved row is already a durable user-owned record. Copy it as an
    // existing payload so extension fields survive a second itinerary copy;
    // accepting a fresh SDK result remains the Google selection path.
    val selection: PlaceSelection get() = PlaceSelection(PlaceReference.Existing,originalItem=payload,sourceSavedID=id)
}
