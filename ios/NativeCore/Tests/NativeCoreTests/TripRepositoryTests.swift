import XCTest
@testable import NativeCore

final class TripRepositoryTests: XCTestCase {
    func testDiskDatabaseSurvivesReopeningAndUpdate() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("test.sqlite")
        let trip = try TripDocument.create(draft: .init(name: "종료 후 보존", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        do {
            let store = try TripRepository(url: url)
            try store.save(trip)
            XCTAssertEqual(try store.list().map(\.id), [trip.id])
        }
        do {
            let store = try TripRepository(url: url)
            let loaded = try XCTUnwrap(store.list().first)
            XCTAssertEqual(loaded.name, "종료 후 보존")
            try store.save(loaded.edited(draft: .init(name: "수정 후 보존", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11")))
        }
        let reopened = try TripRepository(url: url)
        XCTAssertEqual(try reopened.list().count, 1)
        XCTAssertEqual(try reopened.list().first?.name, "수정 후 보존")
        try reopened.delete(id: trip.id)
        XCTAssertTrue(try reopened.list().isEmpty)
    }

    func testUnwritableLocationReportsFailure() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("not a directory".utf8).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        XCTAssertThrowsError(try TripRepository(url: file.appendingPathComponent("db.sqlite")))
        XCTAssertEqual(try Data(contentsOf: file), Data("not a directory".utf8))
    }

    func testExpenseMutationRoundTripsAndPreservesUneditedTripFields() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let trip = try TripDocument.create(draft: .init(name: "정산 보존", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        let store = try TripRepository(url: folder.appendingPathComponent("test.sqlite"))
        try store.save(trip)
        let saved = try store.upsertExpense(tripID: trip.id, expenseID: "expense-1", fields: [
            "amount": 1200, "currency": "JPY", "amountKRW": 10800, "category": "food",
            "payerId": "self", "participantIds": ["self"], "futureExpenseField": "keep"
        ])
        let expense = try XCTUnwrap((saved.raw["expenses"] as? [[String: Any]])?.first)
        XCTAssertEqual(expense["futureExpenseField"] as? String, "keep")
        XCTAssertEqual(saved.raw["futureField"] as? String, trip.raw["futureField"] as? String)
        let reopened = try TripRepository(url: folder.appendingPathComponent("test.sqlite"))
        XCTAssertEqual((try reopened.list().first?.raw["expenses"] as? [[String: Any]])?.count, 1)
        try reopened.deleteExpense(tripID: trip.id, expenseID: "expense-1")
        XCTAssertTrue((try reopened.list().first?.raw["expenses"] as? [[String: Any]] ?? []).isEmpty)
    }
}
