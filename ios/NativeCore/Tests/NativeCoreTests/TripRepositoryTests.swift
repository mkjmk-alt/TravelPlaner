import XCTest
@testable import NativeCore

final class TripRepositoryTests: XCTestCase {
    func testRemoteBatchKeepsLegacyExtraDayAndOtherTrips() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = try TripRepository(url: folder.appendingPathComponent("sync.sqlite"))
        let first = try TripDocument.create(draft: .init(name: "기존 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        let second = try TripDocument.create(draft: .init(name: "다른 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        var legacy = first.raw
        legacy["itinerary"] = first.days + [["day": 3, "items": [["id": "extra", "name": "추가 일정"]]]]
        let now = Date()
        let records = [SyncRecord(userID: "account-a", recordType: .trip, recordID: first.id, payload: legacy, revision: 1, updatedAt: now, deletedAt: nil),
                       SyncRecord(userID: "account-a", recordType: .trip, recordID: second.id, payload: second.raw, revision: 1, updatedAt: now, deletedAt: nil)]
        _ = try repository.applyRemoteRecords(records, userID: "account-a")
        let loaded = try repository.list(userID: "account-a")
        XCTAssertEqual(loaded.count, 2)
        XCTAssertEqual(loaded.first(where: { $0.id == first.id })?.days.count, 3)
    }
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

    func testRemoteHydrationScopesAccountsAndPreservesDeviceDraftsAndTombstones() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = try TripRepository(url: folder.appendingPathComponent("sync.sqlite"))
        let localDraft = try TripDocument.create(draft: .init(name: "기기 초안", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        try repository.save(localDraft)

        var collidingPayload = localDraft.raw
        collidingPayload["name"] = "서버 여행"
        let remoteTrip = try TripDocument(data: JSONSerialization.data(withJSONObject: collidingPayload))
        let accountTrip = try TripDocument.create(draft: .init(name: "계정 여행", country: "대만", startDate: "2026-11-10", endDate: "2026-11-12"))
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let tripRecord = SyncRecord(userID: "account-a", recordType: .trip, recordID: remoteTrip.id,
                                    payload: remoteTrip.raw, revision: 1, updatedAt: now, deletedAt: nil)
        let accountRecord = SyncRecord(userID: "account-a", recordType: .trip, recordID: accountTrip.id,
                                       payload: accountTrip.raw, revision: 1, updatedAt: now, deletedAt: nil)

        let hydration = try repository.applyRemoteRecords([tripRecord, accountRecord], userID: "account-a")

        XCTAssertEqual(hydration.retainedLocalDraftCount, 1)
        XCTAssertEqual(Set(try repository.list(userID: "account-a").map(\.id)), Set([localDraft.id, accountTrip.id]))
        XCTAssertEqual(try repository.list(userID: "account-a").first(where: { $0.id == localDraft.id })?.name, "기기 초안")
        XCTAssertEqual(try repository.list(userID: "account-b").map(\.id), [localDraft.id])
        XCTAssertTrue(try SyncOutboxRepository(url: folder.appendingPathComponent("sync.sqlite")).pending(userID: "account-a").isEmpty)

        let tripTombstone = SyncRecord(userID: "account-a", recordType: .trip, recordID: accountTrip.id,
                                       payload: nil, revision: 2, updatedAt: now.addingTimeInterval(1), deletedAt: now)
        let draftTombstone = SyncRecord(userID: "account-a", recordType: .trip, recordID: localDraft.id,
                                        payload: nil, revision: 2, updatedAt: now.addingTimeInterval(1), deletedAt: now)
        _ = try repository.applyRemoteRecords([tripTombstone, draftTombstone], userID: "account-a")
        XCTAssertEqual(try repository.list(userID: "account-a").map(\.id), [localDraft.id])
        XCTAssertEqual(try repository.list(userID: "account-a").first?.name, "기기 초안")
    }

    func testRemoteHydrationDoesNotReplaceAQueuedLocalEdit() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = try TripRepository(url: folder.appendingPathComponent("sync.sqlite"))
        let original = try TripDocument.create(draft: .init(name: "원격 기준", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        try repository.save(original, syncContext: .init(userID: "account-a"))
        let localEdit = try original.edited(draft: .init(name: "오프라인 수정", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        try repository.save(localEdit, syncContext: .init(userID: "account-a"))
        var serverPayload = original.raw
        serverPayload["name"] = "웹에서 수정"
        let serverVersion = try TripDocument(data: JSONSerialization.data(withJSONObject: serverPayload))
        let record = SyncRecord(userID: "account-a", recordType: .trip, recordID: original.id,
                                payload: serverVersion.raw, revision: 1,
                                updatedAt: Date(timeIntervalSince1970: 1_800_000_001), deletedAt: nil)

        let hydration = try repository.applyRemoteRecords([record], userID: "account-a")

        XCTAssertEqual(hydration.retainedPendingEditCount, 1)
        XCTAssertEqual(try repository.list(userID: "account-a").first?.name, "오프라인 수정")
        XCTAssertEqual(try SyncOutboxRepository(url: folder.appendingPathComponent("sync.sqlite")).pending(userID: "account-a").count, 2)
    }

    func testRemoteHydrationKeepsLocalVersionUntilConflictIsExplicitlyResolved() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("sync.sqlite")
        let repository = try TripRepository(url: url)
        let original = try TripDocument.create(draft: .init(name: "원격 기준", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        let initialRecord = SyncRecord(userID: "account-a", recordType: .trip, recordID: original.id,
                                       payload: original.raw, revision: 1,
                                       updatedAt: Date(timeIntervalSince1970: 1_800_000_000), deletedAt: nil)
        _ = try repository.applyRemoteRecords([initialRecord], userID: "account-a")
        let localEdit = try original.edited(draft: .init(name: "로컬 변경", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        try repository.save(localEdit, syncContext: .init(userID: "account-a"))
        let outbox = try SyncOutboxRepository(url: url)
        let operation = try XCTUnwrap(outbox.pending(userID: "account-a").first)
        var serverPayload = original.raw
        serverPayload["name"] = "서버 변경"
        let serverVersion = try TripDocument(data: JSONSerialization.data(withJSONObject: serverPayload))
        let remote = SyncRecord(userID: "account-a", recordType: .trip, recordID: original.id,
                                payload: serverVersion.raw, revision: 2,
                                updatedAt: Date(timeIntervalSince1970: 1_800_000_002), deletedAt: nil)
        try outbox.saveConflict(operationID: operation.operationID, serverRecord: remote)

        let hydration = try repository.applyRemoteRecords([remote], userID: "account-a")

        XCTAssertEqual(hydration.retainedConflictCount, 1)
        XCTAssertEqual(try repository.list(userID: "account-a").first?.name, "로컬 변경")
        XCTAssertEqual(try outbox.conflicts(userID: "account-a").count, 1)

        try repository.resolveConflict(id: operation.operationID, choice: .acceptServer, userID: "account-a")
        XCTAssertEqual(try repository.list(userID: "account-a").first?.name, "서버 변경")
        XCTAssertTrue(try outbox.conflicts(userID: "account-a").isEmpty)
    }

    func testRemoteSavedPlaceHydrationIsAccountScopedAndDoesNotQueueUpload() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = try TripRepository(url: folder.appendingPathComponent("sync.sqlite"))
        let placeID = UUID().uuidString
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let record = SyncRecord(userID: "account-a", recordType: .savedPlace, recordID: placeID,
                                payload: ["id": placeID, "name": "웹 저장 장소", "placeId": "place-123", "loc": "도쿄", "createdAt": 1_800_000_000_000, "updatedAt": 1_800_000_000_100],
                                revision: 1, updatedAt: now, deletedAt: nil)

        _ = try repository.applyRemoteRecords([record], userID: "account-a")

        let saved = try XCTUnwrap(repository.listSavedPlaces(userID: "account-a").first)
        XCTAssertEqual(saved.id, placeID)
        XCTAssertEqual(saved.payload["name"] as? String, "웹 저장 장소")
        XCTAssertTrue(try repository.listSavedPlaces(userID: "account-b").isEmpty)
        XCTAssertTrue(try SyncOutboxRepository(url: folder.appendingPathComponent("sync.sqlite")).pending(userID: "account-a").isEmpty)

        let tombstone = SyncRecord(userID: "account-a", recordType: .savedPlace, recordID: placeID,
                                  payload: nil, revision: 2, updatedAt: now.addingTimeInterval(1), deletedAt: now)
        _ = try repository.applyRemoteRecords([tombstone], userID: "account-a")
        XCTAssertTrue(try repository.listSavedPlaces(userID: "account-a").isEmpty)
    }

    func testPendingSyncCountIsScopedToAccount() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let repository = try TripRepository(url: folder.appendingPathComponent("sync.sqlite"))
        let accountATrip = try TripDocument.create(draft: .init(name: "계정 A", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11"))
        let accountBTrip = try TripDocument.create(draft: .init(name: "계정 B", country: "대만", startDate: "2026-11-10", endDate: "2026-11-11"))

        try repository.save(accountATrip, syncContext: .init(userID: "account-a"))
        try repository.save(accountBTrip, syncContext: .init(userID: "account-b"))

        XCTAssertEqual(try repository.pendingSyncCount(userID: "account-a"), 1)
        XCTAssertEqual(try repository.pendingSyncCount(userID: "account-b"), 1)
        XCTAssertEqual(try repository.pendingSyncCount(userID: "account-c"), 0)
    }
}
