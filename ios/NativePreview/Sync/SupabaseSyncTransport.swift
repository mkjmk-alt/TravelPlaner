import Foundation
import NativeCore
import Supabase

final class SupabaseSyncTransport: SyncTransport {
    private let client: SupabaseClient
    private let sessionUserID: String
    private let pageSize: Int

    init(client: SupabaseClient, sessionUserID: String, pageSize: Int = 500) {
        self.client = client
        self.sessionUserID = sessionUserID.lowercased()
        self.pageSize = min(max(pageSize, 1), 1_000)
    }

    func fetchRecords(userID: String, cursor: String?) async throws -> SyncPage {
        try SyncV2WireCodec.validateAccountScope(requestedUserID: userID, sessionUserID: sessionUserID)
        let offset: Int
        if let cursor {
            guard let parsed = Int(cursor), parsed >= 0, String(parsed) == cursor else {
                throw SyncError.invalidRecord
            }
            offset = parsed
        } else {
            offset = 0
        }
        guard offset <= Int.max - pageSize else { throw SyncError.invalidRecord }

        let response = try await client
            .from("user_sync_records")
            .select("user_id,record_type,record_id,payload,revision,updated_at,deleted_at")
            .eq("user_id", value: sessionUserID)
            .order("updated_at", ascending: true)
            .order("record_type", ascending: true)
            .order("record_id", ascending: true)
            .range(from: offset, to: offset + pageSize - 1)
            .execute()

        return try SyncV2WireCodec.decodePage(data: response.data, offset: offset, pageSize: pageSize)
    }

    func fetchChanges(userID: String, known: [SyncRecord]) async throws -> SyncDelta? {
        try SyncV2WireCodec.validateAccountScope(requestedUserID: userID, sessionUserID: sessionUserID)
        let data = try SyncV2WireCodec.deltaParameters(known: known)
        let parameters = try JSONDecoder().decode([String: AnyJSON].self, from: data)
        let response = try await client.rpc("account_sync_delta", params: parameters).execute()
        return try SyncV2WireCodec.decodeDelta(data: response.data)
    }

    func fetchFingerprint(userID: String) async throws -> String? {
        try SyncV2WireCodec.validateAccountScope(requestedUserID: userID, sessionUserID: sessionUserID)
        let response = try await client.rpc("account_sync_fingerprint").execute()
        return try JSONDecoder().decode(String.self, from: response.data)
    }

    func apply(_ operation: SyncOperation) async throws -> SyncApplyResult {
        try SyncV2WireCodec.validateAccountScope(requestedUserID: operation.userID, sessionUserID: sessionUserID)
        let parameterData = try SyncV2WireCodec.rpcParameters(for: operation)
        let parameters = try JSONDecoder().decode([String: AnyJSON].self, from: parameterData)
        let response = try await client
            .rpc("apply_user_sync_operation", params: parameters)
            .execute()
        return try SyncV2WireCodec.decodeApplyResult(data: response.data)
    }

}
