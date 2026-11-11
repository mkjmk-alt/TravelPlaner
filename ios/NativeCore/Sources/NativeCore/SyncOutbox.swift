import CoreData
import Foundation

extension TripRepository: SyncOutboxRepository, SyncRecordStateStore {
    public func enqueue(_ operation: SyncOperation) throws {
        try transaction { try syncEnqueueWithinTransaction(operation) }
    }

    public func pending(userID: String, limit: Int) throws -> [SyncOperation] {
        try transaction {
            guard limit > 0 else { return [] }
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncOutboxRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            request.sortDescriptors = [
                NSSortDescriptor(key: "createdAt", ascending: true),
                NSSortDescriptor(key: "operationID", ascending: true)
            ]
            request.fetchLimit = limit
            return try context.fetch(request).map { row in
                guard let data = row.value(forKey: "operationData") as? Data else { throw SyncError.invalidOperation }
                return try SyncOperation(data: data)
            }
        }
    }

    public func markApplied(operationID: UUID, revision: Int64) throws {
        try transaction {
            guard let row = try syncOutboxRow(operationID: operationID),
                  let data = row.value(forKey: "operationData") as? Data else { throw SyncError.operationNotFound }
            let operation = try SyncOperation(data: data)
            guard revision >= operation.expectedRevision else { throw SyncError.revisionRegression }
            let record = try SyncRecord(
                userID: operation.userID,
                recordType: operation.recordType,
                recordID: operation.recordID,
                payload: operation.payload,
                revision: revision,
                updatedAt: Date(),
                deletedAt: operation.deletedAt
            )
            try applyRemoteWithinTransaction(record)
            context.delete(row)
        }
    }

    public func saveConflict(operationID: UUID, serverRecord: SyncRecord) throws {
        try transaction {
            guard let row = try syncOutboxRow(operationID: operationID),
                  let operationData = row.value(forKey: "operationData") as? Data else { throw SyncError.operationNotFound }
            let operation = try SyncOperation(data: operationData)
            guard operation.userID == serverRecord.userID,
                  operation.recordType == serverRecord.recordType,
                  operation.recordID == serverRecord.recordID else { throw SyncError.invalidRecord }

            try applyRemoteWithinTransaction(serverRecord)
            let conflict = NSEntityDescription.insertNewObject(forEntityName: "SyncConflictRecord", into: context)
            conflict.setValue(UUID(), forKey: "conflictID")
            conflict.setValue(operationID, forKey: "operationID")
            conflict.setValue(operation.userID, forKey: "userID")
            conflict.setValue(operationData, forKey: "localOperationData")
            conflict.setValue(try serverRecord.encoded(), forKey: "serverRecordData")
            conflict.setValue(Date().timeIntervalSince1970, forKey: "createdAt")
            context.delete(row)
        }
    }

