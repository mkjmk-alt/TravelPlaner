import Foundation
import CoreData

public final class TripRepository {
    private let context: NSManagedObjectContext
    private static let accessLock = NSRecursiveLock()
    var beforeReceiptWrite: (() throws -> Void)?

    public init(url: URL) throws {
        Self.accessLock.lock(); defer { Self.accessLock.unlock() }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try TripStoreModel.migrateIfNeeded(at: url)
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.current)
        try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: nil)
        context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
        context.persistentStoreCoordinator = coordinator
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

    public func save(_ trip: TripDocument) throws {
        try transaction { try write(trip) }
    }

    public func applyMemoryChange(tripID: String, change: MemoryChange, now: Double = floor(Date().timeIntervalSince1970 * 1000)) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            let current = try TripDocument(data: bytes)
            let next = try TripMemory.apply(change, to: current, now: now)
            if try next.encoded() == current.encoded() { return current }
            try write(next)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            guard try TripDocument(data: saved).encoded() == next.encoded() else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func upsertExpense(tripID: String, expenseID: String, fields: [String: Any]) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
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
            try write(next)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func deleteExpense(tripID: String, expenseID: String) throws {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            var raw = try TripDocument(data: bytes).raw
            guard let existing = raw["expenses"] else { return }
            guard let entries = existing as? [[String: Any]] else { throw TripError.invalidDocument }
            raw["expenses"] = entries.filter { ($0["id"] as? String) != expenseID }
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            try write(TripDocument(data: JSONSerialization.data(withJSONObject: raw)))
        }
    }

    public func updateBudgetSettings(tripID: String, values: [String: Any]) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            var raw = try TripDocument(data: bytes).raw
            var settings = (raw["budgetSettings"] as? [String: Any]) ?? [:]
            values.forEach { settings[$0.key] = $0.value }
            raw["budgetSettings"] = settings
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            let next = try TripDocument(data: JSONSerialization.data(withJSONObject: raw)); try write(next)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func updateSettlementParticipants(tripID: String, participants: [[String: Any]]) throws -> TripDocument {
        try transaction {
            guard let row = try find(tripID), let bytes = row.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            var raw = try TripDocument(data: bytes).raw
            raw["settlementParticipants"] = participants
            raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), ((raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0) + 1)
            let next = try TripDocument(data: JSONSerialization.data(withJSONObject: raw)); try write(next)
            guard let saved = try find(tripID)?.value(forKey: "payload") as? Data else { throw TripError.invalidDocument }
            return try TripDocument(data: saved)
        }
    }

    public func delete(id: String) throws {
        try transaction { if let record = try find(id) { context.delete(record) } }
    }

    public func listSavedPlaces() throws -> [SavedPlaceDocument] {
        try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")
            request.sortDescriptors = [NSSortDescriptor(key: "updatedAt", ascending: false), NSSortDescriptor(key: "id", ascending: true)]
            return try context.fetch(request).map(savedDocument)
        }
    }
    public func savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String) throws -> SavedPlaceDocument {
        try transaction {
            let payload = try selection.durablePayload(id: id, draft: draft)
            let sourceKey = try selection.sourceKey(creationID: id)
            if let sameID = try savedRecord(field: "id", value: id) {
                let old = try savedDocument(sameID)
                guard old.sourceKey == sourceKey else { throw PlaceError.conflictingOperation }
                // Same source is already saved: never silently overwrite its user memo.
                return old
            }
            if let duplicate = try savedRecord(field: "sourceKey", value: sourceKey) { return try savedDocument(duplicate) }
            let row = NSEntityDescription.insertNewObject(forEntityName: "SavedPlaceRecord", into: context)
            let now = floor(Date().timeIntervalSince1970 * 1000)
            row.setValue(id, forKey: "id"); row.setValue(sourceKey, forKey: "sourceKey")
            row.setValue(try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]), forKey: "payload")
            row.setValue(now, forKey: "createdAt"); row.setValue(now, forKey: "updatedAt")
            return try savedDocument(row)
        }
    }
    public func deleteSavedPlace(id: String) throws {
        try transaction { if let record = try savedRecord(field: "id", value: id) { context.delete(record) } }
    }
    private func savedRecord(field: String, value: String) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")
        request.predicate = NSPredicate(format: "%K == %@", field, value); request.fetchLimit = 1
        return try context.fetch(request).first
    }
    private func savedDocument(_ row: NSManagedObject) throws -> SavedPlaceDocument {
        guard let id = row.value(forKey: "id") as? String, let source = row.value(forKey: "sourceKey") as? String,
              let bytes = row.value(forKey: "payload") as? Data, let payload = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              payload["id"] as? String == id, let created = row.value(forKey: "createdAt") as? Double,
              let updated = row.value(forKey: "updatedAt") as? Double else { throw TripError.invalidDocument }
        return .init(id: id, sourceKey: source, payload: payload, createdAt: created, updatedAt: updated)
    }

    public func applySchedule(tripID: String, change: ScheduleChange) throws -> TripDocument {
        try transaction {
            guard let bytes = try find(tripID)?.value(forKey: "payload") as? Data else { throw ScheduleError.missingItem }
            let next = try TripSchedule.apply(change, to: TripDocument(data: bytes)); try write(next)
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
    private func write(_ trip: TripDocument) throws {
        let row = try find(trip.id) ?? NSEntityDescription.insertNewObject(forEntityName: "TripRecord", into: context)
        row.setValue(trip.id, forKey: "id"); row.setValue(try trip.encoded(), forKey: "payload"); row.setValue(trip.updatedAt, forKey: "updatedAt")
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
