import XCTest
import CoreData
@testable import NativeCore

final class TripImportTests: XCTestCase {
    func temporaryStore() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("TripImportTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir.appendingPathComponent("trips.sqlite")
    }
    func testImportReopenRepeatKeepsLaterEditsAndOriginalReceipt() throws {
        let url = try temporaryStore(); let candidate = try TripBackup.decode(contractBytes("legacy-trip-backup.json"))
        let id: String
        do {
            let repository = try TripRepository(url: url)
            let preview = try repository.prepareImport(candidate)
            XCTAssertEqual(preview.disposition, .newTrip)
            id = try repository.commitImport(preview, decision: .confirmNew).tripID
            try repository.save(candidate.trip.edited(draft: .init(name: "내 수정", country: "", startDate: "2026-10-10", endDate: "2026-10-11")))
        }
        let repository = try TripRepository(url: url)
        let repeatPreview = try repository.prepareImport(candidate)
        XCTAssertEqual(repeatPreview.disposition, .alreadyImported)
        let again = try repository.commitImport(repeatPreview, decision: .confirmNew)
        XCTAssertEqual(again.tripID, id); XCTAssertTrue(again.alreadyImported)
        XCTAssertEqual(try repository.list().count, 1); XCTAssertEqual(try repository.list().first?.name, "내 수정")
        XCTAssertEqual(try repository.receiptSource(hash: candidate.sourceHash), candidate.sourceBytes)
    }
    func testConflictKeepBothAndExplicitRestoreDeleted() throws {
        let repository = try TripRepository(url: temporaryStore())
        let candidate = try TripBackup.decode(contractBytes("schedule-edit.json"))
        try repository.save(candidate.trip.edited(draft: .init(name: "기존 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-11")))
        let preview = try repository.prepareImport(candidate)
        XCTAssertEqual(preview.disposition, .conflict)
        XCTAssertThrowsError(try repository.commitImport(preview, decision: .confirmNew))
        let copy = try repository.commitImport(preview, decision: .keepBoth)
        XCTAssertNotEqual(copy.tripID, candidate.trip.id); XCTAssertEqual(try repository.list().count, 2)
        XCTAssertEqual(try repository.commitImport(repository.prepareImport(candidate), decision: .confirmNew).tripID, copy.tripID)
        try repository.delete(id: copy.tripID)
        let deleted = try repository.prepareImport(candidate)
        XCTAssertEqual(deleted.disposition, .previouslyDeleted)
        XCTAssertThrowsError(try repository.commitImport(deleted, decision: .confirmNew))
        let restored = try repository.commitImport(deleted, decision: .restoreDeleted)
        XCTAssertNotEqual(restored.tripID, copy.tripID); XCTAssertEqual(try repository.list().count, 2)
        XCTAssertEqual(try repository.previousImportTargets(hash: candidate.sourceHash), [copy.tripID])
    }
    func testStalePreviewAndAtomicFailureDoNotPartiallyWrite() throws {
        let repository = try TripRepository(url: temporaryStore()); let candidate = try TripBackup.decode(contractBytes("legacy-trip-backup.json"))
        let old = try repository.prepareImport(candidate)
        try repository.save(candidate.trip)
        XCTAssertThrowsError(try repository.commitImport(old, decision: .confirmNew))
        try repository.delete(id: candidate.trip.id)
        let preview = try repository.prepareImport(candidate)
        repository.beforeReceiptWrite = { throw BackupError.invalid("injected") }
        XCTAssertThrowsError(try repository.commitImport(preview, decision: .confirmNew))
        XCTAssertTrue(try repository.list().isEmpty)
        XCTAssertNil(try repository.receiptSource(hash: candidate.sourceHash))
        repository.beforeReceiptWrite = nil
        XCTAssertTrue(try repository.commitImport(preview, decision: .confirmNew).created)
    }
    func testScheduleUsesFreshRecordAndPersistsAfterReopen() throws {
        let url = try temporaryStore(); let trip = try TripBackup.decode(contractBytes("schedule-edit.json")).trip
        do {
            let repository = try TripRepository(url: url); try repository.save(trip)
            _ = try repository.applySchedule(tripID: trip.id, change: .move(section: .day(1), key: .integer(1), to: .reserve))
            _ = try repository.applySchedule(tripID: trip.id, change: .edit(section: .reserve, key: .integer(1), draft: .init(name: "보존", time: "13:30", memo: "재실행")))
        }
        let restored = try XCTUnwrap(TripRepository(url: url).list().first)
        XCTAssertEqual(try TripSchedule.items(in: .reserve, trip: restored).last?["memo"] as? String, "재실행")
        XCTAssertEqual(try jsonValue(restored.raw["expenses"]!), try jsonValue(trip.raw["expenses"]!))
    }
    func testOriginalCoreDataModelMigrationPreservesPayloadAndRecoveryCopy() throws {
        let url = try temporaryStore(); let trip = try TripDocument(data: contractBytes("schedule-edit.json"))
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: TripStoreModel.original)
        let store = try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil, at: url, options: nil)
        let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType); context.persistentStoreCoordinator = coordinator
        try context.performAndWait {
            let row = NSEntityDescription.insertNewObject(forEntityName: "TripRecord", into: context)
            row.setValue(trip.id, forKey: "id"); row.setValue(try trip.encoded(), forKey: "payload"); row.setValue(trip.updatedAt, forKey: "updatedAt")
            try context.save()
        }
        // Recent writes exist in SQLite WAL before the owning coordinator closes.
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path + "-wal"))
        try coordinator.remove(store)
        let migrated = try TripRepository(url: url)
        XCTAssertEqual(try migrated.list().first?.encoded(), try trip.encoded())
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path + ".pre-import.sqlite"))
        XCTAssertTrue(try migrated.commitImport(migrated.prepareImport(TripBackup.decode(contractBytes("legacy-trip-backup.json"))), decision: .confirmNew).created)
    }
    func testIncompatibleStoreIsNotReset() throws {
        let url = try temporaryStore(); let marker = Data("invalid store preserved".utf8); try marker.write(to: url)
        XCTAssertThrowsError(try TripRepository(url: url)); XCTAssertEqual(try Data(contentsOf: url), marker)
    }
}
