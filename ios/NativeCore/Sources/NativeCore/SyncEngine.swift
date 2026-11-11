import Foundation

public struct SyncPage {
    public let records: [SyncRecord]
    public let nextCursor: String?

    public init(records: [SyncRecord], nextCursor: String?) {
        self.records = records
        self.nextCursor = nextCursor
    }
}

public struct SyncDelta {
    public let records: [SyncRecord]
    public let requiresFull: Bool
    public init(records: [SyncRecord], requiresFull: Bool) {
        self.records = records; self.requiresFull = requiresFull
    }
}

public enum SyncApplyStatus: String {
    case applied
    case replayed
    case conflict
}

public struct SyncApplyResult {
    public let status: SyncApplyStatus
    public let record: SyncRecord

    public init(status: SyncApplyStatus, record: SyncRecord) {
        self.status = status
        self.record = record
    }
}

public protocol SyncTransport {
    func fetchRecords(userID: String, cursor: String?) async throws -> SyncPage
    func apply(_ operation: SyncOperation) async throws -> SyncApplyResult
    func fetchFingerprint(userID: String) async throws -> String?
    func fetchChanges(userID: String, known: [SyncRecord]) async throws -> SyncDelta?
}

public extension SyncTransport {
    func fetchFingerprint(userID: String) async throws -> String? { nil }
    func fetchChanges(userID: String, known: [SyncRecord]) async throws -> SyncDelta? { nil }
}

public struct SyncRunResult {
    public let pulledRecords: Int
    public let appliedOperations: Int
    public let replayedOperations: Int
    public let conflicts: Int

    public init(pulledRecords: Int, appliedOperations: Int, replayedOperations: Int, conflicts: Int) {
        self.pulledRecords = pulledRecords
        self.appliedOperations = appliedOperations
        self.replayedOperations = replayedOperations
        self.conflicts = conflicts
    }
}

public final class SyncEngine {
    private let transport: SyncTransport
    private let outbox: SyncOutboxRepository
    private let states: SyncRecordStateStore

    public init(transport: SyncTransport, outbox: SyncOutboxRepository, states: SyncRecordStateStore) {
        self.transport = transport
        self.outbox = outbox
        self.states = states
    }

    public func sync(userID: String, forceFull: Bool = false) async throws -> SyncRunResult {
        guard !userID.isEmpty else { throw SyncError.accountMismatch }

        let known = try states.records(userID: userID)
        let delta = forceFull ? nil : (try? await transport.fetchChanges(userID: userID, known: known))
        try Task.checkCancellation()
        var pulled: [SyncRecord] = []
        if let delta, !delta.requiresFull {
            var seen = Set<String>()
            var knownRevisions: [String: Int64] = [:]
            for record in known {
                let key = "\(record.recordType.rawValue):\(record.recordID)"
                guard knownRevisions.updateValue(record.revision, forKey: key) == nil else { throw SyncError.invalidRecord }
            }
            for record in delta.records {
                let key = "\(record.recordType.rawValue):\(record.recordID)"
                guard record.userID == userID, seen.insert(key).inserted,
                      record.revision >= (knownRevisions[key] ?? 0) else { throw SyncError.invalidRecord }
                _ = try record.encoded()
                pulled.append(record)
            }
        } else {
            let beforeFingerprint = try? await transport.fetchFingerprint(userID: userID)
            try Task.checkCancellation()
            var cursor: String?
            var seenCursors = Set<String>()
            repeat {
                let page = try await transport.fetchRecords(userID: userID, cursor: cursor)
                for record in page.records {
                    guard record.userID == userID else { throw SyncError.accountMismatch }
                    _ = try record.encoded()
                    pulled.append(record)
                }
                guard let nextCursor = page.nextCursor else { break }
                guard seenCursors.insert(nextCursor).inserted else { throw SyncError.invalidRecord }
                cursor = nextCursor
            } while cursor != nil
            let afterFingerprint = try? await transport.fetchFingerprint(userID: userID)
            try Task.checkCancellation()
            if beforeFingerprint != afterFingerprint { throw SyncError.snapshotChanged }
        }
        for record in pulled { try states.applyRemote(record) }
        let pulledRecords = pulled.count

        var appliedOperations = 0
        var replayedOperations = 0
        var conflicts = 0
        let batchSize = 100

        while true {
            let operations = try outbox.pending(userID: userID, limit: batchSize)
            guard !operations.isEmpty else { break }

            for operation in operations {
                guard operation.userID == userID else { throw SyncError.accountMismatch }
                let result = try await transport.apply(operation)
                let serverRecord = result.record
                guard serverRecord.userID == userID,
                      serverRecord.recordType == operation.recordType,
                      serverRecord.recordID == operation.recordID,
                      serverRecord.revision >= operation.expectedRevision else {
                    throw SyncError.invalidRecord
                }
                _ = try serverRecord.encoded()

                switch result.status {
                case .applied:
                    try outbox.markApplied(operationID: operation.operationID, serverRecord: serverRecord)
                    appliedOperations += 1
                case .replayed:
                    try outbox.markApplied(operationID: operation.operationID, serverRecord: serverRecord)
                    replayedOperations += 1
                case .conflict:
                    try outbox.saveConflict(operationID: operation.operationID, serverRecord: serverRecord)
                    conflicts += 1
                }
            }

            if operations.count < batchSize { break }
        }

        return SyncRunResult(pulledRecords: pulledRecords, appliedOperations: appliedOperations,
                             replayedOperations: replayedOperations, conflicts: conflicts)
    }
}
