import Foundation

public enum SyncRecordType: String, CaseIterable {
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
    ) {
        self.userID = userID
        self.recordType = recordType
        self.recordID = recordID
        self.payload = payload
        self.revision = revision
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public init(data: Data) throws {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let userID = json["user_id"] as? String, !userID.isEmpty,
              let typeValue = json["record_type"] as? String,
              let type = SyncRecordType(rawValue: typeValue),
              let recordID = json["record_id"] as? String, !recordID.isEmpty,
              let revisionValue = json["revision"] as? NSNumber,
              let updatedValue = json["updated_at"] as? String,
              let updatedAt = Self.parseDate(updatedValue) else { throw SyncError.invalidRecord }

        let payloadValue = json["payload"]
        let payload: [String: Any]?
        if payloadValue == nil || payloadValue is NSNull {
            payload = nil
        } else if let value = payloadValue as? [String: Any] {
            payload = value
        } else {
            throw SyncError.invalidRecord
        }
        let deletedValue = json["deleted_at"]
        let deletedAt: Date?
        if deletedValue == nil || deletedValue is NSNull {
            deletedAt = nil
        } else if let value = deletedValue as? String, let parsed = Self.parseDate(value) {
            deletedAt = parsed
        } else {
            throw SyncError.invalidRecord
        }
        let revision = revisionValue.int64Value
        guard revision >= 0, (payload != nil || deletedAt != nil),
              deletedAt == nil || payload == nil else { throw SyncError.invalidRecord }

        self.init(userID: userID, recordType: type, recordID: recordID, payload: payload,
                  revision: revision, updatedAt: updatedAt, deletedAt: deletedAt)
    }

    public func encoded() throws -> Data {
        guard !userID.isEmpty, !recordID.isEmpty, revision >= 0,
              payload.map({ JSONSerialization.isValidJSONObject($0) }) ?? true,
              payload != nil || deletedAt != nil,
              deletedAt == nil || payload == nil else { throw SyncError.invalidRecord }
        let json: [String: Any] = [
            "user_id": userID,
            "record_type": recordType.rawValue,
            "record_id": recordID,
            "payload": payload ?? NSNull(),
            "revision": revision,
            "updated_at": Self.formatDate(updatedAt),
            "deleted_at": deletedAt.map(Self.formatDate) as Any? ?? NSNull()
        ]
        return try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys, .fragmentsAllowed])
    }

    fileprivate static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    fileprivate static func formatDate(_ value: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: value)
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

    public init(operationID: UUID, userID: String, recordType: SyncRecordType, recordID: String,
                expectedRevision: Int64, payload: [String: Any]?, deletedAt: Date?) {
        self.operationID = operationID
        self.userID = userID
        self.recordType = recordType
        self.recordID = recordID
        self.expectedRevision = expectedRevision
        self.payload = payload
        self.deletedAt = deletedAt
    }

    public func encoded() throws -> Data {
        guard !userID.isEmpty, !recordID.isEmpty, expectedRevision >= 0,
              payload.map({ JSONSerialization.isValidJSONObject($0) }) ?? true,
              payload != nil || deletedAt != nil,
              deletedAt == nil || payload == nil else { throw SyncError.invalidOperation }
        let json: [String: Any] = [
            "operation_id": operationID.uuidString.lowercased(),
            "user_id": userID,
            "record_type": recordType.rawValue,
            "record_id": recordID,
            "expected_revision": expectedRevision,
            "payload": payload ?? NSNull(),
            "deleted_at": deletedAt.map(SyncRecord.formatDate) as Any? ?? NSNull()
        ]
        return try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys, .fragmentsAllowed])
    }

    public init(data: Data) throws {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let idValue = json["operation_id"] as? String, let id = UUID(uuidString: idValue),
              let userID = json["user_id"] as? String,
              let typeValue = json["record_type"] as? String, let type = SyncRecordType(rawValue: typeValue),
              let recordID = json["record_id"] as? String,
              let revisionValue = json["expected_revision"] as? NSNumber else { throw SyncError.invalidOperation }
        let payloadValue = json["payload"]
        let payload: [String: Any]?
        if payloadValue == nil || payloadValue is NSNull { payload = nil }
        else if let value = payloadValue as? [String: Any] { payload = value }
        else { throw SyncError.invalidOperation }
        let deletedValue = json["deleted_at"]
        let deletedAt: Date?
        if deletedValue == nil || deletedValue is NSNull { deletedAt = nil }
        else if let value = deletedValue as? String, let parsed = SyncRecord.parseDate(value) { deletedAt = parsed }
        else { throw SyncError.invalidOperation }
        guard revisionValue.int64Value >= 0, (payload != nil || deletedAt != nil),
              deletedAt == nil || payload == nil else { throw SyncError.invalidOperation }
        self.init(operationID: id, userID: userID, recordType: type, recordID: recordID,
                  expectedRevision: revisionValue.int64Value, payload: payload, deletedAt: deletedAt)
    }
}

public enum SyncConflictChoice {
    case keepLocal
    case acceptServer
}

public struct SyncConflict {
    public let id: UUID
    public let operation: SyncOperation
    public let serverRecord: SyncRecord
}

public struct SyncWriteContext {
    public let userID: String?

    public init(userID: String?) {
        self.userID = userID.flatMap { $0.isEmpty ? nil : $0 }
    }

    public static let device = SyncWriteContext(userID: nil)
}

public enum SyncError: Error, LocalizedError {
    case invalidRecord
    case snapshotChanged
    case invalidOperation
    case operationIDReused
    case accountMismatch
    case conflictPending
    case missingOperation
    case missingConflict
    case storeUnavailable

    public var errorDescription: String? {
        switch self {
        case .invalidRecord: "동기화 레코드 형식이 올바르지 않습니다."
        case .snapshotChanged: "서버 자료가 변경되어 동기화를 다시 시도합니다."
        case .invalidOperation: "동기화 작업 형식이 올바르지 않습니다."
        case .operationIDReused: "같은 작업 ID가 다른 내용으로 재사용되었습니다."
        case .accountMismatch: "다른 계정이 소유한 데이터는 수정할 수 없습니다."
        case .conflictPending: "충돌을 먼저 해결한 뒤 변경할 수 있습니다."
        case .missingOperation: "대기 중인 동기화 작업을 찾을 수 없습니다."
        case .missingConflict: "동기화 충돌을 찾을 수 없습니다."
        case .storeUnavailable: "동기화 저장소를 사용할 수 없습니다."
        }
    }
}
