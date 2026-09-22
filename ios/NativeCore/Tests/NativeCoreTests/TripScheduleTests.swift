import XCTest
@testable import NativeCore

func contractBytes(_ name: String) throws -> Data {
    var root = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { root.deleteLastPathComponent() }
    return try Data(contentsOf: root.appendingPathComponent("contracts/native/fixtures/\(name)"))
}
func jsonValue(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed])
}

final class TripScheduleTests: XCTestCase {
    func testTimeRejectsTrailingNewline() {
        XCTAssertFalse(TripSchedule.validTime("09:30\n"))
        XCTAssertFalse(TripSchedule.validTime("09:30\r\n"))
        XCTAssertTrue(TripSchedule.validTime("09:30"))
    }
    func fixture() throws -> TripDocument { try TripDocument(data: contractBytes("schedule-edit.json")) }
    let draft = PlaceDraft(name: "새 이름", displayName: "표시", loc: "주소", time: "10:30", memo: "변경 메모", emoji: "✈️")

    func testTypedIDsAndFixedSequencePreserveOtherFields() throws {
        let original = try fixture()
        let originalBytes = try original.encoded()
        let edited = try TripSchedule.apply(.edit(section: .day(1), key: .integer(1), draft: draft), to: original)
        let moved = try TripSchedule.apply(.move(section: .day(1), key: .integer(1), to: .reserve), to: edited)
        let expected = try JSONSerialization.jsonObject(with: contractBytes("schedule-expected.json")) as! [String: Any]
        let days = try TripSchedule.items(in: .day(1), trip: moved)
        let reserve = try TripSchedule.items(in: .reserve, trip: moved)
        XCTAssertEqual(try jsonValue(days.map { $0["id"]! }), try jsonValue(expected["day1IDs"]!))
        XCTAssertEqual(try jsonValue(reserve.map { $0["id"]! }), try jsonValue(expected["reserveIDs"]!))
        for (key, expectedKey) in [("name", "movedName"), ("time", "movedTime"), ("memo", "movedMemo")] {
            XCTAssertEqual(reserve.last?[key] as? String, expected[expectedKey] as? String)
        }
        let originalItem = try TripSchedule.items(in: .day(1), trip: original)[0]
        for key in ["lat", "lng", "reservationNumber", "reservationUrl", "futureField"] {
            XCTAssertEqual(try jsonValue(reserve.last![key]!), try jsonValue(originalItem[key]!))
        }
        for key in ["expenses", "futureRoot", "createdAt"] {
            XCTAssertEqual(try jsonValue(moved.raw[key]!), try jsonValue(original.raw[key]!))
        }
        XCTAssertEqual(try original.encoded(), originalBytes)
        XCTAssertThrowsError(try TripSchedule.apply(.move(section: .day(1), key: .integer(1), to: .reserve), to: moved))
    }

    func testAddDeleteShiftSortAndNoOps() throws {
        let original = try fixture()
        let added = try TripSchedule.apply(.add(section: .day(2), id: UUID().uuidString, draft: draft), to: original)
        let item = try TripSchedule.items(in: .day(2), trip: added)[0]
        let key = try ItemKey(json: item["id"]!)
        XCTAssertEqual(try TripSchedule.items(in: .day(2), trip: added).count, 1)
        XCTAssertGreaterThan(added.updatedAt, original.updatedAt)
        XCTAssertEqual(try TripSchedule.apply(.shift(section: .day(2), key: key, offset: -1), to: added).encoded(), try added.encoded())
        XCTAssertEqual(try TripSchedule.apply(.move(section: .day(2), key: key, to: .day(2)), to: added).encoded(), try added.encoded())
        XCTAssertTrue(try TripSchedule.items(in: .day(2), trip: TripSchedule.apply(.remove(section: .day(2), key: key), to: added)).isEmpty)
        let sorted = try TripSchedule.apply(.sortByTime(section: .day(1)), to: original)
        XCTAssertEqual(try TripSchedule.items(in: .day(1), trip: sorted).map { String(describing: $0["id"]!) }, ["1", "tie", "1", "empty"])
        let shifted = try TripSchedule.apply(.shift(section: .day(1), key: .integer(1), offset: 1), to: original)
        XCTAssertEqual(try ItemKey(json: TripSchedule.items(in: .day(1), trip: shifted)[0]["id"]!), .string("1"))
        XCTAssertThrowsError(try TripSchedule.apply(.shift(section: .day(1), key: .integer(1), offset: 2), to: original))
        XCTAssertEqual(try TripSchedule.apply(.sortByTime(section: .day(2)), to: original).encoded(), try original.encoded())
    }

    func testInvalidAndDuplicateKeysCannotChangeAnotherPlace() throws {
        for value: Any in [true, 1.5, 9007199254740992.0, ""] { XCTAssertThrowsError(try ItemKey(json: value)) }
        var raw = try fixture().raw
        var days = raw["itinerary"] as! [[String: Any]]
        var items = days[0]["items"] as! [[String: Any]]
        items.append(items[0]); days[0]["items"] = items; raw["itinerary"] = days
        let duplicate = try TripDocument(data: jsonValue(raw))
        XCTAssertThrowsError(try TripSchedule.apply(.remove(section: .day(1), key: .integer(1)), to: duplicate))
        XCTAssertThrowsError(try TripSchedule.apply(.add(section: .day(99), id: UUID().uuidString, draft: draft), to: fixture()))
        XCTAssertThrowsError(try TripSchedule.apply(.add(section: .reserve, id: "1", draft: draft), to: fixture()))
    }

    func testValidationAndUnchangedLegacyLongFields() throws {
        for time in ["24:00", "12:60", "9:00", " 09:00", "garbage"] {
            var invalid = draft; invalid.time = time
            XCTAssertThrowsError(try TripSchedule.apply(.edit(section: .day(1), key: .integer(1), draft: invalid), to: fixture()))
        }
        var invalid = draft; invalid.name = " \n"
        XCTAssertThrowsError(try TripSchedule.apply(.add(section: .reserve, id: UUID().uuidString, draft: invalid), to: fixture()))
        invalid = draft; invalid.memo = String(repeating: "a", count: 10001)
        XCTAssertThrowsError(try TripSchedule.apply(.edit(section: .day(1), key: .integer(1), draft: invalid), to: fixture()))
        var raw = try fixture().raw
        var days = raw["itinerary"] as! [[String: Any]]
        var items = days[0]["items"] as! [[String: Any]]
        items[0]["memo"] = invalid.memo; days[0]["items"] = items; raw["itinerary"] = days
        let legacy = try TripDocument(data: jsonValue(raw))
        XCTAssertNoThrow(try TripSchedule.apply(.edit(section: .day(1), key: .integer(1), draft: invalid), to: legacy))
    }
}
