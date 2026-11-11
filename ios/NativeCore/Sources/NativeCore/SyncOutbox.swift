import Foundation
import CoreData

public final class SyncOutboxRepository {
    private let context: NSManagedObjectContext

    public convenience init(url: URL) throws {
        TripRepository.accessLock.lock(); defer { TripRepository.accessLock.unlock() }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try TripStoreModel.migrateIfNeeded(at: url)
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.sync)
        try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: nil)
        let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
        context.persistentStoreCoordinator = coordinator
        self.init(context: context)
    }

    init(context: NSManagedObjectContext) {
        self.context = context
    }

    public func enqueue(_ operation: SyncOperation) throws {
        try transaction { try Self.enqueue(operation, in: context) }
    }

    public func pending(userID: String, limit: Int = 100) throws -> [SyncOperation] {
        guard !userID.isEmpty, limit > 0 else { return [] }
        return try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncOutboxRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true),
                                       NSSortDescriptor(key: "operationID", ascending: true)]
            request.fetchLimit = limit
            return try context.fetch(request).map(Self.operation(from:))
        }
    }

    public func pendingCount(userID: String) throws -> Int {
        guard !userID.isEmpty else { return 0 }
        return try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncOutboxRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            return try context.count(for: request)
        }
    }

    public func markApplied(operationID: UUID, revision: Int64) throws {
        guard revision >= 0 else { throw SyncError.invalidRecord }
        try transaction {
            guard let row = try Self.find(entity: "SyncOutboxRecord", field: "operationID", value: operationID.uuidString.lowercased(), in: context) else {
                throw SyncError.missingOperation
            }
            let operation = try Self.operation(from: row)
            let record = SyncRecord(userID: operation.userID, recordType: operation.recordType,
                                    recordID: operation.recordID, payload: operation.payload,
                                    revision: revision, updatedAt: Date(), deletedAt: operation.deletedAt)
            try Self.applyRemote(record, in: context)
            context.delete(row)
        }
    }

    public func markApplied(operationID: UUID, serverRecord: SyncRecord) throws {
        try transaction {
            guard let row = try Self.find(entity: "SyncOutboxRecord", field: "operationID", value: operationID.uuidString.lowercased(), in: context) else {
                throw SyncError.missingOperation
            }
            let operation = try Self.operation(from: row)
            guard operation.userID == serverRecord.userID,
                  operation.recordType == serverRecord.recordType,
                  operation.recordID == serverRecord.recordID,
                  serverRecord.revision >= operation.expectedRevision else {
                throw SyncError.invalidRecord
            }
            _ = try serverRecord.encoded()
            try Self.applyRemote(serverRecord, in: context)
            context.delete(row)
        }
    }

    public func saveConflict(operationID: UUID, serverRecord: SyncRecord) throws {
        try transaction {
            let operationRow = try Self.find(entity: "SyncOutboxRecord", field: "operationID", value: operationID.uuidString.lowercased(), in: context)
            let existingConflict = try Self.find(entity: "SyncConflictRecord", field: "operationID", value: operationID.uuidString.lowercased(), in: context)
            guard let operationRow else {
                guard let existingConflict else { throw SyncError.missingOperation }
                let existing = try Self.conflict(from: existingConflict)
                guard existing.operation.userID == serverRecord.userID,
                      existing.operation.recordType == serverRecord.recordType,
                      existing.operation.recordID == serverRecord.recordID else { throw SyncError.invalidRecord }
                existingConflict.setValue(try serverRecord.encoded(), forKey: "serverRecord")
                return
            }
            let operation = try Self.operation(from: operationRow)
            guard operation.userID == serverRecord.userID,
                  operation.recordType == serverRecord.recordType,
                  operation.recordID == serverRecord.recordID else { throw SyncError.invalidRecord }
            let conflictID = operationID.uuidString.lowercased()
            let conflictRow = existingConflict ?? NSEntityDescription.insertNewObject(forEntityName: "SyncConflictRecord", into: context)
            conflictRow.setValue(conflictID, forKey: "conflictID")
            conflictRow.setValue(operationID.uuidString.lowercased(), forKey: "operationID")
            conflictRow.setValue(operation.userID, forKey: "userID")
            conflictRow.setValue(try operation.encoded(), forKey: "operation")
            conflictRow.setValue(try serverRecord.encoded(), forKey: "serverRecord")
            conflictRow.setValue(Date().timeIntervalSince1970, forKey: "createdAt")
            context.delete(operationRow)
        }
    }

    public func conflicts(userID: String) throws -> [SyncConflict] {
        guard !userID.isEmpty else { return [] }
        return try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncConflictRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]
            return try context.fetch(request).map(Self.conflict(from:))
        }
    }

    static func hasPendingOrConflict(userID: String, recordType: SyncRecordType, recordID: String,
                                     in context: NSManagedObjectContext) throws -> Bool {
        let pending = NSFetchRequest<NSManagedObject>(entityName: "SyncOutboxRecord")
        pending.predicate = NSPredicate(format: "userID == %@ AND recordType == %@ AND recordID == %@",
                                        userID, recordType.rawValue, recordID)
        pending.fetchLimit = 1
        if try !context.fetch(pending).isEmpty { return true }

        let conflicts = NSFetchRequest<NSManagedObject>(entityName: "SyncConflictRecord")
        conflicts.predicate = NSPredicate(format: "userID == %@", userID)
        for row in try context.fetch(conflicts) {
            let conflict = try Self.conflict(from: row)
            if conflict.operation.recordType == recordType && conflict.operation.recordID == recordID {
                return true
            }
        }
        return false
    }

    public func resolveConflict(id: UUID, choice: SyncConflictChoice) throws {
        try transaction { _ = try Self.resolveConflict(id: id, choice: choice, in: context) }
    }

    static func resolveConflict(id: UUID, choice: SyncConflictChoice,
                                in context: NSManagedObjectContext) throws -> SyncConflict {
        guard let row = try find(entity: "SyncConflictRecord", field: "conflictID", value: id.uuidString.lowercased(), in: context) else {
            throw SyncError.missingConflict
        }
        let conflict = try Self.conflict(from: row)
        switch choice {
        case .keepLocal:
            let retry = SyncOperation(operationID: UUID(), userID: conflict.operation.userID,
                                      recordType: conflict.operation.recordType,
                                      recordID: conflict.operation.recordID,
                                      expectedRevision: conflict.serverRecord.revision,
                                      payload: conflict.operation.payload,
                                      deletedAt: conflict.operation.deletedAt)
            try Self.enqueue(retry, in: context)
        case .acceptServer:
            try Self.applyRemote(conflict.serverRecord, in: context)
        }
        context.delete(row)
        return conflict
    }

    func enqueueSnapshot(userID: String, recordType: SyncRecordType, recordID: String,
                         payload: [String: Any]?, deletedAt: Date?, in context: NSManagedObjectContext) throws {
        let conflictRequest = NSFetchRequest<NSManagedObject>(entityName: "SyncConflictRecord")
        conflictRequest.predicate = NSPredicate(format: "userID == %@", userID)
        // The identity check is performed against decoded operation bodies because conflicts
        // are deliberately stored as immutable snapshots, not as partially merged columns.
        for conflictRow in try context.fetch(conflictRequest) {
            let conflict = try Self.conflict(from: conflictRow)
            if conflict.operation.recordType == recordType && conflict.operation.recordID == recordID {
                throw SyncError.conflictPending
            }
        }
        let state = try Self.findState(userID: userID, recordType: recordType, recordID: recordID, in: context)
        let request = NSFetchRequest<NSManagedObject>(entityName: "SyncOutboxRecord")
        request.predicate = NSPredicate(format: "userID == %@ AND recordType == %@ AND recordID == %@",
                                        userID, recordType.rawValue, recordID)
        request.sortDescriptors = [NSSortDescriptor(key: "expectedRevision", ascending: false)]
        request.fetchLimit = 1
        let lastPending = try context.fetch(request).first?.value(forKey: "expectedRevision") as? Int64
        let expectedRevision = lastPending.map { $0 + 1 } ?? (state?.value(forKey: "revision") as? Int64 ?? 0)
        try Self.enqueue(SyncOperation(operationID: UUID(), userID: userID, recordType: recordType,
                                       recordID: recordID, expectedRevision: expectedRevision,
                                       payload: payload, deletedAt: deletedAt), in: context)
    }

    private func transaction<T>(_ body: () throws -> T) throws -> T {
        TripRepository.accessLock.lock(); defer { TripRepository.accessLock.unlock() }
        return try context.performAndWait {
            context.reset()
            do {
                let result = try body()
                if context.hasChanges { try context.save() }
                return result
            } catch {
                context.rollback()
                throw error
            }
        }
    }

    fileprivate static func enqueue(_ operation: SyncOperation, in context: NSManagedObjectContext) throws {
        let data = try operation.encoded()
        let operationID = operation.operationID.uuidString.lowercased()
        if let existing = try find(entity: "SyncOutboxRecord", field: "operationID", value: operationID, in: context) {
            guard let existingData = existing.value(forKey: "body") as? Data, existingData == data else { throw SyncError.operationIDReused }
            return
        }
        if try find(entity: "SyncConflictRecord", field: "operationID", value: operationID, in: context) != nil {
            throw SyncError.operationIDReused
        }
        let row = NSEntityDescription.insertNewObject(forEntityName: "SyncOutboxRecord", into: context)
        row.setValue(operationID, forKey: "operationID")
        row.setValue(operation.userID, forKey: "userID")
        row.setValue(operation.recordType.rawValue, forKey: "recordType")
        row.setValue(operation.recordID, forKey: "recordID")
        row.setValue(operation.expectedRevision, forKey: "expectedRevision")
        row.setValue(data, forKey: "body")
        row.setValue(Date().timeIntervalSince1970, forKey: "createdAt")
    }

    static func applyRemote(_ record: SyncRecord, in context: NSManagedObjectContext) throws {
        let existing = try findState(userID: record.userID, recordType: record.recordType, recordID: record.recordID, in: context)
        let previousRevision = existing?.value(forKey: "revision") as? Int64
        if let previousRevision, previousRevision > record.revision { return }
        if let previousRevision, previousRevision == record.revision,
           let bytes = existing?.value(forKey: "record") as? Data, bytes != (try record.encoded()) {
            throw SyncError.invalidRecord
        }
        let row = existing ?? NSEntityDescription.insertNewObject(forEntityName: "SyncRecordStateRecord", into: context)
        row.setValue(record.userID, forKey: "userID")
        row.setValue(record.recordType.rawValue, forKey: "recordType")
        row.setValue(record.recordID, forKey: "recordID")
        row.setValue(record.revision, forKey: "revision")
        row.setValue(try record.encoded(), forKey: "record")
        row.setValue(record.updatedAt.timeIntervalSince1970, forKey: "updatedAt")
        row.setValue(record.deletedAt?.timeIntervalSince1970, forKey: "deletedAt")
    }

    static func findState(userID: String, recordType: SyncRecordType, recordID: String,
                          in context: NSManagedObjectContext) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "SyncRecordStateRecord")
        request.predicate = NSPredicate(format: "userID == %@ AND recordType == %@ AND recordID == %@",
                                        userID, recordType.rawValue, recordID)
        request.fetchLimit = 1
        return try context.fetch(request).first
    }

    static func find(entity: String, field: String, value: String,
                     in context: NSManagedObjectContext) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: entity)
        request.predicate = NSPredicate(format: "%K == %@", field, value)
        request.fetchLimit = 1
        return try context.fetch(request).first
    }

    static func operation(from row: NSManagedObject) throws -> SyncOperation {
        guard let bytes = row.value(forKey: "body") as? Data else { throw SyncError.invalidOperation }
        return try SyncOperation(data: bytes)
    }

    static func conflict(from row: NSManagedObject) throws -> SyncConflict {
        guard let idString = row.value(forKey: "conflictID") as? String, let id = UUID(uuidString: idString),
              let operationBytes = row.value(forKey: "operation") as? Data,
              let serverBytes = row.value(forKey: "serverRecord") as? Data else { throw SyncError.invalidRecord }
        return SyncConflict(id: id, operation: try SyncOperation(data: operationBytes),
                            serverRecord: try SyncRecord(data: serverBytes))
    }
}