    public func conflicts(userID: String) throws -> [SyncConflict] {
        try transaction {
            let request = NSFetchRequest<NSManagedObject>(entityName: "SyncConflictRecord")
            request.predicate = NSPredicate(format: "userID == %@", userID)
            request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]
            return try context.fetch(request).map(syncConflict(from:))
        }
    }

    public func resolveConflict(id: UUID, choice: SyncConflictChoice) throws {
        try transaction {
            guard let row = try syncConflictRow(id: id) else { throw SyncError.conflictNotFound }
            let conflict = try syncConflict(from: row)
            switch choice {
            case .keepLocal:
                let retry = try SyncOperation(
                    userID: conflict.localOperation.userID,
                    recordType: conflict.localOperation.recordType,
                    recordID: conflict.localOperation.recordID,
                    expectedRevision: conflict.serverRecord.revision,
                    payload: conflict.localOperation.payload,
                    deletedAt: conflict.localOperation.deletedAt
                )
                try syncEnqueueWithinTransaction(retry)
            case .acceptServer:
                break
            }
            context.delete(row)
        }
    }

    public func applyRemote(_ record: SyncRecord) throws {
        try transaction { try applyRemoteWithinTransaction(record) }
    }

    public func recordState(userID: String, recordType: SyncRecordType, recordID: String) throws -> SyncRecord? {
        try transaction {
            try syncStateRow(userID: userID, recordType: recordType, recordID: recordID).map { row in
                guard let data = row.value(forKey: "recordData") as? Data else { throw SyncError.invalidRecord }
                return try SyncRecord(data: data)
            }
        }
    }

    func syncRevisionWithinTransaction(userID: String, recordType: SyncRecordType, recordID: String) throws -> Int64 {
        guard let row = try syncStateRow(userID: userID, recordType: recordType, recordID: recordID) else { return 0 }
        guard let data = row.value(forKey: "recordData") as? Data else { throw SyncError.invalidRecord }
        return try SyncRecord(data: data).revision
    }

    func syncEnqueueWithinTransaction(_ operation: SyncOperation) throws {
        let data = try operation.encoded()
        if let existing = try syncOutboxRow(operationID: operation.operationID) {
            guard let existingData = existing.value(forKey: "operationData") as? Data else { throw SyncError.invalidOperation }
            guard existingData == data else { throw SyncError.operationIDReuse }
            return
        }
        let row = NSEntityDescription.insertNewObject(forEntityName: "SyncOutboxRecord", into: context)
        row.setValue(operation.operationID, forKey: "operationID")
        row.setValue(operation.userID, forKey: "userID")
        row.setValue(operation.recordType.rawValue, forKey: "recordType")
        row.setValue(operation.recordID, forKey: "recordID")
        row.setValue(operation.expectedRevision, forKey: "expectedRevision")
        row.setValue(data, forKey: "operationData")
        row.setValue(Date().timeIntervalSince1970, forKey: "createdAt")
    }

    private func applyRemoteWithinTransaction(_ record: SyncRecord) throws {
        let data = try record.encoded()
        if let row = try syncStateRow(userID: record.userID, recordType: record.recordType, recordID: record.recordID) {
            guard let existingData = row.value(forKey: "recordData") as? Data else { throw SyncError.invalidRecord }
            let existing = try SyncRecord(data: existingData)
            if existing.revision > record.revision { return }
            if existing.revision == record.revision {
                guard try sameRevisionContent(existing, record) else { throw SyncError.revisionCollision }
            }
            row.setValue(record.revision, forKey: "revision")
            row.setValue(data, forKey: "recordData")
            row.setValue(record.updatedAt.timeIntervalSince1970, forKey: "updatedAt")
            return
        }

        let row = NSEntityDescription.insertNewObject(forEntityName: "SyncRecordStateRecord", into: context)
        row.setValue(record.userID, forKey: "userID")
        row.setValue(record.recordType.rawValue, forKey: "recordType")
        row.setValue(record.recordID, forKey: "recordID")
        row.setValue(record.revision, forKey: "revision")
        row.setValue(data, forKey: "recordData")
        row.setValue(record.updatedAt.timeIntervalSince1970, forKey: "updatedAt")
    }

    private func sameRevisionContent(_ lhs: SyncRecord, _ rhs: SyncRecord) throws -> Bool {
        guard lhs.userID == rhs.userID, lhs.recordType == rhs.recordType,
              lhs.recordID == rhs.recordID, lhs.revision == rhs.revision,
              lhs.deletedAt == rhs.deletedAt else { return false }
        let leftPayload = try Self.canonicalPayload(lhs.payload)
        let rightPayload = try Self.canonicalPayload(rhs.payload)
        return leftPayload == rightPayload
    }

    private static func canonicalPayload(_ payload: [String: Any]?) throws -> Data? {
        guard let payload else { return nil }
        return try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    }

    private func syncOutboxRow(operationID: UUID) throws -> NSManagedObject? {
        try firstSyncRow(entity: "SyncOutboxRecord", predicate: NSPredicate(format: "operationID == %@", operationID as NSUUID))
    }

    private func syncStateRow(userID: String, recordType: SyncRecordType, recordID: String) throws -> NSManagedObject? {
        try firstSyncRow(
            entity: "SyncRecordStateRecord",
            predicate: NSPredicate(format: "userID == %@ AND recordType == %@ AND recordID == %@", userID, recordType.rawValue, recordID)
        )
    }

    private func syncConflictRow(id: UUID) throws -> NSManagedObject? {
        try firstSyncRow(entity: "SyncConflictRecord", predicate: NSPredicate(format: "conflictID == %@", id as NSUUID))
    }

    private func firstSyncRow(entity: String, predicate: NSPredicate) throws -> NSManagedObject? {
        let request = NSFetchRequest<NSManagedObject>(entityName: entity)
        request.predicate = predicate; request.fetchLimit = 1
        return try context.fetch(request).first
    }

    private func syncConflict(from row: NSManagedObject) throws -> SyncConflict {
        guard let id = row.value(forKey: "conflictID") as? UUID,
              let operationData = row.value(forKey: "localOperationData") as? Data,
              let recordData = row.value(forKey: "serverRecordData") as? Data else { throw SyncError.invalidRecord }
        return SyncConflict(
            id: id,
            localOperation: try SyncOperation(data: operationData),
            serverRecord: try SyncRecord(data: recordData)
        )
    }
}
