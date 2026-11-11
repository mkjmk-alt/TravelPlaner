import CoreFoundation
import Foundation

public enum SyncRecordType: String, Codable, CaseIterable {
    case trip
    case savedPlace
}

public struct SyncRecord {
    public let userID: String
    public let recordType: SyncRecordType
    public let recordID: String
    public let payload: [String: Any]?
    public let revision: Int64
    public let updatedAt: Date
    public let deletedAt: Date?

    public init(
        userID: String,
        recordType: SyncRecordType,
        recordID: String,
        payload: [String: Any]?,
        revision: Int64,
        updatedAt: Date,
        deletedAt: Date?
    ) throws {
        guard Self.hasIdentity(userID), Self.hasIdentity(recordID), revision >= 0,
              SyncJSON.isValid(payload) else { throw SyncError.invalidRecord }
        self.userID = userID
        self.recordType = recordType
        self.recordID = recordID
        self.payload = payload
        self.revision = revision
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public init(data: Data) throws {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let userID = object["user_id"] as? String,
              let rawType = object["record_type"] as? String,
              let recordType = SyncRecordType(rawValue: rawType),
              let recordID = object["record_id"] as? String,
              let revisionNumber = object["revision"] as? NSNumber,
              CFGetTypeID(revisionNumber) != CFBooleanGetTypeID(),
              let updatedAtValue = object["updated_at"] as? String,
              let updatedAt = SyncDateCodec.decode(updatedAtValue) else { throw SyncError.invalidRecord }

        let payload: [String: Any]?
        if object["payload"] == nil || object["payload"] is NSNull {
            payload = nil
        } else {
            guard let dictionary = object["payload"] as? [String: Any] else { throw SyncError.invalidRecord }
            payload = dictionary
        }

        let deletedAt: Date?
        if object["deleted_at"] == nil || object["deleted_at"] is NSNull {
            deletedAt = nil
        } else {
            guard let value = object["deleted_at"] as? String,
                  let date = SyncDateCodec.decode(value) else { throw SyncError.invalidRecord }
            deletedAt = date
        }

        try self.init(
            userID: userID,
            recordType: recordType,
            recordID: recordID,
            payload: payload,
            revision: revisionNumber.int64Value,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }

    public func encoded() throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "user_id": userID,
            "record_type": recordType.rawValue,
            "record_id": recordID,
            "payload": payload.map { $0 as Any } ?? NSNull(),
            "revision": revision,
            "updated_at": SyncDateCodec.encode(updatedAt),
            "deleted_at": deletedAt.map(SyncDateCodec.encode) ?? NSNull()
        ], options: [.sortedKeys])
    }

    private static func hasIdentity(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public struct SyncOperation {
    public let operationID: UUID
    public let userID: String
    public let recordType: SyncRecordType
    public let recordID: String
    public let expectedRevision: Int64
    public let payload: [String: Any]?
    public let deletedAt: Date?

    public init(
        operationID: UUID = UUID(),
        userID: String,
        recordType: SyncRecordType,
        recordID: String,
        expectedRevision: Int64,
        payload: [String: Any]?,
        deletedAt: Date?
    ) throws {
        guard !userID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !recordID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              expectedRevision >= 0,
              SyncJSON.isValid(payload) else { throw SyncError.invalidOperation }
        self.operationID = operationID
        self.userID = userID
        self.recordType = recordType
        self.recordID = recordID
        self.expectedRevision = expectedRevision
        self.payload = payload
        self.deletedAt = deletedAt
    }

    public init(data: Data) throws {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let operationString = object["operation_id"] as? String,
              let operationID = UUID(uuidString: operationString),
              let userID = object["user_id"] as? String,
              let rawType = object["record_type"] as? String,
              let recordType = SyncRecordType(rawValue: rawType),
              let recordID = object["record_id"] as? String,
              let revisionNumber = object["expected_revision"] as? NSNumber,
              CFGetTypeID(revisionNumber) != CFBooleanGetTypeID() else { throw SyncError.invalidOperation }

        let payload: [String: Any]?
        if object["payload"] == nil || object["payload"] is NSNull {
            payload = nil
        } else {
            guard let dictionary = object["payload"] as? [String: Any] else { throw SyncError.invalidOperation }
            payload = dictionary
        }

        let deletedAt: Date?
        if object["deleted_at"] == nil || object["deleted_at"] is NSNull {
            deletedAt = nil
        } else {
            guard let value = object["deleted_at"] as? String,
                  let date = SyncDateCodec.decode(value) else { throw SyncError.invalidOperation }
            deletedAt = date
        }

        try self.init(
            operationID: operationID,
            userID: userID,
            recordType: recordType,
            recordID: recordID,
            expectedRevision: revisionNumber.int64Value,
            payload: payload,
            deletedAt: deletedAt
        )
    }

    public func encoded() throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "operation_id": operationID.uuidString.lowercased(),
            "user_id": userID,
            "record_type": recordType.rawValue,
            "record_id": recordID,
            "expected_revision": expectedRevision,
            "payload": payload.map { $0 as Any } ?? NSNull(),
            "deleted_at": deletedAt.map(SyncDateCodec.encode) ?? NSNull()
        ], options: [.sortedKeys])
    }
}

