import Foundation
import XCTest
import SQLite3
@testable import NativeCore

final class SyncOutboxTests: XCTestCase {
    private func makeStore() throws -> (URL, SyncOutboxRepository) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("SyncOutbox-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("trips.sqlite")
        return (url, try SyncOutboxRepository(url: url))
    }

    private func operation(
        id: UUID = UUID(),
        userID: String = "account-a",
        recordID: String = "trip-a",
        revision: Int64 = 0,
        payload: [String: Any]? = ["id": "trip-a", "futureField": "preserve"],
        deletedAt: Date? = nil
    ) -> SyncOperation {
        SyncOperation(
            operationID: id,
            userID: userID,
            recordType: .trip,
            recordID: recordID,
            expectedRevision: revision,
            payload: payload,
            deletedAt: deletedAt
        )
    }

    func testPendingOperationsAreDurableIdempotentAndAccountScoped() throws {
        let (url, store) = try makeStore()
        let operationID = UUID()
        let first = operation(id: operationID)
        try store.enqueue(first)
        try store.enqueue(first)
        XCTAssertThrowsError(try store.enqueue(operation(id: operationID, payload: ["id": "trip-a", "futureField": "changed"])))
        try store.enqueue(operation(userID: "account-b", recordID: "trip-b"))

        let reopened = try SyncOutboxRepository(url: url)
        let accountA = try reopened.pending(userID: "account-a")
        XCTAssertEqual(accountA.count, 1)
        XCTAssertEqual(accountA.first?.operationID, operationID)
        XCTAssertEqual(accountA.first?.expectedRevision, 0)
        XCTAssertEqual(accountA.first?.payload?["futureField"] as? String, "preserve")
        XCTAssertEqual(try reopened.pending(userID: "account-b").map(\.recordID), ["trip-b"])
    }

    func testAppliedOperationAdvancesStateAndIsNotReenqueuedByRemoteApply() throws {
        let (url, store) = try makeStore()
        let operationID = UUID()
        try store.enqueue(operation(id: operationID))

        try store.markApplied(operationID: operationID, revision: 1)

        XCTAssertTrue(try store.pending(userID: "account-a").isEmpty)
        let states = try SyncRecordStateStore(url: url)
        XCTAssertEqual(try states.record(userID: "account-a", recordType: .trip, recordID: "trip-a")?.revision, 1)
        try states.applyRemote(SyncRecord(
            userID: "account-a",
            recordType: .savedPlace,
            recordID: "place-deleted",
            payload: nil,
            revision: 4,
            updatedAt: Date(timeIntervalSince1970: 1_791_907_200),
            deletedAt: Date(timeIntervalSince1970: 1_791_907_200)
        ))
        XCTAssertTrue(try SyncOutboxRepository(url: url).pending(userID: "account-a").isEmpty)
        XCTAssertEqual(try states.record(userID: "account-a", recordType: .savedPlace, recordID: "place-deleted")?.revision, 4)
    }

    func testConflictPreservesBothVersionsAndRequiresExplicitResolution() throws {
        let (_, store) = try makeStore()
        let operationID = UUID()
        try store.enqueue(operation(id: operationID, revision: 2))
        let server = SyncRecord(
            userID: "account-a",
            recordType: .trip,
            recordID: "trip-a",
            payload: ["id": "trip-a", "name": "server"],
            revision: 3,
            updatedAt: Date(),
            deletedAt: nil
        )

        try store.saveConflict(operationID: operationID, serverRecord: server)

        let conflict = try XCTUnwrap(store.conflicts(userID: "account-a").first)
        XCTAssertEqual(conflict.operation.operationID, operationID)
        XCTAssertEqual(conflict.operation.payload?["futureField"] as? String, "preserve")
        XCTAssertEqual(conflict.serverRecord.payload?["name"] as? String, "server")
        XCTAssertTrue(try store.pending(userID: "account-a").isEmpty)

        try store.resolveConflict(id: conflict.id, choice: .keepLocal)

        let retry = try XCTUnwrap(store.pending(userID: "account-a").first)
        XCTAssertNotEqual(retry.operationID, operationID, "충돌 해결은 이전 idempotency key를 본문 변경에 재사용하면 안 됩니다")
        XCTAssertEqual(retry.expectedRevision, 3)
        XCTAssertEqual(retry.payload?["futureField"] as? String, "preserve")
        XCTAssertTrue(try store.conflicts(userID: "account-a").isEmpty)
    }

