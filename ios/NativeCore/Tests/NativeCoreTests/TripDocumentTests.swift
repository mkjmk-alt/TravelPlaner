import XCTest
@testable import NativeCore

final class TripDocumentTests: XCTestCase {
    private let draft = TripDraft(name: "  오사카 여행  ", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11")

    func testCreatesWebCompatibleTripAndTrimsName() throws {
        let trip = try TripDocument.create(draft: draft)
        XCTAssertEqual(trip.name, "오사카 여행")
        XCTAssertEqual(trip.dayCount, 2)
        XCTAssertEqual(trip.days.count, 2)
        XCTAssertEqual((trip.raw["budgetSettings"] as? [String: Any])?["travelCurrency"] as? String, "JPY")
        XCTAssertEqual((trip.raw["settlementParticipants"] as? [[String: Any]])?.first?["id"] as? String, "self")
        XCTAssertEqual(try TripDocument(data: trip.encoded()).id, trip.id)
    }

    func testRejectsInvalidNamesDatesAndLongTrips() {
        let cases = [
            TripDraft(name: " \n", country: "", startDate: "2026-10-10", endDate: "2026-10-11"),
            TripDraft(name: "여행", country: "", startDate: "2026-02-30", endDate: "2026-03-01"),
            TripDraft(name: "여행", country: "", startDate: "2026-2-01", endDate: "2026-03-01"),
            TripDraft(name: "여행", country: "", startDate: "2026-10-11", endDate: "2026-10-10"),
            TripDraft(name: "여행", country: "", startDate: "2026-01-01", endDate: "2026-04-11")
        ]
        for invalid in cases { XCTAssertThrowsError(try TripDocument.create(draft: invalid)) }
    }

    func testIncludesBothDatesAndAcceptsOneHundredDays() throws {
        let single = try TripDocument.create(draft: .init(name: "당일", country: "", startDate: "2026-03-08", endDate: "2026-03-08"))
        let hundred = try TripDocument.create(draft: .init(name: "긴 여행", country: "", startDate: "2026-01-01", endDate: "2026-04-10"))
        XCTAssertEqual(single.dayCount, 1)
        XCTAssertEqual(hundred.dayCount, 100)
    }

    func testEditingPreservesUnknownFieldsMoneyAndPlaces() throws {
        let original = try fixture()
        let edited = try original.edited(draft: .init(name: "새 이름", country: "일본", startDate: "2026-10-10", endDate: "2026-10-12"))
        XCTAssertEqual(edited.id, original.id)
        XCTAssertEqual(edited.raw["createdAt"] as? Double, original.raw["createdAt"] as? Double)
        for key in ["futureField", "expenses", "budgetSettings", "reserveItems", "checklist", "travelDetails"] {
            XCTAssertEqual(try fragment(original.raw[key]!), try fragment(edited.raw[key]!))
        }
        XCTAssertEqual(try fragment(original.days[1]), try fragment(edited.days[1]))
        XCTAssertEqual(edited.days.count, 3)
    }

    func testRefusesToDiscardPopulatedDaysAndAllowsEmptyShrink() throws {
        XCTAssertThrowsError(try fixture().edited(draft: .init(name: "축소", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")))
        let empty = try TripDocument.create(draft: draft)
        XCTAssertEqual(try empty.edited(draft: .init(name: "당일", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")).days.count, 1)
    }

    func testMalformedDocumentDoesNotBecomeEmptyTrip() {
        XCTAssertThrowsError(try TripDocument(data: Data("{}".utf8)))
        XCTAssertThrowsError(try TripDocument(data: Data("not-json".utf8)))
    }

    func testRejectsMismatchedDaysAndInvalidSavedFields() throws {
        let original = try fixture()
        for (key, value) in [("itinerary", [["day": 1, "items": []]]) as (String, Any), ("createdAt", "invalid"), ("country", 12), ("id", " ")] {
            var raw = original.raw
            raw[key] = value
            XCTAssertThrowsError(try TripDocument(data: JSONSerialization.data(withJSONObject: raw)))
        }
    }

    func testCannotShrinkDaysWithUnrecognizedMetadata() throws {
        let trip = try TripDocument.create(draft: draft)
        var raw = trip.raw
        raw["itinerary"] = [["day": 1, "items": []], ["day": 2, "items": [], "note": "반드시 보존"]]
        let withNote = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
        XCTAssertThrowsError(try withNote.edited(draft: .init(name: "축소", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")))
    }

    func testWebDefaultsAndMonotonicTimestamp() throws {
        let trip = try TripDocument.create(draft: .init(name: "프랑스", country: "프랑스", startDate: "2026-10-10", endDate: "2026-10-11"))
        XCTAssertEqual((trip.raw["budgetSettings"] as? [String: Any])?["travelCurrency"] as? String, "EUR")
        XCTAssertEqual((trip.raw["checklist"] as? [[String: Any]])?.count, 5)
        var raw = trip.raw
        raw["updatedAt"] = Date().timeIntervalSince1970 * 1000 + 999999
        let future = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
        XCTAssertGreaterThan(try future.edited(draft: future.draft).updatedAt, future.updatedAt)
    }

    private func fragment(_ value: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed])
    }

    private func fixture() throws -> TripDocument {
        let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try TripDocument(data: Data(contentsOf: repo.appendingPathComponent("contracts/native/fixtures/trip.json")))
    }
}
