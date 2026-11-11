import Foundation

/// Converts the public v2 REST/RPC JSON contract to and from NativeCore sync types.
public enum SyncV2WireCodec {
    public static func validateAccountScope(requestedUserID: String, sessionUserID: String) throws {
        guard !requestedUserID.isEmpty,
              requestedUserID.lowercased() == sessionUserID.lowercased() else {
            throw SyncError.accountMismatch
        }
    }

    public static func decodePage(data: Data, offset: Int, pageSize: Int) throws -> SyncPage {
        guard offset >= 0, pageSize > 0, pageSize <= 1_000,
              let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw SyncError.invalidRecord
        }
        let records = try rows.map { row in
            try SyncRecord(data: JSONSerialization.data(withJSONObject: row, options: [.sortedKeys, .fragmentsAllowed]))
        }
        let nextCursor = records.count == pageSize ? String(offset + records.count) : nil
        return SyncPage(records: records, nextCursor: nextCursor)
    }

    public static func deltaParameters(known: [SyncRecord]) throws -> Data {
        let rows: [[String: Any]] = known.map { ["record_type": $0.recordType.rawValue, "record_id": $0.recordID, "revision": $0.revision, "deleted": $0.deletedAt != nil] }
        return try JSONSerialization.data(withJSONObject: ["p_known": rows], options: [.sortedKeys])
    }

    public static func decodeDelta(data: Data) throws -> SyncDelta {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let requiresFull = object["requires_full"] as? Bool,
              let rows = object["records"] as? [[String: Any]] else { throw SyncError.invalidRecord }
        let records = try rows.map { try SyncRecord(data: JSONSerialization.data(withJSONObject: $0, options: [.sortedKeys])) }
        return SyncDelta(records: records, requiresFull: requiresFull)
    }

    public static func rpcParameters(for operation: SyncOperation) throws -> Data {
        let operationData = try operation.encoded()
        guard let encoded = try JSONSerialization.jsonObject(with: operationData) as? [String: Any] else {
            throw SyncError.invalidOperation
        }
        let parameters: [String: Any] = [
            "p_record_type": encoded["record_type"] ?? NSNull(),
            "p_record_id": encoded["record_id"] ?? NSNull(),
            "p_expected_revision": encoded["expected_revision"] ?? NSNull(),
            "p_operation_id": encoded["operation_id"] ?? NSNull(),
            "p_payload": encoded["payload"] ?? NSNull(),
            "p_deleted_at": encoded["deleted_at"] ?? NSNull()
        ]
        return try JSONSerialization.data(withJSONObject: parameters, options: [.sortedKeys, .fragmentsAllowed])
    }

    public static func decodeApplyResult(data: Data) throws -> SyncApplyResult {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let statusValue = object["status"] as? String,
              let status = SyncApplyStatus(rawValue: statusValue),
              let row = object["record"] as? [String: Any] else { throw SyncError.invalidRecord }
        let recordData = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys, .fragmentsAllowed])
        return SyncApplyResult(status: status, record: try SyncRecord(data: recordData))
    }
}
