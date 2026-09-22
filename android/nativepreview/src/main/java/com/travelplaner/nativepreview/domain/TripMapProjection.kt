package com.travelplaner.nativepreview.domain
import kotlinx.serialization.json.*

data class MapMarker(val key: String, val coordinate: Coordinate, val label: String, val kind: Kind, val tripID: String? = null, val itemKey: ItemKey? = null, val favoriteID: String? = null) {
    sealed interface Kind {
        data object Saved: Kind
        data object Reserve: Kind
        data class Day(val number: Int): Kind
    }
}
data class MapRoute(val day: Int,val markers: List<MapMarker>)
data class MapProjection(val markers: List<MapMarker>,val unlocatedItemCount: Int,val routes: List<MapRoute>)
object TripMapProjection {
    fun googlePlaceIDs(trip:TripDocument?,saved:List<SavedPlaceDocument>):List<String> {
        val items=saved.map { it.payload }.toMutableList()
        if(trip!=null) (listOf(ScheduleSection.Reserve)+(1..trip.dayCount).map { ScheduleSection.Day(it) }).forEach { items+=runCatching { TripSchedule.items(it,trip) }.getOrDefault(emptyList()) }
        return items.mapNotNull { item ->
            if((item["nativePlaceSource"] as? JsonPrimitive)?.content!="google") null
            else (item["placeId"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.codePointCount(0,it.length) in 1..1024 }
        }.distinct().sorted()
    }
    fun make(trip: TripDocument?,saved: List<SavedPlaceDocument>,resolved: Map<String,ResolvedPlace>,now: Long = System.currentTimeMillis()): MapProjection {
        val markers = mutableListOf<MapMarker>(); val routes = mutableListOf<MapRoute>(); var missing = 0
        val seen = mutableSetOf<String>()
        fun coordinate(item: JsonObject): Coordinate? {
            if ((item["nativePlaceSource"] as? JsonPrimitive)?.content == "google") {
                val id = (item["placeId"] as? JsonPrimitive)?.content ?: return null
                val found = resolved[id] ?: return null
                return found.coordinate.takeIf { found.placeID == id && now >= found.fetchedAt && now - found.fetchedAt < 300000 }
            }
            return Coordinate.from(item)
        }
        fun key(vararg parts: String) = JsonArray(parts.map(::JsonPrimitive)).toString()
        if (trip != null) {
            (listOf(ScheduleSection.Reserve) + (1..trip.dayCount).map { ScheduleSection.Day(it) }).forEach { section ->
                val segment = mutableListOf<MapMarker>()
                fun flush() { if (section.token > 0 && segment.size > 1) routes.add(MapRoute(section.token,segment.toList())); segment.clear() }
                (runCatching { TripSchedule.items(section,trip) }.getOrNull() ?: emptyList()).forEach { item ->
                    val id = runCatching { ItemKey.from(item.getValue("id")) }.getOrNull()
                    val point = coordinate(item)
                    if (id == null || point == null) { missing++; flush() }
                    else {
                        val markerKey = key("trip",trip.id,id.token)
                        if (!seen.add(markerKey)) { missing++; flush() }
                        else {
                            val marker = MapMarker(markerKey,point,label(item),if (section.token == 0) MapMarker.Kind.Reserve else MapMarker.Kind.Day(section.token),trip.id,id)
                            markers.add(marker); segment.add(marker)
                        }
                    }
                }
                flush()
            }
        }
        saved.forEach { row ->
            val point = coordinate(row.payload); val markerKey = key("saved",row.id)
            if (point == null || !seen.add(markerKey)) missing++
            else markers.add(MapMarker(markerKey,point,label(row.payload),MapMarker.Kind.Saved,favoriteID=row.id))
        }
        return MapProjection(markers.toList(),missing,routes.toList())
    }
    private fun label(item: JsonObject): String = (item["displayName"] as? JsonPrimitive)?.content?.takeIf { it.isNotEmpty() }
        ?: (item["name"] as? JsonPrimitive)?.content ?: "이름 없는 장소"
}
data class MapBounds(val south: Double,val north: Double,val west: Double,val east: Double,val longitudeSpan: Double) {
    companion object {
        fun fit(coordinates: List<Coordinate>): MapBounds? {
            if (coordinates.isEmpty()) return null
            val sorted = coordinates.map { if (it.longitude < 0) it.longitude + 360 else it.longitude }.sorted()
            var gap = -1.0; var index = 0
            sorted.indices.forEach { i ->
                val next = if (i+1 < sorted.size) sorted[i+1] else sorted[0]+360
                if (next-sorted[i] > gap) { gap = next-sorted[i]; index=i }
            }
            fun signed(value: Double) = if (value > 180) value-360 else value
            return MapBounds(coordinates.minOf { it.latitude },coordinates.maxOf { it.latitude },signed(sorted[(index+1)%sorted.size]),signed(sorted[index]),360-gap)
        }
    }
}