public struct SyncWriteContext: Sendable {
    public let userID: String?

    public init(userID: String?) {
        let normalized = userID?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.userID = normalized?.isEmpty == false ? normalized : nil
    }

    public static let local = SyncWriteContext(userID: nil)
}

public enum SyncConflictChoice {
    case keepLocal
    case acceptServer
}

public struct SyncConflict {
    public let id: UUID
    public let localOperation: SyncOperation
    public let serverRecord: SyncRecord

    public init(id: UUID, localOperation: SyncOperation, serverRecord: SyncRecord) {
        self.id = id
        self.localOperation = localOperation
        self.serverRecord = serverRecord
    }
}

public protocol SyncOutboxRepository {
    func enqueue(_ operation: SyncOperation) throws
    func pending(userID: String, limit: Int) throws -> [SyncOperation]
    func markApplied(operationID: UUID, revision: Int64) throws
    func saveConflict(operationID: UUID, serverRecord: SyncRecord) throws
    func conflicts(userID: String) throws -> [SyncConflict]
    func resolveConflict(id: UUID, choice: SyncConflictChoice) throws
}

public protocol SyncRecordStateStore {
    func applyRemote(_ record: SyncRecord) throws
    func recordState(userID: String, recordType: SyncRecordType, recordID: String) throws -> SyncRecord?
}

public enum SyncError: LocalizedError {
    case invalidRecord
    case invalidOperation
    case operationIDReuse
    case operationNotFound
    case conflictNotFound
    case accountAccessDenied
    case revisionRegression
    case revisionCollision

    public var errorDescription: String? {
        switch self {
        case .invalidRecord: return "동기화 문서가 올바르지 않습니다."
        case .invalidOperation: return "동기화 작업이 올바르지 않습니다."
        case .operationIDReuse: return "이미 저장된 작업 ID가 다른 내용으로 재사용되었습니다."
        case .operationNotFound: return "대기 중인 동기화 작업을 찾지 못했습니다."
        case .conflictNotFound: return "동기화 충돌 항목을 찾지 못했습니다."
        case .accountAccessDenied: return "현재 계정에서 수정할 수 없는 데이터입니다."
        case .revisionRegression: return "오래된 서버 문서로 동기화 상태를 되돌릴 수 없습니다."
        case .revisionCollision: return "같은 revision에 서로 다른 서버 문서가 도착했습니다."
        }
    }
}

private enum SyncJSON {
    static func isValid(_ payload: [String: Any]?) -> Bool {
        guard let payload else { return true }
        return JSONSerialization.isValidJSONObject(payload)
    }
}

private enum SyncDateCodec {
    static func encode(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func decode(_ string: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: string) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: string)
    }
}
