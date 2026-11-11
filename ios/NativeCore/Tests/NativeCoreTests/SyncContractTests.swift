import XCTest
@testable import NativeCore

final class SyncContractTests: XCTestCase {
    func testExampleRecordRoundTripsStringIDUnknownFieldsAndRevisionZero() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let fixtureURL = root.appendingPathComponent("contracts/sync/v2/record-v2.example.json")
        let record = try SyncRecord(data: Data(contentsOf: fixtureURL))

        XCTAssertEqual(record.userID, "user-example-7")
        XCTAssertEqual(record.recordType, .trip)
        XCTAssertEqual(record.recordID, "trip-2026-spring")
        XCTAssertEqual(record.revision, 0)
        XCTAssertNil(record.deletedAt)
        XCTAssertEqual((record.payload?["futureField"] as? [String: Any])?["source"] as? String, "web")

        let restored = try SyncRecord(data: record.encoded())
        XCTAssertEqual(restored.userID, record.userID)
        XCTAssertEqual(restored.recordID, "trip-2026-spring")
        XCTAssertEqual(restored.revision, 0)
        XCTAssertEqual((restored.payload?["futureField"] as? [String: Any])?["preserve"] as? Bool, true)
    }

    func testTombstoneRoundTripsWithoutLosingItsRevision() throws {
        let deletedAt = Date(timeIntervalSince1970: 1_791_900_000)
        let record = try SyncRecord(
            userID: "account-a",
            recordType: .savedPlace,
            recordID: "saved-place-legacy-id",
            payload: ["id": "saved-place-legacy-id", "name": "삭제된 장소"],
            revision: 12,
            updatedAt: deletedAt,
            deletedAt: deletedAt
        )

        let restored = try SyncRecord(data: record.encoded())
        XCTAssertEqual(restored.recordType, .savedPlace)
        XCTAssertEqual(restored.recordID, "saved-place-legacy-id")
        XCTAssertEqual(restored.revision, 12)
        XCTAssertEqual(restored.deletedAt, deletedAt)
    }
}