public final class SyncRecordStateStore {
    private let context: NSManagedObjectContext

    public convenience init(url: URL) throws {
        TripRepository.accessLock.lock(); defer { TripRepository.accessLock.unlock() }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try TripStoreModel.migrateIfNeeded(at: url)
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.sync)
        try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: nil)
        let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
        context.persistentStoreCoordinator = coordinator
        self.init(context: context)
    }

    init(context: NSManagedObjectContext) { self.context = context }

    public func applyRemote(_ record: SyncRecord) throws {
        try transaction { try SyncOutboxRepository.applyRemote(record, in: context) }
    }

    public func record(userID: String, recordType: SyncRecordType, recordID: String) throws -> SyncRecord? {
        try transaction {
            guard let row = try SyncOutboxRepository.findState(userID: userID, recordType: recordType,
                                                               recordID: recordID, in: context),
                  let bytes = row.value(forKey: "record") as? Data else { return nil }
            return try SyncRecord(data: bytes)
        }
    }

    public func records(userID: String) throws -> [SyncRecord] {
        guard !userID.isEmpty else { return [] }
        return try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncRecordStateRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            request.sortDescriptors = [NSSortDescriptor(key: "recordType", ascending: true),
                                       NSSortDescriptor(key: "recordID", ascending: true)]
            return try context.fetch(request).compactMap { row in
                guard let bytes = row.value(forKey: "record") as? Data else { throw SyncError.invalidRecord }
                return try SyncRecord(data: bytes)
            }
        }
    }

    private func transaction<T>(_ body: () throws -> T) throws -> T {
        TripRepository.accessLock.lock(); defer { TripRepository.accessLock.unlock() }
        return try context.performAndWait {
            context.reset()
            do {
                let result = try body()
                if context.hasChanges { try context.save() }
                return result
            } catch {
                context.rollback()
                throw error
            }
        }
    }
}
