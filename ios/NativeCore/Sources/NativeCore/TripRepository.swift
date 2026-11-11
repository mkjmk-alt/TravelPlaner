import Foundation
import CoreData

public struct RemoteHydrationResult {
    public let appliedRecordCount: Int
    public let deletedRecordCount: Int
    public let retainedLocalDraftCount: Int
    public let retainedPendingEditCount: Int
    public let retainedConflictCount: Int
    public let retainedOtherAccountCount: Int
    public let retainedDuplicatePlaceCount: Int

    public init(appliedRecordCount: Int = 0, deletedRecordCount: Int = 0,
                retainedLocalDraftCount: Int = 0, retainedPendingEditCount: Int = 0,
                retainedConflictCount: Int = 0, retainedOtherAccountCount: Int = 0,
                retainedDuplicatePlaceCount: Int = 0) {
        self.appliedRecordCount = appliedRecordCount
        self.deletedRecordCount = deletedRecordCount
        self.retainedLocalDraftCount = retainedLocalDraftCount
        self.retainedPendingEditCount = retainedPendingEditCount
        self.retainedConflictCount = retainedConflictCount
        self.retainedOtherAccountCount = retainedOtherAccountCount
        self.retainedDuplicatePlaceCount = retainedDuplicatePlaceCount
    }
}

public final class TripRepository {
    private let context: NSManagedObjectContext
    private let outbox: SyncOutboxRepository
    static let accessLock = NSRecursiveLock()
    var beforeReceiptWrite: (() throws -> Void)?