    func testAcceptServerResolutionStoresServerStateWithoutCreatingAnOperation() throws {
        let (url, store) = try makeStore()
        let operationID = UUID()
        try store.enqueue(operation(id: operationID))
        let server = SyncRecord(userID: "account-a", recordType: .trip, recordID: "trip-a",
                                payload: ["id": "trip-a", "name": "server"], revision: 5,
                                updatedAt: Date(), deletedAt: nil)
        try store.saveConflict(operationID: operationID, serverRecord: server)
        let conflict = try XCTUnwrap(store.conflicts(userID: "account-a").first)
        try store.resolveConflict(id: conflict.id, choice: .acceptServer)

        XCTAssertTrue(try store.pending(userID: "account-a").isEmpty)
        XCTAssertEqual(try SyncRecordStateStore(url: url).record(userID: "account-a", recordType: .trip, recordID: "trip-a")?.payload?["name"] as? String, "server")
    }

    func testUnresolvedConflictPreventsFurtherAccountOwnedEdits() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("SyncConflictGuard-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("trips.sqlite")
        let repository = try TripRepository(url: url)
        let context = SyncWriteContext(userID: "account-a")
        let trip = try TripDocument.create(draft: .init(name: "Conflict", country: "KR", startDate: "2026-11-01", endDate: "2026-11-01"))
        let originalBytes = try trip.encoded()
        try repository.save(trip, syncContext: context)
        let outbox = try SyncOutboxRepository(url: url)
        let operation = try XCTUnwrap(outbox.pending(userID: "account-a").first)
        try outbox.saveConflict(operationID: operation.operationID, serverRecord: SyncRecord(
            userID: "account-a", recordType: .trip, recordID: trip.id,
            payload: ["id": trip.id, "name": "server"], revision: 1, updatedAt: Date(), deletedAt: nil
        ))

        XCTAssertThrowsError(try repository.updateBudgetSettings(tripID: trip.id, values: ["limitKRW": 1000], syncContext: context))
        XCTAssertEqual(try repository.list().first?.encoded(), originalBytes)
    }

    func testOlderRemotePageCannotReplaceNewerTombstone() throws {
        let (url, _) = try makeStore()
        let states = try SyncRecordStateStore(url: url)
        let deletedAt = Date(timeIntervalSince1970: 1_791_907_200)
        try states.applyRemote(SyncRecord(userID: "account-a", recordType: .trip, recordID: "trip-a",
                                          payload: nil, revision: 4, updatedAt: deletedAt, deletedAt: deletedAt))
        try states.applyRemote(SyncRecord(userID: "account-a", recordType: .trip, recordID: "trip-a",
                                          payload: ["id": "trip-a"], revision: 3,
                                          updatedAt: deletedAt.addingTimeInterval(-1), deletedAt: nil))
        let current = try XCTUnwrap(states.record(userID: "account-a", recordType: .trip, recordID: "trip-a"))
        XCTAssertEqual(current.revision, 4)
        XCTAssertNotNil(current.deletedAt)
        XCTAssertNil(current.payload)
    }

