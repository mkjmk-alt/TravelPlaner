import XCTest
import CoreData
import SQLite3
@testable import NativeCore

final class SyncOutboxTests: XCTestCase {
    private func temporaryStore() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("SyncOutboxTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir.appendingPathComponent("trips.sqlite")
    }

    private func operation(
        id: UUID = UUID(),
        userID: String = "account-a",
        recordID: String = "trip-legacy-id",
        payload: [String: Any] = ["id": "trip-legacy-id", "futureField": "keep"]
    ) throws -> SyncOperation {
        try SyncOperation(
            operationID: id,
            userID: userID,
            recordType: .trip,
            recordID: recordID,
            expectedRevision: 0,
            payload: payload,
            deletedAt: nil
        )
    }

    func testOutboxPersistsIdenticalOperationBodyAndIsolatesAccounts() throws {
        let url = try temporaryStore()
        let operationID = UUID()
        let original = try operation(id: operationID)
        do {
            let repository = try TripRepository(url: url)
            let outbox: SyncOutboxRepository = repository
            try outbox.enqueue(original)
            try outbox.enqueue(original)

            XCTAssertEqual(try outbox.pending(userID: "account-a", limit: 10).map(\.operationID), [operationID])
            XCTAssertTrue(try outbox.pending(userID: "account-b", limit: 10).isEmpty)
            XCTAssertThrowsError(try outbox.enqueue(operation(id: operationID, payload: ["id": "trip-legacy-id", "futureField": "changed"])))
        }

        let reopened: SyncOutboxRepository = try TripRepository(url: url)
        let pending = try reopened.pending(userID: "account-a", limit: 10)
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].operationID, operationID)
        XCTAssertEqual(pending[0].recordID, "trip-legacy-id")
        XCTAssertEqual(pending[0].expectedRevision, 0)
        XCTAssertEqual(pending[0].payload?["futureField"] as? String, "keep")
    }

    func testAppliedRemoteTombstonePersistsAndDoesNotCreateOutboxWork() throws {
        let url = try temporaryStore()
        let deletedAt = Date(timeIntervalSince1970: 1_791_900_000)
        let record = try SyncRecord(
            userID: "account-a",
            recordType: .trip,
            recordID: "trip-deleted-id",
            payload: ["id": "trip-deleted-id", "name": "삭제된 여행"],
            revision: 8,
            updatedAt: deletedAt,
            deletedAt: deletedAt
        )
        do {
            let repository = try TripRepository(url: url)
            let stateStore: SyncRecordStateStore = repository
            try stateStore.applyRemote(record)
            XCTAssertTrue(try repository.pending(userID: "account-a", limit: 10).isEmpty)
            XCTAssertEqual(try stateStore.recordState(userID: "account-a", recordType: .trip, recordID: "trip-deleted-id")?.revision, 8)
        }

        let reopened: SyncRecordStateStore = try TripRepository(url: url)
        let tombstone = try XCTUnwrap(reopened.recordState(userID: "account-a", recordType: .trip, recordID: "trip-deleted-id"))
        XCTAssertEqual(tombstone.revision, 8)
        XCTAssertEqual(tombstone.deletedAt, deletedAt)
        XCTAssertEqual(tombstone.payload?["name"] as? String, "삭제된 여행")
    }

    func testLocalDraftEditedWhileSignedInIsNotSilentlyClaimedByAccount() throws {
        let repository = try TripRepository(url: temporaryStore())
        let draft = try TripDocument.create(draft: .init(name: "기기 초안", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10"))
        try repository.save(draft)
        try repository.save(draft.edited(draft: .init(name: "계정 로그인 후 수정", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")), context: SyncWriteContext(userID: "account-a"))

        XCTAssertTrue(try repository.pending(userID: "account-a", limit: 10).isEmpty)
        XCTAssertEqual(try repository.list(context: SyncWriteContext(userID: "account-a")).first?.name, "계정 로그인 후 수정")
        XCTAssertTrue(try repository.list(context: .local).isEmpty == false)
    }

    func testAuthenticatedTripWriteAndOutboxEntryCommitTogether() throws {
        let url = try temporaryStore()
        let trip = try TripDocument.create(draft: .init(name: "계정 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10"))
        let repository = try TripRepository(url: url)
        var database: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path, &database), SQLITE_OK)
        defer { sqlite3_close(database) }
        XCTAssertEqual(sqlite3_exec(database, "CREATE TRIGGER reject_sync_outbox BEFORE INSERT ON ZSYNCOUTBOXRECORD BEGIN SELECT RAISE(ABORT, 'injected outbox failure'); END", nil, nil, nil), SQLITE_OK)

        XCTAssertThrowsError(try repository.save(trip, context: SyncWriteContext(userID: "account-a")))
        XCTAssertTrue(try repository.list(context: SyncWriteContext(userID: "account-a")).isEmpty)
        XCTAssertTrue(try repository.pending(userID: "account-a", limit: 10).isEmpty)
    }

    func testAccountOwnedRowsAreHiddenAndCannotBeEditedFromAnotherAccount() throws {
        let repository = try TripRepository(url: temporaryStore())
        let trip = try TripDocument.create(draft: .init(name: "A 계정 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10"))
        try repository.save(trip, context: SyncWriteContext(userID: "account-a"))

        XCTAssertEqual(try repository.list(context: SyncWriteContext(userID: "account-a")).map(\.id), [trip.id])
        XCTAssertTrue(try repository.list(context: SyncWriteContext(userID: "account-b")).isEmpty)
        XCTAssertThrowsError(try repository.save(trip.edited(draft: .init(name: "B가 수정", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")), context: SyncWriteContext(userID: "account-b")))
        XCTAssertEqual(try repository.pending(userID: "account-b", limit: 10).count, 0)
        XCTAssertEqual(try repository.list(context: SyncWriteContext(userID: "account-a")).first?.name, "A 계정 여행")
    }

    func testConflictPreservesBothVersionsAndKeepLocalCreatesNewRevisionedOperation() throws {
        let repository = try TripRepository(url: temporaryStore())
        let outbox: SyncOutboxRepository = repository
        let operation = try operation()
        try outbox.enqueue(operation)
        let serverRecord = try SyncRecord(
            userID: "account-a",
            recordType: .trip,
            recordID: "trip-legacy-id",
            payload: ["id": "trip-legacy-id", "name": "서버 버전"],
            revision: 3,
            updatedAt: Date(timeIntervalSince1970: 1_791_900_000),
            deletedAt: nil
        )

        try outbox.saveConflict(operationID: operation.operationID, serverRecord: serverRecord)
        XCTAssertTrue(try outbox.pending(userID: "account-a", limit: 10).isEmpty)
        let conflict = try XCTUnwrap(outbox.conflicts(userID: "account-a").first)
        XCTAssertEqual(conflict.localOperation.payload?["futureField"] as? String, "keep")
        XCTAssertEqual(conflict.serverRecord.payload?["name"] as? String, "서버 버전")

        try outbox.resolveConflict(id: conflict.id, choice: .keepLocal)
        let retried = try XCTUnwrap(outbox.pending(userID: "account-a", limit: 10).first)
        XCTAssertNotEqual(retried.operationID, operation.operationID)
        XCTAssertEqual(retried.expectedRevision, 3)
        XCTAssertEqual(retried.payload?["futureField"] as? String, "keep")
        XCTAssertTrue(try outbox.conflicts(userID: "account-a").isEmpty)
    }

    func testCurrentModelUpgradePreservesTripPlaceAndImportReceiptBytes() throws {
        let url = try temporaryStore()
        let trip = try TripDocument(data: contractBytes("schedule-edit.json"))
        let tripBytes = try trip.encoded()
        let placeBytes = Data(#"{"id":"place-id","name":"장소","unknown":{"kept":true}}"#.utf8)
        let receiptSource = Data([0, 1, 2, 255, 128, 42])
        let receiptHistory = Data(#"["previous-trip-id"]"#.utf8)
        let sourceHash = "receipt-hash"
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.current)
        let store = try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: nil)
        let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
        context.persistentStoreCoordinator = coordinator
        try context.performAndWait {
            let tripRow = NSEntityDescription.insertNewObject(forEntityName: "TripRecord", into: context)
            tripRow.setValue(trip.id, forKey: "id")
            tripRow.setValue(tripBytes, forKey: "payload")
            tripRow.setValue(trip.updatedAt, forKey: "updatedAt")
            let placeRow = NSEntityDescription.insertNewObject(forEntityName: "SavedPlaceRecord", into: context)
            placeRow.setValue("place-id", forKey: "id")
            placeRow.setValue("place-source", forKey: "sourceKey")
            placeRow.setValue(placeBytes, forKey: "payload")
            placeRow.setValue(123.0, forKey: "createdAt")
            placeRow.setValue(456.0, forKey: "updatedAt")
            let receipt = NSEntityDescription.insertNewObject(forEntityName: "ImportReceipt", into: context)
            receipt.setValue(sourceHash, forKey: "sourceHash")
            receipt.setValue(receiptSource, forKey: "sourceBytes")
            receipt.setValue(trip.id, forKey: "targetID")
            receipt.setValue(receiptHistory, forKey: "previousTargetIDs")
            receipt.setValue(789.0, forKey: "importedAt")
            try context.save()
        }
        try coordinator.remove(store)

        _ = try TripRepository(url: url)
        let migratedCoordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.syncV2)
        let migratedStore = try migratedCoordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: [NSReadOnlyPersistentStoreOption: true])
        defer { try? migratedCoordinator.remove(migratedStore) }
        let migratedContext = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
        migratedContext.persistentStoreCoordinator = migratedCoordinator
        try migratedContext.performAndWait {
            let tripRow = try XCTUnwrap(migratedContext.fetch(NSFetchRequest<NSManagedObject>(entityName: "TripRecord")).first)
            let placeRow = try XCTUnwrap(migratedContext.fetch(NSFetchRequest<NSManagedObject>(entityName: "SavedPlaceRecord")).first)
            let receiptRow = try XCTUnwrap(migratedContext.fetch(NSFetchRequest<NSManagedObject>(entityName: "ImportReceipt")).first)
            XCTAssertEqual(tripRow.value(forKey: "payload") as? Data, tripBytes)
            XCTAssertEqual(placeRow.value(forKey: "payload") as? Data, placeBytes)
            XCTAssertEqual(receiptRow.value(forKey: "sourceBytes") as? Data, receiptSource)
            XCTAssertEqual(receiptRow.value(forKey: "previousTargetIDs") as? Data, receiptHistory)
            XCTAssertNil(tripRow.value(forKey: "ownerUserID"))
            XCTAssertNil(placeRow.value(forKey: "ownerUserID"))
        }
    }
}
