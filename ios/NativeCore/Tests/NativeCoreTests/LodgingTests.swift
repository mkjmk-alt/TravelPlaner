import XCTest
@testable import NativeCore

final class LodgingTests: XCTestCase {
    func testChangeoverAndLegacyPreservation() throws {
        let trip = try TripDocument.create(draft: .init(name: "여행", country: "일본", startDate: "2026-11-28", endDate: "2026-12-02"))
        let stays: [[String: Any]] = [
            ["id": "a", "name": "삿포로", "checkIn": "2026-11-28", "checkOut": "2026-11-30"],
            ["id": "b", "name": "하코다테", "checkIn": "2026-11-30", "checkOut": "2026-12-02"]
        ]
        let old = try TripMemory.apply(.setTravelDetails(values: ["stayName": "기존 호텔", "stayAddress": "기존 주소"], expected: ["stayName": "", "stayAddress": ""]), to: trip, now: 9)
        let updated = try TripMemory.apply(.setLodgings(rows: stays, expected: []), to: old, now: 10)
        let changeover = TripLodging.day(3, in: updated)
        XCTAssertEqual(changeover.count, 2)
        XCTAssertTrue(changeover[0].checkOut)
        XCTAssertFalse(changeover[0].overnight)
        XCTAssertTrue(changeover[1].checkIn)
        XCTAssertTrue(changeover[1].overnight)
        XCTAssertThrowsError(try TripMemory.apply(.setLodgings(rows: [], expected: []), to: updated, now: 11))
        XCTAssertEqual((updated.raw["travelDetails"] as? [String: String])?["stayName"], "기존 호텔")
        XCTAssertEqual((updated.raw["travelDetails"] as? [String: String])?["stayAddress"], "기존 주소")
    }

    func testValidationAndSameDay() throws {
        let sameDay: [String: Any] = ["name": "호텔", "checkIn": "2026-11-30", "checkOut": "2026-11-30"]
        XCTAssertNoThrow(try TripLodging.validate(sameDay))
        XCTAssertThrowsError(try TripLodging.validate(["name": "호텔", "checkIn": "2026-02-30", "checkOut": "2026-03-01"]))
        XCTAssertThrowsError(try TripLodging.validate(["name": "호텔", "checkIn": "2026-11-30", "checkOut": "2026-11-29"]))
    }
    func testEventsAreExplicitAndNotDuplicated() throws {
        let trip = try TripDocument.create(draft: .init(name: "여행", country: "일본", startDate: "2026-11-28", endDate: "2026-11-30"))
        let row: [String: Any] = ["id": "hotel", "name": "호텔", "address": "주소", "checkIn": "2026-11-28", "checkOut": "2026-11-30", "checkInTime": "15:00", "lat": 35.68, "lng": 139.76, "placeId": "place-id"]
        let saved = try TripMemory.apply(.setLodgings(rows: [row], expected: []), to: trip, now: 10)
        XCTAssertEqual(try TripSchedule.items(in: .day(1), trip: saved).count, 0)
        let added = try TripMemory.apply(.addLodgingEvents(row: row), to: saved, now: 11)
        XCTAssertEqual(try TripSchedule.items(in: .day(1), trip: added).first?["time"] as? String, "15:00")
        XCTAssertEqual(try TripSchedule.items(in: .day(1), trip: added).first?["placeId"] as? String, "place-id")
        XCTAssertEqual(try TripSchedule.items(in: .day(3), trip: added).first?["lodgingEventKey"] as? String, "hotel:checkOut")
        XCTAssertThrowsError(try TripMemory.apply(.addLodgingEvents(row: row), to: added, now: 12))
        XCTAssertThrowsError(try TripMemory.apply(.addLodgingEvents(row: ["id": "hotel", "name": "달라짐"]), to: added, now: 12))
    }

}
