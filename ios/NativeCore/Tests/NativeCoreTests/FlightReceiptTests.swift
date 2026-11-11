import XCTest
@testable import NativeCore

final class FlightReceiptTests: XCTestCase {
    func testRecognizesExplicitFieldsWithoutInventingBoardingTime() {
        let text = """
        Flight: KE703
        Departure: ICN 2026-11-28 09:30
        Arrival: NRT 2026-11-28 12:00
        """
        let flight = FlightReceiptParser.parse(text)
        XCTAssertEqual(flight.flightNumber, "KE703")
        XCTAssertEqual(flight.departure, "ICN")
        XCTAssertEqual(flight.arrival, "NRT")
        XCTAssertEqual(flight.departureDate, "2026-11-28")
        XCTAssertEqual(flight.departureTime, "09:30")
        XCTAssertEqual(flight.arrivalDate, "2026-11-28")
        XCTAssertEqual(flight.arrivalTime, "12:00")
        XCTAssertEqual(flight.boardingTime, "")
        XCTAssertEqual(flight.boardingDate, "")
    }
    func testExplicitBoardingAndKoreanDateAreSeparateFromDeparture() {
        let text = """
        항공편: KE703
        출발: ICN 2026년 11월 28일 09:30
        탑승 시간: 08:50
        도착: NRT 2026년 11월 28일 12:00
        """
        let flight = FlightReceiptParser.parse(text)
        XCTAssertEqual(flight.departureDate, "2026-11-28")
        XCTAssertEqual(flight.boardingTime, "08:50")
        XCTAssertEqual(flight.departureTime, "09:30")
    }
    func testLowCostCarrierCodeAndKoreanAfternoonTime() {
        let flight = FlightReceiptParser.parse("항공편 7C1234\n출발: ICN 2026-11-28 오후 3:30")
        XCTAssertEqual(flight.flightNumber, "7C1234")
        XCTAssertEqual(flight.departureTime, "15:30")
    }
    func testEnglishDatesAndMeridiemAreInterpretedWithoutShiftingDays() {
        let flight = FlightReceiptParser.parse("Flight: KE703\nDeparture: ICN 28 NOV 2026 9:30 PM\nArrival: NRT 29 NOV 2026 12:15 AM")
        XCTAssertEqual(flight.departureDate, "2026-11-28")
        XCTAssertEqual(flight.departureTime, "21:30")
        XCTAssertEqual(flight.arrivalDate, "2026-11-29")
        XCTAssertEqual(flight.arrivalTime, "00:15")
    }
    func testConfirmationAddsFlightToCorrectDayAndRejectsDuplicate() throws {
        let trip = try TripDocument.create(draft: .init(name: "Trip", country: "일본", startDate: "2026-11-28", endDate: "2026-12-01"))
        var flight = FlightReceiptDraft(); flight.flightNumber = "KE703"; flight.departure = "ICN"; flight.arrival = "NRT"
        flight.departureDate = "2026-11-29"; flight.departureTime = "09:30"; flight.arrivalDate = "2026-11-29"; flight.arrivalTime = "12:00"
        let result = try FlightConfirmation.apply(flight, to: trip, expected: [:], addToItinerary: true, itemID: UUID().uuidString)
        let items = try TripSchedule.items(in: .day(2), trip: result)
        XCTAssertEqual(items.count, 1); XCTAssertEqual(items[0]["time"] as? String, "09:30")
        XCTAssertEqual(items[0]["category"] as? String, "flight")
        XCTAssertEqual((result.raw["travelDetails"] as? [String: Any])?["flightDepartureDate"] as? String, "2026-11-29")
        XCTAssertThrowsError(try FlightConfirmation.apply(flight, to: result, expected: [:], addToItinerary: true, itemID: UUID().uuidString))
    }
    func testRepositorySavesDetailsAndItineraryAtomicallyAndPreservesPendingQueue() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("trip.sqlite")
        let repository = try TripRepository(url: url)
        let trip = try TripDocument.create(draft: .init(name: "Trip", country: "일본", startDate: "2026-11-28", endDate: "2026-12-01"))
        try repository.save(trip, syncContext: .init(userID: "account-a"))
        var flight = FlightReceiptDraft(); flight.flightNumber = "KE703"; flight.departureDate = "2026-11-29"; flight.departureTime = "09:30"
        let saved = try repository.saveFlightConfirmation(tripID: trip.id, flight: flight, expected: [:], addToItinerary: true, itemID: UUID().uuidString, syncContext: .init(userID: "account-a"))
        XCTAssertEqual(try TripSchedule.items(in: .day(2), trip: saved).count, 1)
        let before = try saved.encoded()
        XCTAssertThrowsError(try repository.saveFlightConfirmation(tripID: trip.id, flight: flight, expected: [:], addToItinerary: true, itemID: UUID().uuidString, syncContext: .init(userID: "account-a")))
        let reopened = try TripRepository(url: url)
        XCTAssertEqual(try reopened.list(userID: "account-a").first?.encoded(), before)
        XCTAssertFalse(try SyncOutboxRepository(url: url).pending(userID: "account-a").isEmpty)
    }
    func testOutOfRangeAndInvalidDatesNeverModifyOriginal() throws {
        let trip = try TripDocument.create(draft: .init(name: "Trip", country: "일본", startDate: "2026-11-28", endDate: "2026-12-01"))
        let original = try trip.encoded()
        var flight = FlightReceiptDraft(); flight.flightNumber = "KE703"; flight.departureDate = "2026-12-05"; flight.departureTime = "09:30"
        XCTAssertThrowsError(try FlightConfirmation.apply(flight, to: trip, expected: [:], addToItinerary: true, itemID: UUID().uuidString))
        flight.departureDate = "2026-02-30"
        XCTAssertThrowsError(try FlightConfirmation.apply(flight, to: trip, expected: [:], addToItinerary: false, itemID: UUID().uuidString))
        XCTAssertEqual(try trip.encoded(), original)
    }
    func testMultipleSegmentsAndUnlabelledTimeAreNotGuessed() {
        let flight = FlightReceiptParser.parse("Flight KE703\nDeparture 2026-11-28 09:30\nFlight KE704\nDeparture 2026-12-01 15:20\n08:50")
        XCTAssertEqual(flight.flightNumber, "")
        XCTAssertEqual(flight.departureDate, "")
        XCTAssertEqual(flight.departureTime, "")
        XCTAssertEqual(flight.boardingTime, "")
        XCTAssertTrue(flight.hasAmbiguity)
    }
}