    public init(url: URL) throws {
        Self.accessLock.lock(); defer { Self.accessLock.unlock() }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try TripStoreModel.migrateIfNeeded(at: url)
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.sync)
        try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: nil)
        context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
        context.persistentStoreCoordinator = coordinator
        outbox = SyncOutboxRepository(context: context)
    }

    public func list() throws -> [TripDocument] {
        try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "TripRecord")
            request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false), NSSortDescriptor(key: "id", ascending: true)]
            return try context.fetch(request).map { record in
                guard let data = record.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
                return try TripDocument(data: data)
            }
        }
    }

    public func list(userID: String?) throws -> [TripDocument] {
        try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "TripRecord")
            request.predicate = Self.accountScopePredicate(userID: userID)
            request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false), NSSortDescriptor(key: "id", ascending: true)]
            return try context.fetch(request).map { record in
                guard let data = record.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
                return try TripDocument(data: data)
            }
        }
    }

    public func makeSyncEngine(transport: SyncTransport) -> SyncEngine {
        SyncEngine(transport: transport, outbox: outbox, states: SyncRecordStateStore(context: context))
    }

    public func syncRecords(userID: String) throws -> [SyncRecord] {
        guard !userID.isEmpty else { throw SyncError.accountMismatch }
        return try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncRecordStateRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            request.sortDescriptors = [NSSortDescriptor(key: "recordType", ascending: true),
                                       NSSortDescriptor(key: "recordID", ascending: true)]
            return try context.fetch(request).map { row in
                guard let bytes = row.value(forKey: "record") as? Data else { throw SyncError.invalidRecord }
                return try SyncRecord(data: bytes)
            }
        }
    }

    public func applyRemoteRecords(_ records: [SyncRecord], userID: String) throws -> RemoteHydrationResult {
        guard !userID.isEmpty else { throw SyncError.accountMismatch }
        return try transaction {
            var applied = 0
            var deleted = 0
            var localDrafts = 0
            var pendingEdits = 0
            var conflicts = 0
            var otherAccounts = 0
            var duplicatePlaces = 0

            for incoming in records {
                guard incoming.userID == userID else { throw SyncError.accountMismatch }
                _ = try incoming.encoded()
                try SyncOutboxRepository.applyRemote(incoming, in: context)

                guard let state = try SyncOutboxRepository.findState(userID: userID, recordType: incoming.recordType,
                                                                     recordID: incoming.recordID, in: context),
                      let bytes = state.value(forKey: "record") as? Data else { throw SyncError.invalidRecord }
                let current = try SyncRecord(data: bytes)
                switch try applyRemoteDomainRecord(current, userID: userID) {
                case .applied: applied += 1
                case .deleted: deleted += 1
                case .retainedLocalDraft: localDrafts += 1
                case .retainedPendingEdit: pendingEdits += 1
                case .retainedConflict: conflicts += 1
                case .retainedOtherAccount: otherAccounts += 1
                case .retainedDuplicatePlace: duplicatePlaces += 1
                case .unchanged: break
                }
            }
            return RemoteHydrationResult(appliedRecordCount: applied, deletedRecordCount: deleted,
                                         retainedLocalDraftCount: localDrafts, retainedPendingEditCount: pendingEdits,
                                         retainedConflictCount: conflicts, retainedOtherAccountCount: otherAccounts,
                                         retainedDuplicatePlaceCount: duplicatePlaces)
        }
    }

    public func resolveConflict(id: UUID, choice: SyncConflictChoice, userID: String) throws {
        guard !userID.isEmpty else { throw SyncError.accountMismatch }
        try transaction {
            guard let row = try SyncOutboxRepository.find(entity: "SyncConflictRecord", field: "conflictID",
                                                          value: id.uuidString.lowercased(), in: context) else {
                throw SyncError.missingConflict
            }
            let existing = try SyncOutboxRepository.conflict(from: row)
            guard existing.operation.userID == userID else { throw SyncError.accountMismatch }
            let resolved = try SyncOutboxRepository.resolveConflict(id: id, choice: choice, in: context)
            if case .acceptServer = choice,
               let state = try SyncOutboxRepository.findState(userID: resolved.operation.userID,
                                                              recordType: resolved.operation.recordType,
                                                              recordID: resolved.operation.recordID, in: context),
               let bytes = state.value(forKey: "record") as? Data {
                _ = try applyRemoteDomainRecord(SyncRecord(data: bytes), userID: userID)
            }
        }
    }

    public func conflicts(userID: String) throws -> [SyncConflict] {
        try outbox.conflicts(userID: userID)
    }

    public func pendingSyncCount(userID: String) throws -> Int {
        try outbox.pendingCount(userID: userID)
    }

    public func save(_ trip: TripDocument, syncContext: SyncWriteContext = .device) throws {
        try transaction {
            let existing = try find(trip.id)
            let owner = try existing.map { try writableOwner(of: $0, syncContext: syncContext) } ?? syncContext.userID
            try write(trip, newOwnerUserID: existing == nil ? owner : nil)
            if let owner { try queueTrip(trip, ownerUserID: owner) }
        }
    }

    public func applyMemoryChange(tripID: String, change: MemoryChange, now: Double = floor(Date().timeIntervalSince1970 * 1000),
                                  syncContext: SyncWriteContext = .device) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            let current = try TripDocument(data: bytes)
            let next = try TripMemory.apply(change, to: current, now: now)
            if try next.encoded() == current.encoded() { return current }
            try persist(next, ownerUserID: owner)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            guard try TripDocument(data: saved).encoded() == next.encoded() else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func upsertExpense(tripID: String, expenseID: String, fields: [String: Any],
                              syncContext: SyncWriteContext = .device) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            var raw = try TripDocument(data: bytes).raw
            var entries: [[String: Any]]
            if let existing = raw["expenses"] {
                guard let decoded = existing as? [[String: Any]] else { throw TripError.invalidDocument }
                entries = decoded
            } else { entries = [] }
            var merged = fields
            merged["id"] = expenseID
            if let index = entries.firstIndex(where: { ($0["id"] as? String) == expenseID }) {
                var current = entries[index]; merged.forEach { current[$0.key] = $0.value }; entries[index] = current
            } else { entries.append(merged) }
            raw["expenses"] = entries
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            let next = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
            try persist(next, ownerUserID: owner)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func deleteExpense(tripID: String, expenseID: String, syncContext: SyncWriteContext = .device) throws {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            var raw = try TripDocument(data: bytes).raw
            guard let existing = raw["expenses"] else { return }
            guard let entries = existing as? [[String: Any]] else { throw TripError.invalidDocument }
            raw["expenses"] = entries.filter { ($0["id"] as? String) != expenseID }
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            try persist(TripDocument(data: JSONSerialization.data(withJSONObject: raw)), ownerUserID: owner)
        }
    }

    public func updateBudgetSettings(tripID: String, values: [String: Any],
                                     syncContext: SyncWriteContext = .device) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            var raw = try TripDocument(data: bytes).raw
            var settings = (raw["budgetSettings"] as? [String: Any]) ?? [:]
            values.forEach { settings[$0.key] = $0.value }
            raw["budgetSettings"] = settings
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            let next = try TripDocument(data: JSONSerialization.data(withJSONObject: raw)); try persist(next, ownerUserID: owner)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func updateSettlementParticipants(tripID: String, participants: [[String: Any]],
                                             syncContext: SyncWriteContext = .device) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            var raw = try TripDocument(data: bytes).raw
            raw["settlementParticipants"] = participants
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            let next = try TripDocument(data: JSONSerialization.data(withJSONObject: raw)); try persist(next, ownerUserID: owner)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func delete(id: String, syncContext: SyncWriteContext = .device) throws {
        try transaction {
            guard let record = try find(id) else { return }
            let owner = try writableOwner(of: record, syncContext: syncContext)
            if let owner { try outbox.enqueueSnapshot(userID: owner, recordType: .trip, recordID: id, payload: nil, deletedAt: Date(), in: context) }
            context.delete(record)
        }
    }

    public func listSavedPlaces() throws -> [SavedPlaceDocument] {
        try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")
            request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false), NSSortDescriptor(key: "id", ascending: true)]
            return try context.fetch(request).map(savedDocument)
        }
    }

    public func listSavedPlaces(userID: String?) throws -> [SavedPlaceDocument] {
        try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")
            request.predicate = Self.accountScopePredicate(userID: userID)
            request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false), NSSortDescriptor(key: "id", ascending: true)]
            return try context.fetch(request).map(savedDocument)
        }
    }
    public func savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String,
                          syncContext: SyncWriteContext = .device) throws -> SavedPlaceDocument {
        try transaction {
            let payload = try selection.durablePayload(id: id, draft: draft)
            let sourceKey = try selection.sourceKey(creationID: id)
            if let sameID = try savedRecord(field: "id", value: id) {
                _ = try writableOwner(of: sameID, syncContext: syncContext)
                let old = try savedDocument(sameID)
                guard old.sourceKey == sourceKey else { throw PlaceError.conflictingOperation }
                // Same source is already saved: never silently overwrite its user memo.
                return old
            }
            if let duplicate = try savedRecord(field: "sourceKey", value: sourceKey, ownerUserID: syncContext.userID) {
                _ = try writableOwner(of: duplicate, syncContext: syncContext)
                return try savedDocument(duplicate)
            }
            let row = NSEntityDescription.insertNewObject(forEntityName: "SavedPlaceRecord", into: context)
            let now = floor(Date().timeIntervalSince1970 * 1000)
            row.setValue(id, forKey: "id"); row.setValue(sourceKey, forKey: "sourceKey")
            row.setValue(try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]), forKey: "payload")
            row.setValue(now, forKey: "createdAt"); row.setValue(now, forKey: "updatedAt")
            row.setValue(syncContext.userID, forKey: "ownerUserID")
            if let userID = syncContext.userID {
                try outbox.enqueueSnapshot(userID: userID, recordType: .savedPlace, recordID: id, payload: payload, deletedAt: nil, in: context)
            }
            return try savedDocument(row)
        }
    }
    public func deleteSavedPlace(id: String, syncContext: SyncWriteContext = .device) throws {
        try transaction {
            guard let record = try savedRecord(field: "id", value: id) else { return }
            let owner = try writableOwner(of: record, syncContext: syncContext)
            if let owner { try outbox.enqueueSnapshot(userID: owner, recordType: .savedPlace, recordID: id, payload: nil, deletedAt: Date(), in: context) }
            context.delete(record)
        }
    }
    private func savedRecord(field: String, value: String) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")
        request.predicate = NSPredicate(format: "%K == %@", field, value)
        request.fetchLimit = 1
        return try context.fetch(request).first
    }
    private func savedRecord(field: String, value: String, ownerUserID: String?) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")
        if let ownerUserID {
            request.predicate = NSPredicate(format: "%K == %@ AND ownerUserID == %@", field, value, ownerUserID)
        } else {
            request.predicate = NSPredicate(format: "%K == %@ AND ownerUserID == nil", field, value)
        }
        request.fetchLimit = 1
        return try context.fetch(request).first
    }
    private func savedDocument(_ row: NSManagedObject) throws -> SavedPlaceDocument {
        guard let id = row.value(forKey: "id") as? String, let source = row.value(forKey: "sourceKey") as? String,
              let bytes = row.value(forKey: "payload") as? Data, let payload = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              payload["id"] as? String == id, let created = row.value(forKey: "createdAt") as? Double,
              let updated = row.value(forKey: "updatedAt") as? Double else { throw TripError.invalidDocument }
        return .init(id: id, sourceKey: source, payload: payload, createdAt: created, updatedAt: updated)
    }

    public func saveFlightConfirmation(tripID: String, flight: FlightReceiptDraft, expected: [String: String],
                                       addToItinerary: Bool, itemID: String,
                                       syncContext: SyncWriteContext = .device) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            let current = try TripDocument(data: bytes)
            let next = try FlightConfirmation.apply(flight, to: current, expected: expected, addToItinerary: addToItinerary, itemID: itemID)
            if try next.encoded() == current.encoded() { return current }
            try persist(next, ownerUserID: owner)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data,
                  try TripDocument(data: saved).encoded() == next.encoded() else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func applySchedule(tripID: String, change: ScheduleChange,
                              syncContext: SyncWriteContext = .device) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw ScheduleError.missingItem }
            let owner = try writableOwner(of: row, syncContext: syncContext)
            let next = try TripSchedule.apply(change, to: TripDocument(data: bytes)); try persist(next, ownerUserID: owner)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data, saved == (try next.encoded()) else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }
    public func prepareImport(_ candidate: ImportCandidate) throws -> ImportPreview {
        try transaction { try preview(candidate) }
    }
    public func commitImport(_ expected: ImportPreview, decision: ImportDecision) throws -> ImportOutcome {
        try transaction {
            let fresh = try preview(expected.candidate)
            guard fresh.disposition == expected.disposition, fresh.expectedExistingHash == expected.expectedExistingHash,
                  fresh.expectedReceiptHash == expected.expectedReceiptHash else { throw BackupError.stale }
            let disposition = expected.disposition
            if disposition == .alreadyImported {
                guard fresh.targetID == expected.targetID else { throw BackupError.stale }
                return .init(tripID: fresh.targetID, created: false, alreadyImported: true)
            }
            guard (disposition == .newTrip || disposition == .identicalExisting) && decision == .confirmNew ||
                    disposition == .conflict && decision == .keepBoth || disposition == .previouslyDeleted && decision == .restoreDeleted else { throw BackupError.decision }
            var raw = expected.candidate.trip.raw
            raw["id"] = expected.targetID
            let trip = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
            if disposition != .identicalExisting {
                guard try find(trip.id) == nil else { throw BackupError.stale }
                try write(trip)
            }
            try beforeReceiptWrite?()
            let existingReceipt = try receipt(expected.candidate.sourceHash)
            var previous = try history(existingReceipt)
            if disposition == .previouslyDeleted, let target = existingReceipt?.value(forKey: "targetID") as? String { previous.append(target) }
            let row = existingReceipt ?? NSEntityDescription.insertNewObject(forEntityName: "ImportReceipt", into: context)
            row.setValue(expected.candidate.sourceHash, forKey: "sourceHash"); row.setValue(expected.candidate.sourceBytes, forKey: "sourceBytes")
            row.setValue(trip.id, forKey: "targetID"); row.setValue(try JSONSerialization.data(withJSONObject: previous), forKey: "previousTargetIDs")
            row.setValue(floor(Date().timeIntervalSince1970 * 1000), forKey: "importedAt")
            guard let payload = try find(trip.id)?.value(forKey: "payload") as? Data,
                  try TripDocument(data: payload).encoded() == trip.encoded(),
                  try receipt(expected.candidate.sourceHash)?.value(forKey: "sourceBytes") as? Data == expected.candidate.sourceBytes else { throw TripError.invalidDocument }
            return .init(tripID: trip.id, created: disposition != .identicalExisting, alreadyImported: false)
        }
    }
    func receiptSource(hash: String) throws -> Data? { try transaction { try receipt(hash)?.value(forKey: "sourceBytes") as? Data } }
    func previousImportTargets(hash: String) throws -> [String] { try transaction { try history(receipt(hash)) } }
    private func preview(_ candidate: ImportCandidate) throws -> ImportPreview {
        let row = try receipt(candidate.sourceHash)
        let lookup = row?.value(forKey: "targetID") as? String ?? candidate.trip.id
        let bytes = try find(lookup)?.value(forKey: "payload") as? Data
        let existingHash = bytes.map(TripBackup.hash), receiptHash = try row.map(hashReceipt)
        let disposition: ImportDisposition
        if row != nil { disposition = bytes == nil ? .previouslyDeleted : .alreadyImported }
        else if let bytes { disposition = try TripDocument(data: bytes).encoded() == candidate.trip.encoded() ? .identicalExisting : .conflict }
        else { disposition = .newTrip }
        let target = disposition == .conflict || disposition == .previouslyDeleted ? UUID().uuidString : lookup
        return .init(candidate: candidate, disposition: disposition, targetID: target, expectedExistingHash: existingHash, expectedReceiptHash: receiptHash)
    }
    private func write(_ trip: TripDocument, newOwnerUserID: String? = nil) throws {
        let existing = try find(trip.id)
        let row = existing ?? NSEntityDescription.insertNewObject(forEntityName: "TripRecord", into: context)
        row.setValue(trip.id, forKey: "id"); row.setValue(try trip.encoded(), forKey: "payload"); row.setValue(trip.updatedAt, forKey: "updatedAt")
        if existing == nil { row.setValue(newOwnerUserID, forKey: "ownerUserID") }
    }
    private func persist(_ trip: TripDocument, ownerUserID: String?) throws {
        try write(trip)
        if let ownerUserID { try queueTrip(trip, ownerUserID: ownerUserID) }
    }
    private func queueTrip(_ trip: TripDocument, ownerUserID: String) throws {
        try outbox.enqueueSnapshot(userID: ownerUserID, recordType: .trip, recordID: trip.id,
                                   payload: trip.raw, deletedAt: nil, in: context)
    }
    private func writableOwner(of row: NSManagedObject, syncContext: SyncWriteContext) throws -> String? {
        guard let owner = row.value(forKey: "ownerUserID") as? String else { return nil }
        guard syncContext.userID == owner else { throw SyncError.accountMismatch }
        return owner
    }

    private enum RemoteDomainDisposition {
        case applied, deleted, retainedLocalDraft, retainedPendingEdit, retainedConflict
        case retainedOtherAccount, retainedDuplicatePlace, unchanged
    }

    private func applyRemoteDomainRecord(_ record: SyncRecord, userID: String) throws -> RemoteDomainDisposition {
        guard record.userID == userID else { throw SyncError.accountMismatch }
        if try SyncOutboxRepository.hasPendingOrConflict(userID: userID, recordType: record.recordType,
                                                         recordID: record.recordID, in: context) {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncConflictRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            let hasConflict = try context.fetch(request).contains { row in
                let value = try SyncOutboxRepository.conflict(from: row)
                return value.operation.recordType == record.recordType && value.operation.recordID == record.recordID
            }
            return hasConflict ? .retainedConflict : .retainedPendingEdit
        }

        switch record.recordType {
        case .trip:
            let existing = try find(record.recordID)
            if let existing, let owner = existing.value(forKey: "ownerUserID") as? String, owner != userID {
                return .retainedOtherAccount
            }
            if let existing, existing.value(forKey: "ownerUserID") == nil {
                return .retainedLocalDraft
            }
            if record.deletedAt != nil {
                guard let existing else { return .unchanged }
                context.delete(existing)
                return .deleted
            }
            guard let payload = record.payload,
                  JSONSerialization.isValidJSONObject(payload),
                  let trip = try? TripDocument(data: JSONSerialization.data(withJSONObject: payload)),
                  trip.id == record.recordID else { throw SyncError.invalidRecord }
            try write(trip, newOwnerUserID: userID)
            return .applied

        case .savedPlace:
            let existing = try savedRecord(field: "id", value: record.recordID)
            if let existing, let owner = existing.value(forKey: "ownerUserID") as? String, owner != userID {
                return .retainedOtherAccount
            }
            if let existing, existing.value(forKey: "ownerUserID") == nil {
                return .retainedLocalDraft
            }
            if record.deletedAt != nil {
                guard let existing else { return .unchanged }
                context.delete(existing)
                return .deleted
            }
            guard let payload = record.payload, JSONSerialization.isValidJSONObject(payload),
                  payload["id"] as? String == record.recordID else { throw SyncError.invalidRecord }
            let sourceKey = remoteSourceKey(payload: payload, recordID: record.recordID)
            if let duplicate = try savedRecord(field: "sourceKey", value: sourceKey, ownerUserID: userID),
               duplicate.value(forKey: "id") as? String != record.recordID {
                return .retainedDuplicatePlace
            }
            let row = existing ?? NSEntityDescription.insertNewObject(forEntityName: "SavedPlaceRecord", into: context)
            let encoded = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
            row.setValue(record.recordID, forKey: "id")
            row.setValue(sourceKey, forKey: "sourceKey")
            row.setValue(encoded, forKey: "payload")
            row.setValue(remoteMilliseconds(payload["createdAt"]) ?? record.updatedAt.timeIntervalSince1970 * 1000, forKey: "createdAt")
            row.setValue(remoteMilliseconds(payload["updatedAt"]) ?? record.updatedAt.timeIntervalSince1970 * 1000, forKey: "updatedAt")
            row.setValue(userID, forKey: "ownerUserID")
            return .applied
        }
    }

    private func remoteSourceKey(payload: [String: Any], recordID: String) -> String {
        if let sourceKey = payload["sourceKey"] as? String, !sourceKey.isEmpty { return sourceKey }
        if let placeID = (payload["placeId"] as? String) ?? (payload["place_id"] as? String), !placeID.isEmpty {
            return "google:" + placeID
        }
        return "manual:" + recordID
    }

    private func remoteMilliseconds(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber else { return nil }
        let result = number.doubleValue
        return result.isFinite && result > 0 ? result : nil
    }

    private static func accountScopePredicate(userID: String?) -> NSPredicate {
        guard let userID, !userID.isEmpty else {
            return NSPredicate(format: "ownerUserID == nil")
        }
        return NSCompoundPredicate(orPredicateWithSubpredicates: [
            NSPredicate(format: "ownerUserID == nil"),
            NSPredicate(format: "ownerUserID == %@", userID)
        ])
    }
    private func receipt(_ hash: String) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "ImportReceipt"); request.predicate = NSPredicate(format: "sourceHash == %@", hash); request.fetchLimit = 1
        return try context.fetch(request).first
    }
    private func history(_ receipt: NSManagedObject?) throws -> [String] {
        guard let receipt else { return [] }
        guard let data = receipt.value(forKey: "previousTargetIDs") as? Data, let ids = try JSONSerialization.jsonObject(with: data) as? [String] else { throw TripError.invalidDocument }
        return ids
    }
    private func hashReceipt(_ row: NSManagedObject) throws -> String {
        guard let source = row.value(forKey: "sourceBytes") as? Data else { throw TripError.invalidDocument }
        let fields: [String: Any] = ["sourceHash": row.value(forKey: "sourceHash")!, "source": TripBackup.hash(source), "targetID": row.value(forKey: "targetID")!, "previous": try history(row), "importedAt": row.value(forKey: "importedAt")!]
        return TripBackup.hash(try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]))
    }
    private func transaction<T>(_ body: () throws -> T) throws -> T {
        Self.accessLock.lock(); defer { Self.accessLock.unlock() }
        return try context.performAndWait {
            context.reset()
            do { let result = try body(); if context.hasChanges { try context.save() }; return result }
            catch { context.rollback(); throw error }
        }
    }

    private func find(_ id: String) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "TripRecord")
        request.predicate = NSPredicate(format: "id == %@", id)
        request.fetchLimit = 1
        return try context.fetch(request).first
    }
}
