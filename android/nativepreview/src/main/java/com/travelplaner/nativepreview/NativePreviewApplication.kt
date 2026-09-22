package com.travelplaner.nativepreview

import android.app.Application
import com.travelplaner.nativepreview.data.RoomTripRepository
import com.travelplaner.nativepreview.data.TravelMediaStore
import com.travelplaner.nativepreview.data.MemoryDraftStore
import com.travelplaner.nativepreview.data.TripDatabase
import com.travelplaner.nativepreview.data.TripRepository

class NativePreviewApplication : Application() {
    val repository: TripRepository by lazy { RoomTripRepository(TripDatabase.open(this)) }
    val mediaStore: TravelMediaStore by lazy { TravelMediaStore(filesDir.resolve("TripPlotNative/media")) }
    val memoryDraftStore: MemoryDraftStore by lazy { MemoryDraftStore(filesDir.resolve("TripPlotNative/drafts")) }

    override fun onCreate() {
        super.onCreate()
        val staleDrafts = memoryDraftStore.removeStaleJournals()
        staleDrafts.forEach { draft ->
            draft.stagedPhotoFileName?.let { fileName ->
                runCatching { mediaStore.remove(mediaStore.reference(draft.tripId, fileName)) }
            }
        }
    }
}
