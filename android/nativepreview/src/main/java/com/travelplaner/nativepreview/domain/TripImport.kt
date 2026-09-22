package com.travelplaner.nativepreview.domain

class ImportCandidate internal constructor(val sourceHash: String, sourceBytes: ByteArray, val trip: TripDocument, val warnings: List<String>) {
    private val original = sourceBytes.copyOf()
    val sourceBytes: ByteArray get() = original.copyOf()
}
enum class ImportDisposition { NewTrip, AlreadyImported, IdenticalExisting, Conflict, PreviouslyDeleted }
data class ImportPreview internal constructor(val candidate: ImportCandidate, val disposition: ImportDisposition, val targetID: String, val expectedExistingHash: String?, val expectedReceiptHash: String?)
enum class ImportDecision { ConfirmNew, KeepBoth, RestoreDeleted }
data class ImportOutcome(val tripID: String, val created: Boolean, val alreadyImported: Boolean)
