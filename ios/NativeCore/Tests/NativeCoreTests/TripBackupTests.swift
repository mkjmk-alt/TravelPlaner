import XCTest
@testable import NativeCore

final class TripBackupTests: XCTestCase {
    func testActualSystemPickerExportsRemainLossless() throws {
        for name in ["ios-export.json", "android-export.json"] {
            let bytes = try contractBytes(name)
            let raw = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            let candidate = try TripBackup.decode(bytes)
            XCTAssertTrue(candidate.warnings.isEmpty)
            XCTAssertEqual(try jsonValue(candidate.trip.raw), try jsonValue(raw))
            XCTAssertEqual(try jsonValue(try TripBackup.decode(TripBackup.encode(candidate.trip)).trip.raw), try jsonValue(raw))
            XCTAssertEqual(candidate.trip.endDate, "2026-10-11")
            XCTAssertEqual((raw["expenses"] as? [[String: Any]])?.first?["amount"] as? Int, 500)
            XCTAssertEqual(try jsonValue(raw["futureRoot"]!), try jsonValue(["keep": [true, NSNull(), "[quoted]"]] as [String: Any]))
            XCTAssertNil(raw["sharedManagementToken"])
        }
    }
    func testPortablePhotoFixturesDecodeOnNativeImport() throws {
        for name in ["memory-ios-export.json", "memory-android-export.json"] {
            let candidate = try TripBackup.decode(contractBytes(name))
            let entry = try XCTUnwrap((candidate.trip.raw["journalEntries"] as? [[String: Any]])?.first)
            let dataURL = try XCTUnwrap(entry["imageDataUrl"] as? String)
            let payload = String(dataURL.drop(while: { $0 != "," }).dropFirst())
            let image = try XCTUnwrap(Data(base64Encoded: payload))
            XCTAssertEqual(TripBackup.hash(image), "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460")
            XCTAssertNil(entry["imageFileName"])
        }
    }
    func testLegacyRepairsAreDeterministicAndOriginalRemainsIntact() throws {
        let bytes = try contractBytes("legacy-trip-backup.json")
        let candidate = try TripBackup.decode(bytes)
        XCTAssertEqual(candidate.sourceBytes, bytes)
        XCTAssertEqual(candidate.sourceHash, TripBackup.hash(bytes))
        XCTAssertEqual(candidate.trip.id, "import-\(candidate.sourceHash)")
        XCTAssertEqual(candidate.trip.endDate, "2026-10-11")
        XCTAssertEqual(candidate.trip.updatedAt, 0)
        XCTAssertGreaterThan(candidate.warnings.count, 5)
        let item = try TripSchedule.items(in: .day(1), trip: candidate.trip)[0]
        XCTAssertEqual(item["id"] as? String, "import-\(candidate.sourceHash)-day-1-item-0")
        XCTAssertEqual(item["lat"] as? Double, 35.1)
        XCTAssertNotNil(item["futurePhoto"])
        XCTAssertNil(candidate.trip.raw["sharedId"])
        let export = try TripBackup.encode(candidate.trip)
        XCTAssertFalse(String(decoding: export, as: UTF8.self).contains("sharedManagementToken"))
        XCTAssertEqual(try TripBackup.decode(export).trip.encoded(), try candidate.trip.encoded())
        XCTAssertEqual(try TripBackup.decode(bytes).trip.encoded(), try candidate.trip.encoded())
    }
    func testCurrentWebContractRoundTripsAndBOMAccepted() throws {
        let bytes = try contractBytes("trip.json")
        let candidate = try TripBackup.decode(bytes)
        let raw = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        for key in ["expenses", "futureField", "budgetSettings", "itinerary"] {
            XCTAssertEqual(try jsonValue(raw[key]!), try jsonValue(candidate.trip.raw[key]!))
        }
        XCTAssertEqual(try TripBackup.decode(Data([0xef, 0xbb, 0xbf]) + bytes).trip.id, candidate.trip.id)
        XCTAssertEqual(TripBackup.filename("a/b\\c\n"), "a_b_c_-backup.json")
    }
    func testImportDropsExternalPhotoReferenceButPreservesEmbeddedPhotoAndSourceBytes() throws {
        var raw = try JSONSerialization.jsonObject(with: contractBytes("schedule-edit.json")) as! [String: Any]
        let embedded = "data:image/png;base64,AA=="
        raw["journalEntries"] = [["id": "j1", "date": "2026-10-10", "title": "사진", "body": "", "imageFileName": "local-photo.png", "imageDataUrl": embedded]]
        let bytes = try jsonValue(raw)
        let candidate = try TripBackup.decode(bytes)
        let entry = try XCTUnwrap((candidate.trip.raw["journalEntries"] as? [[String: Any]])?.first)
        XCTAssertNil(entry["imageFileName"])
        XCTAssertEqual(entry["imageDataUrl"] as? String, embedded)
        XCTAssertTrue(candidate.warnings.contains { $0.contains("외부 사진") })
        XCTAssertEqual(candidate.sourceBytes, bytes)
    }
    func testMalformedPresentValuesAreRejectedNotRepaired() throws {
        let raw = try JSONSerialization.jsonObject(with: contractBytes("schedule-edit.json")) as! [String: Any]
        for (key, value): (String, Any) in [("country", NSNull()), ("reserveItems", "bad"), ("expenses", NSNull()), ("startDate", "2026-02-30"), ("createdAt", true)] {
            var bad = raw; bad[key] = value
            XCTAssertThrowsError(try TripBackup.decode(jsonValue(bad)))
        }
        for invalid in ["[]", "{}", "```json\n{}\n```", "not-json"] { XCTAssertThrowsError(try TripBackup.decode(Data(invalid.utf8))) }
        var bad = raw; var days = raw["itinerary"] as! [[String: Any]]; var items = days[0]["items"] as! [[String: Any]]
        items[0]["time"] = "24:00"; days[0]["items"] = items; bad["itinerary"] = days
        XCTAssertThrowsError(try TripBackup.decode(jsonValue(bad)))
        items[0]["time"] = ""; items[0]["id"] = "1"; days[0]["items"] = items; bad["itinerary"] = days
        XCTAssertThrowsError(try TripBackup.decode(jsonValue(bad)))
    }
    func testByteDepthAndItemLimitsAndQuotedBrackets() throws {
        XCTAssertThrowsError(try TripBackup.decode(Data(repeating: 32, count: TripBackup.maxBytes + 1)))
        var raw = try JSONSerialization.jsonObject(with: contractBytes("schedule-edit.json")) as! [String: Any]
        raw["quoted"] = String(repeating: "[\\\"", count: 100)
        XCTAssertNoThrow(try TripBackup.decode(jsonValue(raw)))
        var deep: Any = "value"; for _ in 0..<64 { deep = [deep] }; raw["deep"] = deep
        XCTAssertThrowsError(try TripBackup.decode(jsonValue(raw)))
        raw.removeValue(forKey: "deep")
        raw["reserveItems"] = (0..<10001).map { ["id": "p-\($0)", "name": "place"] }
        XCTAssertThrowsError(try TripBackup.decode(jsonValue(raw)))
    }
}
