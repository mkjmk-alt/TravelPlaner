package com.travelplaner.nativepreview
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TripMapProjectionTest {
    private fun fixture() = TripDocument.parse(contractBytes("map-places.json").decodeToString())
    @Test fun malformedLegacySourceDoesNotCrashProjection() {
        val row=SavedPlaceDocument("bad-source","existing:test",Json.parseToJsonElement("""{"nativePlaceSource":{},"name":"own","lat":0,"lng":0}""").jsonObject,1,1)
        assertEquals(Coordinate(0.0,0.0),TripMapProjection.make(null,listOf(row),emptyMap()).markers.single().coordinate)
    }
    @Test fun stableTypedKeysPreserveOriginal() {
        val trip = fixture(); val bytes = trip.toJson()
        val a = TripMapProjection.make(trip, emptyList(), emptyMap())
        val expected = Json.parseToJsonElement(contractBytes("map-expected.json").decodeToString()).jsonObject
        assertEquals(expected.getValue("markerCount").jsonPrimitive.int, a.markers.size)
        assertEquals(expected.getValue("unlocatedItemCount").jsonPrimitive.int, a.unlocatedItemCount)
        assertEquals(6, a.markers.map { it.key }.toSet().size)
        assertEquals(2, a.markers.count { it.label == "같은 장소" })
        assertTrue(a.markers.any { it.coordinate == Coordinate(0.0,0.0) })
        assertEquals(35.123456789, a.markers.first { it.itemKey == ItemKey.Text("1") }.coordinate.latitude, 0.0000000001)
        val moved = TripSchedule.apply(ScheduleChange.Move(ScheduleSection.Day(1),ItemKey.Integer(1),ScheduleSection.Reserve),trip)
        val b = TripMapProjection.make(moved, emptyList(),emptyMap())
        assertEquals(a.markers.first { it.itemKey == ItemKey.Integer(1) }.key,b.markers.first { it.itemKey == ItemKey.Integer(1) }.key)
        val edited = TripSchedule.apply(ScheduleChange.Edit(ScheduleSection.Day(1),ItemKey.Integer(1),PlaceDraft(name="같은 장소",memo="바뀐 메모")),trip)
        assertEquals(a.markers,TripMapProjection.make(edited,emptyList(),emptyMap()).markers)
        assertEquals(bytes,trip.toJson())
    }
    @Test fun routeBreaksAndDatelineBounds() {
        val p = TripMapProjection.make(fixture(),emptyList(),emptyMap())
        assertEquals(listOf(1,1),p.routes.map { it.day })
        assertEquals(listOf(listOf("n:1","s:1"),listOf("s:east","s:west")),p.routes.map { it.markers.mapNotNull { it.itemKey?.token } })
        val b = MapBounds.fit(listOf(Coordinate(10.0,179.9),Coordinate(11.0,-179.9)))!!
        assertEquals(179.9,b.west,0.000001); assertEquals(-179.9,b.east,0.000001); assertEquals(0.2,b.longitudeSpan,0.000001)
        assertNull(MapBounds.fit(emptyList()))
        assertEquals(0.0,MapBounds.fit(listOf(Coordinate(0.0,0.0)))!!.longitudeSpan,0.0)
    }
    @Test fun invalidCoordinatesAreNotZero() {
        listOf(91.0 to 0.0,0.0 to 181.0,Double.NaN to 1.0,1.0 to Double.POSITIVE_INFINITY).forEach { (lat,lng) ->
            assertThrows(IllegalArgumentException::class.java) { Coordinate(lat,lng) }
        }
        listOf(JsonPrimitive(true),JsonPrimitive("35"),JsonPrimitive("NaN"),JsonNull).forEach {
            assertNull(Coordinate.from(JsonObject(mapOf("lat" to it,"lng" to JsonPrimitive(1)))))
        }
        assertEquals(-90.0,Coordinate(-90.0,-180.0).latitude,0.0)
    }
    @Test fun googleExpiryDoesNotFallBackToStoredCoordinate() {
        val row = SavedPlaceDocument("favorite","google:Place-A",Json.parseToJsonElement("""{"name":"내 장소","placeId":"Place-A","nativePlaceSource":"google","lat":1,"lng":2}""").jsonObject,1,1)
        val point = Coordinate(37.0,127.0)
        val result = ResolvedPlace("Place-A",point,"Google name","Google address",emptyList(),1000000)
        val fresh = TripMapProjection.make(null,listOf(row),mapOf("Place-A" to result),1000000)
        assertEquals(point,fresh.markers.single().coordinate); assertEquals("내 장소",fresh.markers.single().label)
        assertEquals("favorite",fresh.markers.single().favoriteID)
        val expired = TripMapProjection.make(null,listOf(row),mapOf("Place-A" to result),1300000)
        assertTrue(expired.markers.isEmpty()); assertEquals(1,expired.unlocatedItemCount)
        assertTrue(TripMapProjection.make(null,listOf(row),emptyMap(),1000000).markers.isEmpty())
        assertThrows(IllegalArgumentException::class.java) { PlaceSelection(PlaceReference.Google(" ")).validated() }
        assertThrows(IllegalArgumentException::class.java) { PlaceSelection(PlaceReference.Google("x".repeat(1025))).validated() }
        assertEquals(PlaceReference.Google("Place-A"),PlaceSelection(PlaceReference.Google(" Place-A ")).validated().reference)
        assertThrows(IllegalArgumentException::class.java) { PlaceSelection(PlaceReference.Existing).validated() }
    }
}
