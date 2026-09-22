package com.travelplaner.nativepreview.data

import androidx.room.withTransaction
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface TripRepository {
    suspend fun list(): List<TripDocument>
    suspend fun create(draft: TripDraft, id: String): TripDocument
    suspend fun edit(id: String, draft: TripDraft): TripDocument
    suspend fun applyMemoryChange(tripID: String, change: MemoryChange): TripDocument
    suspend fun applySchedule(tripID: String, change: ScheduleChange): TripDocument
    suspend fun upsertExpense(tripID: String, expenseID: String, fields: JsonObject): TripDocument
    suspend fun deleteExpense(tripID: String, expenseID: String): TripDocument
    suspend fun updateBudgetSettings(tripID: String, values: JsonObject): TripDocument
    suspend fun updateSettlementParticipants(tripID: String, participants: JsonArray): TripDocument
    suspend fun prepareImport(candidate: ImportCandidate): ImportPreview
    suspend fun commitImport(preview: ImportPreview, decision: ImportDecision): ImportOutcome
    suspend fun listSavedPlaces(): List<SavedPlaceDocument>
    suspend fun savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String): SavedPlaceDocument
    suspend fun deleteSavedPlace(id: String)
}

class RoomTripRepository(private val database: TripDatabase) : TripRepository {
    override suspend fun listSavedPlaces(): List<SavedPlaceDocument> = withContext(Dispatchers.IO) {
        database.savedPlaces().list().map(::savedDocument)
    }
    override suspend fun savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String): SavedPlaceDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val payload = selection.durablePayload(id,draft); val source = selection.sourceKey(id)
            val dao = database.savedPlaces()
            dao.find(id)?.let {
                require(it.sourceKey == source) { "같은 저장 요청의 내용이 변경되었습니다." }
                return@withTransaction savedDocument(it)
            }
            dao.findSource(source)?.let { return@withTransaction savedDocument(it) }
            val now = System.currentTimeMillis()
            val row = SavedPlaceEntity(id,source,payload.toString(),now,now)
            dao.insert(row)
            val saved = savedDocument(checkNotNull(dao.find(id)))
            check(saved.payload == payload)
            saved
        }
    }
    override suspend fun deleteSavedPlace(id: String): Unit = withContext(Dispatchers.IO) {
        database.withTransaction { database.savedPlaces().delete(id) }
    }
    private fun savedDocument(row: SavedPlaceEntity): SavedPlaceDocument {
        val payload = Json.parseToJsonElement(row.payload).jsonObject
        check(payload["id"] == JsonPrimitive(row.id)) { "저장된 장소 정보를 읽지 못했어요. 원본은 보존됩니다." }
        return SavedPlaceDocument(row.id,row.sourceKey,payload,row.createdAt,row.updatedAt)
    }
    override suspend fun applySchedule(tripID: String, change: ScheduleChange): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val trip = database.trips().find(tripID)?.let(::document) ?: throw IllegalArgumentException("여행을 찾을 수 없어요.")
            store(TripSchedule.apply(change, trip))
        }
    }
    override suspend fun applyMemoryChange(tripID: String, change: MemoryChange): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val current = database.trips().find(tripID)?.let(::document) ?: throw IllegalArgumentException("여행을 찾을 수 없어요.")
            val next = TripMemory.apply(change, current, System.currentTimeMillis())
            if (next.json == current.json) current else store(next)
        }
    }
    override suspend fun upsertExpense(tripID: String, expenseID: String, fields: JsonObject): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val current = database.trips().find(tripID)?.let(::document) ?: throw IllegalArgumentException("여행을 찾을 수 없어요.")
            val entries = current.json["expenses"]?.jsonArray.orEmpty()
            val merged = entries.map { element ->
                val objectValue = element.jsonObject
                if (objectValue["id"]?.jsonPrimitive?.content == expenseID) JsonObject(objectValue + fields + ("id" to JsonPrimitive(expenseID))) else objectValue
            }.toMutableList()
            if (merged.none { it.jsonObject["id"]?.jsonPrimitive?.content == expenseID }) merged += JsonObject(fields + ("id" to JsonPrimitive(expenseID)))
            return@withTransaction store(updatedRaw(current, "expenses" to JsonArray(merged)))
        }
    }
    override suspend fun deleteExpense(tripID: String, expenseID: String): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val current = database.trips().find(tripID)?.let(::document) ?: throw IllegalArgumentException("여행을 찾을 수 없어요.")
            val entries = current.json["expenses"]?.jsonArray.orEmpty()
            store(updatedRaw(current, "expenses" to JsonArray(entries.filterNot { it.jsonObject["id"]?.jsonPrimitive?.content == expenseID })))
        }
    }
    override suspend fun updateBudgetSettings(tripID: String, values: JsonObject): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val current = database.trips().find(tripID)?.let(::document) ?: throw IllegalArgumentException("여행을 찾을 수 없어요.")
            val settings = current.json["budgetSettings"]?.jsonObject ?: buildJsonObject { }
            store(updatedRaw(current, "budgetSettings" to JsonObject(settings + values)))
        }
    }
    override suspend fun updateSettlementParticipants(tripID: String, participants: JsonArray): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val current = database.trips().find(tripID)?.let(::document) ?: throw IllegalArgumentException("여행을 찾을 수 없어요.")
            store(updatedRaw(current, "settlementParticipants" to participants))
        }
    }
    override suspend fun prepareImport(candidate: ImportCandidate): ImportPreview = withContext(Dispatchers.IO) {
        database.withTransaction { preview(candidate) }
    }
    private suspend fun preview(candidate: ImportCandidate): ImportPreview {
        val receipt = database.receipts().find(candidate.sourceHash)
        val lookup = receipt?.targetID ?: candidate.trip.id
        val existing = database.trips().find(lookup)
        val disposition = when {
            receipt != null -> if (existing != null) ImportDisposition.AlreadyImported else ImportDisposition.PreviouslyDeleted
            existing == null -> ImportDisposition.NewTrip
            document(existing).json == candidate.trip.json -> ImportDisposition.IdenticalExisting
            else -> ImportDisposition.Conflict
        }
        val target = if (disposition in listOf(ImportDisposition.Conflict, ImportDisposition.PreviouslyDeleted)) UUID.randomUUID().toString() else lookup
        return ImportPreview(candidate, disposition, target, existing?.json?.encodeToByteArray()?.let(TripBackup::hash), receipt?.let(::receiptHash))
    }
    override suspend fun commitImport(preview: ImportPreview, decision: ImportDecision): ImportOutcome = withContext(Dispatchers.IO) {
        database.withTransaction {
            val fresh = preview(preview.candidate)
            require(fresh.disposition == preview.disposition && fresh.expectedExistingHash == preview.expectedExistingHash && fresh.expectedReceiptHash == preview.expectedReceiptHash) { "내용이 바뀌어 다시 확인이 필요합니다. 파일을 다시 선택해주세요." }
            val disposition = preview.disposition
            if (disposition == ImportDisposition.AlreadyImported) {
                check(fresh.targetID == preview.targetID)
                return@withTransaction ImportOutcome(fresh.targetID, created = false, alreadyImported = true)
            }
            require((disposition in listOf(ImportDisposition.NewTrip, ImportDisposition.IdenticalExisting) && decision == ImportDecision.ConfirmNew) ||
                (disposition == ImportDisposition.Conflict && decision == ImportDecision.KeepBoth) ||
                (disposition == ImportDisposition.PreviouslyDeleted && decision == ImportDecision.RestoreDeleted)) { "기존 여행을 보존하기 위해 가져오기 방법을 확인해주세요." }
            val trip = TripDocument.parse(JsonObject(preview.candidate.trip.json + ("id" to JsonPrimitive(preview.targetID))).toString())
            if (disposition != ImportDisposition.IdenticalExisting) {
                require(database.trips().find(trip.id) == null) { "여행이 변경되었어요. 다시 확인해주세요." }
                store(trip)
            }
            val receipts = database.receipts(); val old = receipts.find(preview.candidate.sourceHash)
            val previous = old?.previousTargetIDs?.let { Json.parseToJsonElement(it).jsonArray.toMutableList() } ?: mutableListOf()
            if (disposition == ImportDisposition.PreviouslyDeleted && old != null) previous.add(JsonPrimitive(old.targetID))
            val receipt = ImportReceiptEntity(preview.candidate.sourceHash, preview.candidate.sourceBytes, trip.id, JsonArray(previous).toString(), System.currentTimeMillis())
            if (old == null) receipts.insert(receipt) else check(receipts.update(receipt) == 1)
            check(document(checkNotNull(database.trips().find(trip.id))).json == trip.json) { "저장한 여행을 확인하지 못했어요." }
            check(receipts.find(receipt.sourceHash)?.sourceBytes?.contentEquals(receipt.sourceBytes) == true) { "백업 원본을 확인하지 못했어요." }
            ImportOutcome(trip.id, disposition != ImportDisposition.IdenticalExisting, alreadyImported = false)
        }
    }
    private fun receiptHash(receipt: ImportReceiptEntity): String = TripBackup.hash(buildJsonObject {
        put("sourceHash", receipt.sourceHash); put("source", TripBackup.hash(receipt.sourceBytes)); put("targetID", receipt.targetID)
        put("previous", receipt.previousTargetIDs); put("importedAt", receipt.importedAt)
    }.toString().encodeToByteArray())
    override suspend fun list(): List<TripDocument> = withContext(Dispatchers.IO) {
        database.trips().list().map(::document)
    }

    override suspend fun create(draft: TripDraft, id: String): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val existing = database.trips().find(id)?.let(::document)
            // A saved operation ID makes retries after commit/process death idempotent.
            store(existing?.edit(draft) ?: TripDocument.create(draft, id))
        }
    }

    override suspend fun edit(id: String, draft: TripDraft): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction {
            val existing = database.trips().find(id)?.let(::document)
                ?: throw IllegalArgumentException("여행을 찾을 수 없어요. 목록을 다시 불러와 주세요.")
            // Re-read inside the transaction so edits cannot overwrite unseen JSON fields.
            store(existing.edit(draft))
        }
    }

    suspend fun save(trip: TripDocument): TripDocument = withContext(Dispatchers.IO) {
        database.withTransaction { store(trip) }
    }

    private suspend fun store(trip: TripDocument): TripDocument {
        val dao = database.trips()
        val existing = dao.find(trip.id)
        if (existing != null) {
            val original = document(existing)
            require(original.json["createdAt"] == trip.json["createdAt"]) { "기존 여행의 생성 시각을 변경할 수 없어요." }
        }
        val entity = TripEntity(trip.id, trip.toJson(), trip.updatedAt)
        if (existing == null) dao.insert(entity) else check(dao.update(entity) == 1)
        val persisted = document(checkNotNull(dao.find(trip.id)))
        check(persisted.json == trip.json) { "저장한 여행을 다시 확인하지 못했어요." }
        return persisted
    }

    private fun updatedRaw(trip: TripDocument, vararg change: Pair<String, JsonElement>): TripDocument {
        val next = buildJsonObject {
            trip.json.forEach { (key, value) -> put(key, value) }
            change.forEach { (key, value) -> put(key, value) }
            put("updatedAt", JsonPrimitive(maxOf(System.currentTimeMillis(), trip.updatedAt + 1)))
        }
        return TripDocument.parse(next.toString())
    }

    private fun document(entity: TripEntity): TripDocument = TripDocument.parse(entity.json).also {
        check(it.id == entity.id && it.updatedAt == entity.updatedAt) { "여행의 저장 정보가 일치하지 않아요." }
    }
}
