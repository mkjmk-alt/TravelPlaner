import Foundation
import XCTest
@testable import NativeCore

final class SyncContractTests: XCTestCase {
    func testFixtureRoundTripPreservesStringIDsUnknownFieldsAndZeroRevision() throws {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../contracts/sync/v2/record-v2.example.json")
            .standardizedFileURL
        let fixture = try Data(contentsOf: fixtureURL)

        let record = try SyncRecord(data: fixture)
        XCTAssertEqual(record.userID, "test-account-001")
        XCTAssertEqual(record.recordType, .trip)
        XCTAssertEqual(record.recordID, "trip-string-id-001")
        XCTAssertEqual(record.revision, 0)
        XCTAssertNil(record.deletedAt)
        let futureValues = try XCTUnwrap(record.payload?["futureTopLevelField"] as? [Any])
        XCTAssertEqual(futureValues.first as? String, "preserve")
        XCTAssertEqual((futureValues.last as? NSNumber)?.intValue, 7)
        let itinerary = try XCTUnwrap(record.payload?["itinerary"] as? [[String: Any]])
        let items = try XCTUnwrap(itinerary.first?["items"] as? [[String: Any]])
        let firstItem = try XCTUnwrap(items.first)
        let futureField = try XCTUnwrap(firstItem["futureField"] as? [String: Any])
        XCTAssertEqual(futureField["kept"] as? Bool, true)

        let decodedAgain = try SyncRecord(data: record.encoded())
        XCTAssertEqual(decodedAgain.userID, record.userID)
        XCTAssertEqual(decodedAgain.recordID, record.recordID)
        XCTAssertEqual(decodedAgain.revision, 0)
        let decodedPayload = try XCTUnwrap(decodedAgain.payload)
        let originalPayload = try XCTUnwrap(record.payload)
        XCTAssertEqual(try jsonValue(decodedPayload), try jsonValue(originalPayload))
    }

    func testTombstoneAllowsMissingPayloadAndRetainsDeletionRevision() throws {
        let data = try JSONSerialization.data(withJSONObject: [
            "user_id": "test-account-001",
            "record_type": "savedPlace",
            "record_id": "place-string-id",
            "payload": NSNull(),
            "revision": 9,
            "updated_at": "2026-10-14T00:00:00Z",
            "deleted_at": "2026-10-14T00:00:00Z"
        ])

        let record = try SyncRecord(data: data)
        XCTAssertEqual(record.recordType, .savedPlace)
        XCTAssertEqual(record.recordID, "place-string-id")
        XCTAssertEqual(record.revision, 9)
        XCTAssertNil(record.payload)
        XCTAssertNotNil(record.deletedAt)
        XCTAssertNotNil(try SyncRecord(data: record.encoded()).deletedAt)
        XCTAssertThrowsError(try SyncRecord(userID: "test-account-001", recordType: .trip,
                                            recordID: "trip-a", payload: ["id": "trip-a"], revision: 9,
                                            updatedAt: Date(), deletedAt: Date()).encoded())
    }
}
