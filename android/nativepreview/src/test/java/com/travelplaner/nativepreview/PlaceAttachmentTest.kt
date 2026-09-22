package com.travelplaner.nativepreview
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class PlaceAttachmentTest {
    @Test fun preservesExistingExtrasAndNewGoogleOnlyStoresUserFields() {
        val trip=TripDocument.parse(contractBytes("map-places.json").decodeToString())
        val item=TripSchedule.items(ScheduleSection.Day(1),trip)[0]
        val selection=PlaceSelection(PlaceReference.Existing,item,trip.id,ItemKey.Integer(1))
        val id=UUID.randomUUID().toString()
        val copy=TripSchedule.apply(ScheduleChange.AddPlace(ScheduleSection.Reserve,id,PlaceDraft.from(item),selection),trip)
        val copied=TripSchedule.items(ScheduleSection.Reserve,copy).last()
        assertEquals(item["futureField"],copied["futureField"]); assertEquals(item["lat"],copied["lat"]); assertEquals(JsonPrimitive(id),copied["id"])
        val google=PlaceSelection(PlaceReference.Google(" ID-A "),item,trip.id,ItemKey.Integer(1))
        val change=ScheduleChange.AddPlace(ScheduleSection.Day(2),UUID.randomUUID().toString(),PlaceDraft(name="내 이름"),google)
        val added=TripSchedule.apply(change,trip)
        val row=TripSchedule.items(ScheduleSection.Day(2),added).last()
        assertEquals(JsonPrimitive("ID-A"),row["placeId"]); assertEquals(JsonPrimitive("google"),row["nativePlaceSource"])
        assertNull(row["lat"]); assertNull(row["lng"]); assertNull(row["futureField"])
        assertEquals(added.json,TripSchedule.apply(change,added).json)
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(change.copy(draft=PlaceDraft(name="다름")),added) }
        assertThrows(IllegalArgumentException::class.java) { TripSchedule.apply(change.copy(section=ScheduleSection.Day(99)),trip) }
    }
    @Test fun manualOriginAndUnlocatedAreDifferent() {
        val trip=TripDocument.parse(contractBytes("map-places.json").decodeToString())
        for(reference in listOf(PlaceReference.Manual(Coordinate(0.0,0.0)),PlaceReference.Unlocated)) {
            val result=TripSchedule.apply(ScheduleChange.AddPlace(ScheduleSection.Reserve,UUID.randomUUID().toString(),PlaceDraft(name="직접"),PlaceSelection(reference)),trip)
            val row=TripSchedule.items(ScheduleSection.Reserve,result).last()
            if(reference is PlaceReference.Manual) assertEquals(Coordinate(0.0,0.0),Coordinate.from(row)) else assertNull(Coordinate.from(row))
        }
    }
}