    func testDomainWriteAndOutboxInsertRollbackTogether() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("SyncAtomic-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("trips.sqlite")
        let repository = try TripRepository(url: url)
        let trip = try TripDocument.create(draft: .init(name: "Atomic", country: "KR", startDate: "2026-11-01", endDate: "2026-11-01"))
        var sqlite: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path, &sqlite), SQLITE_OK)
        defer { sqlite3_close(sqlite) }
        XCTAssertEqual(sqlite3_exec(sqlite, "CREATE TRIGGER reject_sync BEFORE INSERT ON ZSYNCOUTBOXRECORD BEGIN SELECT RAISE(ABORT, 'injected'); END", nil, nil, nil), SQLITE_OK)

        XCTAssertThrowsError(try repository.save(trip, syncContext: .init(userID: "account-a")))
        XCTAssertTrue(try repository.list().isEmpty, "local record must roll back with failed outbox insert")
        XCTAssertTrue(try SyncOutboxRepository(url: url).pending(userID: "account-a").isEmpty)
        XCTAssertEqual(sqlite3_exec(sqlite, "DROP TRIGGER reject_sync", nil, nil, nil), SQLITE_OK)
        try repository.save(trip, syncContext: .init(userID: "account-a"))
        XCTAssertEqual(try repository.list().map(\.id), [trip.id])
        XCTAssertEqual(try SyncOutboxRepository(url: url).pending(userID: "account-a").count, 1)
    }

    func testRepositoryQueuesEveryAccountOwnedMutationAndKeepsDeviceDraftLocal() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("SyncRepository-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("trips.sqlite")
        let repository = try TripRepository(url: url)
        let sync = SyncWriteContext(userID: "account-a")
        let trip = try TripDocument.create(draft: .init(name: "Sync trip", country: "JP", startDate: "2026-11-01", endDate: "2026-11-01"))

        try repository.save(trip, syncContext: sync)
        _ = try repository.applySchedule(tripID: trip.id, change: .add(section: .day(1), id: UUID().uuidString, draft: .init(name: "Station")), syncContext: sync)
        _ = try repository.upsertExpense(tripID: trip.id, expenseID: "expense-a", fields: ["amount": 100], syncContext: sync)
        try repository.deleteExpense(tripID: trip.id, expenseID: "expense-a", syncContext: sync)
        _ = try repository.updateBudgetSettings(tripID: trip.id, values: ["limitKRW": 2000], syncContext: sync)
        _ = try repository.updateSettlementParticipants(tripID: trip.id, participants: [["id": "self", "name": "나"]], syncContext: sync)
        _ = try repository.applyMemoryChange(tripID: trip.id, change: .addJournal(operationID: "journal-op", entry: ["id": "journal-a", "title": "일기", "body": "기록"]), syncContext: sync)
        XCTAssertThrowsError(try repository.save(trip, syncContext: .init(userID: "account-b")))
        XCTAssertThrowsError(try repository.save(trip, syncContext: .device), "로그아웃 후 계정 소유 문서를 변경하면 안 됩니다")
        let placeSelection = PlaceSelection(reference: .google(placeID: "shared-place"))
        let placeDraft = PlaceDraft(name: "Saved place")
        let place = try repository.savePlace(selection: placeSelection, draft: placeDraft, id: UUID().uuidString, syncContext: sync)
        let accountBPlace = try repository.savePlace(selection: placeSelection, draft: placeDraft, id: UUID().uuidString,
                                                     syncContext: .init(userID: "account-b"))
        XCTAssertNotEqual(place.id, accountBPlace.id, "같은 장소도 계정별 문서로 분리되어야 합니다")
        try repository.deleteSavedPlace(id: place.id, syncContext: sync)
        try repository.delete(id: trip.id, syncContext: sync)

        let outbox = try SyncOutboxRepository(url: url)
        let tripOperations = try outbox.pending(userID: "account-a").filter { $0.recordType == .trip && $0.recordID == trip.id }.sorted { $0.expectedRevision < $1.expectedRevision }
        XCTAssertEqual(tripOperations.map(\.expectedRevision), Array(0...7).map(Int64.init))
        XCTAssertNil(tripOperations.last?.payload)
        XCTAssertNotNil(tripOperations.last?.deletedAt)
        let placeOperations = try outbox.pending(userID: "account-a").filter { $0.recordType == .savedPlace && $0.recordID == place.id }.sorted { $0.expectedRevision < $1.expectedRevision }
        XCTAssertEqual(placeOperations.map(\.expectedRevision), [0, 1])
        XCTAssertNil(placeOperations.last?.payload)
        XCTAssertTrue(try outbox.pending(userID: "account-b").contains { $0.recordType == .savedPlace && $0.recordID == accountBPlace.id })

        let deviceDraft = try TripDocument.create(draft: .init(name: "Local only", country: "KR", startDate: "2026-11-02", endDate: "2026-11-02"))
        try repository.save(deviceDraft)
        XCTAssertFalse(try outbox.pending(userID: "account-a").contains { $0.recordID == deviceDraft.id })
        try repository.save(deviceDraft, syncContext: .init(userID: "account-b"))
        XCTAssertFalse(try outbox.pending(userID: "account-b").contains { $0.recordID == deviceDraft.id })
    }

}
