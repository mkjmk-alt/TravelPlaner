import Foundation
import XCTest
@testable import NativeCore

final class SyncV2WireCodecTests: XCTestCase {
    func testDeltaParametersContainOnlyIdentityAndRevisionAndDecodeDeletion() throws {
        let known = SyncRecord(userID: "account-a", recordType: .trip, recordID: "trip-a", payload: ["private": "hidden"], revision: 2, updatedAt: Date(), deletedAt: nil)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: SyncV2WireCodec.deltaParameters(known: [known])) as? [String: Any])
        let rows = try XCTUnwrap(object["p_known"] as? [[String: Any]])
        XCTAssertEqual(rows.first?["record_type"] as? String, "trip")
        XCTAssertEqual(rows.first?["record_id"] as? String, "trip-a")
        XCTAssertEqual(rows.first?["revision"] as? Int, 2)
        XCTAssertEqual(rows.first?["deleted"] as? Bool, false)
        XCTAssertNil(rows.first?["payload"])
        let data = Data(#"{"requires_full":false,"records":[{"user_id":"account-a","record_type":"trip","record_id":"trip-a","payload":null,"revision":3,"updated_at":"2026-10-14T01:02:03Z","deleted_at":"2026-10-14T01:02:03Z"}]}"#.utf8)
        let delta = try SyncV2WireCodec.decodeDelta(data: data)
        XCTAssertFalse(delta.requiresFull)
        XCTAssertEqual(delta.records.first?.revision, 3)
        XCTAssertNotNil(delta.records.first?.deletedAt)
        XCTAssertThrowsError(try SyncV2WireCodec.decodeDelta(data: Data(#"{"records":[]}"#.utf8)))
    }

    func testFullPageDecodesRecordsAndReturnsNextOffsetCursor() throws {
        let data = Data(#"""
        [
          {"user_id":"account-a","record_type":"trip","record_id":"trip-a","payload":{"id":"trip-a","name":"Rome","extra":{"kept":true}},"revision":4,"updated_at":"2026-10-14T01:02:03.000Z","deleted_at":null},
          {"user_id":"account-a","record_type":"savedPlace","record_id":"place-a","payload":null,"revision":5,"updated_at":"2026-10-14T01:02:04.000Z","deleted_at":"2026-10-14T01:02:04.000Z"}
        ]
        """#.utf8)

        let page = try SyncV2WireCodec.decodePage(data: data, offset: 20, pageSize: 2)

        XCTAssertEqual(page.records.count, 2)
        let extra = try XCTUnwrap(page.records[0].payload?["extra"] as? [String: Any])
        XCTAssertEqual(extra["kept"] as? Bool, true)
        XCTAssertEqual(page.records[1].recordType.rawValue, "savedPlace")
        XCTAssertNotNil(page.records[1].deletedAt)
        XCTAssertEqual(page.nextCursor, "22")
    }

    func testShortPageHasNoNextCursor() throws {
        let data = Data(#"[{"user_id":"account-a","record_type":"trip","record_id":"trip-a","payload":{"id":"trip-a"},"revision":1,"updated_at":"2026-10-14T01:02:03Z","deleted_at":null}]"#.utf8)

        let page = try SyncV2WireCodec.decodePage(data: data, offset: 0, pageSize: 2)

        XCTAssertEqual(page.records.map(\.recordID), ["trip-a"])
        XCTAssertNil(page.nextCursor)
    }

    func testOperationUsesTheServerRPCParameterNamesAndPreservesPayload() throws {
        let operationID = UUID(uuidString: "46a15a5a-8edc-4baa-8bb2-04f36efddbc9")!
        let operation = SyncOperation(
            operationID: operationID,
            userID: "account-a",
            recordType: .trip,
            recordID: "trip-a",
            expectedRevision: 3,
            payload: ["id": "trip-a", "name": "Kyoto", "extras": ["flag": true]],
            deletedAt: nil
        )

        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: SyncV2WireCodec.rpcParameters(for: operation)) as? [String: Any])

        XCTAssertEqual(object["p_record_type"] as? String, "trip")
        XCTAssertEqual(object["p_record_id"] as? String, "trip-a")
        XCTAssertEqual(object["p_expected_revision"] as? Int, 3)
        XCTAssertEqual(object["p_operation_id"] as? String, operationID.uuidString.lowercased())
        XCTAssertNil(object["p_deleted_at"] as? String)
        let payload = try XCTUnwrap(object["p_payload"] as? [String: Any])
        XCTAssertEqual(payload["name"] as? String, "Kyoto")
        XCTAssertEqual((payload["extras"] as? [String: Any])?["flag"] as? Bool, true)
    }

    func testRPCResponsePreservesConflictServerDocument() throws {
        let data = Data(#"{"status":"conflict","record":{"user_id":"account-a","record_type":"trip","record_id":"trip-a","payload":{"id":"trip-a","name":"server"},"revision":8,"updated_at":"2026-10-14T01:02:03Z","deleted_at":null}}"#.utf8)

        let result = try SyncV2WireCodec.decodeApplyResult(data: data)

        XCTAssertEqual(result.status.rawValue, "conflict")
        XCTAssertEqual(result.record.revision, 8)
        XCTAssertEqual(result.record.payload?["name"] as? String, "server")
    }

    func testMalformedRPCStatusIsRejected() {
        let data = Data(#"{"status":"ignored","record":null}"#.utf8)

        XCTAssertThrowsError(try SyncV2WireCodec.decodeApplyResult(data: data))
    }

    func testAccountScopeRejectsEmptyOrDifferentSessionUser() {
        XCTAssertNoThrow(try SyncV2WireCodec.validateAccountScope(requestedUserID: "account-a", sessionUserID: "ACCOUNT-A"))
        XCTAssertThrowsError(try SyncV2WireCodec.validateAccountScope(requestedUserID: "account-b", sessionUserID: "account-a"))
        XCTAssertThrowsError(try SyncV2WireCodec.validateAccountScope(requestedUserID: "", sessionUserID: "account-a"))
    }
}
