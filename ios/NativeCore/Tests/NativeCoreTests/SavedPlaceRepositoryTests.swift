import XCTest
import CoreData
import SQLite3
@testable import NativeCore

final class SavedPlaceRepositoryTests: XCTestCase {
    func storeURL() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("SavedPlaceTests-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return dir.appendingPathComponent("trips.sqlite")
    }
    func testSaveReopenDeduplicateCopyAndDeleteWithoutCascade() throws {
        let url = try storeURL(), trip = try TripDocument(data: contractBytes("map-places.json"))
        let selection = PlaceSelection(reference: .google(placeID: "place-a"))
        let draft = PlaceDraft(name: "集合場所", memo: "사용자 메모")
        let id = UUID().uuidString, copyID = UUID().uuidString
        do {
            let repo = try TripRepository(url: url); try repo.save(trip)
            let first = try repo.savePlace(selection: selection, draft: draft, id: id)
            let again = try repo.savePlace(selection: selection, draft: .init(name:"다른 입력",memo:"덮어쓰면 안됨"), id: UUID().uuidString)
            XCTAssertEqual(first.id,again.id); XCTAssertEqual(again.draft.memo,"사용자 메모")
            _ = try repo.savePlace(selection: .init(reference:.google(placeID:"place-b")), draft: draft, id: UUID().uuidString)
            XCTAssertEqual(try repo.listSavedPlaces().count,2)
            let attached = try repo.applySchedule(tripID:trip.id,change:.addPlace(section:.day(2),id:copyID,draft:first.draft,selection:first.selection))
            let item = try TripSchedule.items(in:.day(2),trip:attached).last!
            XCTAssertEqual(item["placeId"] as? String,"place-a"); XCTAssertNil(item["lat"]); XCTAssertNil(item["lng"])
            XCTAssertEqual(item["name"] as? String,"集合場所")
            let retried = try repo.applySchedule(tripID:trip.id,change:.addPlace(section:.day(2),id:copyID,draft:first.draft,selection:first.selection))
            XCTAssertEqual(try attached.encoded(),try retried.encoded())
            XCTAssertThrowsError(try repo.applySchedule(tripID:trip.id,change:.addPlace(section:.day(2),id:copyID,draft:.init(name:"conflict"),selection:first.selection)))
            try repo.deleteSavedPlace(id:id)
            XCTAssertEqual(try repo.listSavedPlaces().count,1)
            XCTAssertEqual(try repo.list().first?.encoded(),try attached.encoded())
        }
        let reopened = try TripRepository(url:url)
        XCTAssertEqual(try reopened.listSavedPlaces().count,1)
        XCTAssertEqual(try TripSchedule.items(in:.day(2),trip:reopened.list()[0]).last?["id"] as? String,copyID)
        XCTAssertEqual(try jsonValue(reopened.list()[0].raw["expenses"]!),try jsonValue(trip.raw["expenses"]!))
    }
    func testManualAndExistingCopyPreserveOnlyDurableInput() throws {
        let repo = try TripRepository(url:storeURL()), trip = try TripDocument(data:contractBytes("map-places.json"))
        let item = try TripSchedule.items(in:.day(1),trip:trip)[0]
        let selection = PlaceSelection(reference:.existing,originalItem:item,sourceTripID:trip.id,sourceItemKey:.integer(1))
        let saved = try repo.savePlace(selection:selection,draft:PlaceDraft(item:item),id:UUID().uuidString)
        XCTAssertEqual(try jsonValue(saved.payload["futureField"]!),try jsonValue(item["futureField"]!))
        XCTAssertNotEqual(saved.payload["id"] as? String,"1")
        let copied = try TripSchedule.apply(.addPlace(section:.reserve,id:UUID().uuidString,draft:saved.draft,selection:saved.selection),to:trip)
        XCTAssertEqual(try jsonValue(TripSchedule.items(in:.reserve,trip:copied).last!["futureField"]!),try jsonValue(item["futureField"]!))
        let manual = try repo.savePlace(selection:.init(reference:.manual(Coordinate(latitude:0,longitude:0))),draft:.init(name:"직접"),id:UUID().uuidString)
        XCTAssertEqual(Coordinate.from(item:manual.payload),try Coordinate(latitude:0,longitude:0))
        let empty = try repo.savePlace(selection:.init(reference:.unlocated),draft:.init(name:"메모만"),id:UUID().uuidString)
        XCTAssertNil(empty.payload["lat"]); XCTAssertNil(empty.payload["lng"])
        XCTAssertThrowsError(try repo.savePlace(selection:.init(reference:.unlocated),draft:.init(name:""),id:UUID().uuidString))
        XCTAssertThrowsError(try repo.savePlace(selection:.init(reference:.google(placeID:"new")),draft:.init(name:"다름"),id:saved.id))
        XCTAssertEqual(try repo.listSavedPlaces().count,3)
    }
    func testStage2MigrationPreservesTripsAndAllReceiptFields() throws {
        let url = try storeURL(), candidate = try TripBackup.decode(contractBytes("legacy-trip-backup.json"))
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel:TripStoreModel.stage2)
        let store = try coordinator.addPersistentStore(ofType:NSSQLiteStoreType,configurationName:nil,at:url,options:nil)
        let context = NSManagedObjectContext(concurrencyType:.privateQueueConcurrencyType); context.persistentStoreCoordinator=coordinator
        try context.performAndWait {
            let row=NSEntityDescription.insertNewObject(forEntityName:"TripRecord",into:context)
            row.setValue(candidate.trip.id,forKey:"id"); row.setValue(try candidate.trip.encoded(),forKey:"payload"); row.setValue(candidate.trip.updatedAt,forKey:"updatedAt")
            let receipt=NSEntityDescription.insertNewObject(forEntityName:"ImportReceipt",into:context)
            receipt.setValue(candidate.sourceHash,forKey:"sourceHash"); receipt.setValue(candidate.sourceBytes,forKey:"sourceBytes")
            receipt.setValue(candidate.trip.id,forKey:"targetID"); receipt.setValue(try jsonValue(["old-target"]),forKey:"previousTargetIDs"); receipt.setValue(123.0,forKey:"importedAt")
            try context.save()
        }
        try coordinator.remove(store)
        let repo=try TripRepository(url:url)
        XCTAssertEqual(try repo.list().first?.encoded(),try candidate.trip.encoded())
        XCTAssertEqual(try repo.receiptSource(hash:candidate.sourceHash),candidate.sourceBytes)
        XCTAssertEqual(try repo.previousImportTargets(hash:candidate.sourceHash),["old-target"])
        XCTAssertEqual(try repo.prepareImport(candidate).disposition,.alreadyImported)
        XCTAssertTrue(try repo.listSavedPlaces().isEmpty)
        XCTAssertTrue(FileManager.default.fileExists(atPath:url.path+".pre-import.sqlite"))
        _ = try repo.savePlace(selection:.init(reference:.unlocated),draft:.init(name:"이전 이후"),id:UUID().uuidString)
        XCTAssertEqual(try TripRepository(url:url).listSavedPlaces().count,1)
    }
    func testFailedDatabaseWriteRollsBackOnlyNewPlace() throws {
        let url=try storeURL(), repo=try TripRepository(url:url), trip=try TripDocument(data:contractBytes("map-places.json"))
        try repo.save(trip)
        var sqlite: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path,&sqlite),SQLITE_OK); defer { sqlite3_close(sqlite) }
        XCTAssertEqual(sqlite3_exec(sqlite,"CREATE TRIGGER reject_saved BEFORE INSERT ON ZSAVEDPLACERECORD BEGIN SELECT RAISE(ABORT, 'injected'); END",nil,nil,nil),SQLITE_OK)
        XCTAssertThrowsError(try repo.savePlace(selection:.init(reference:.unlocated),draft:.init(name:"실패"),id:UUID().uuidString))
        XCTAssertTrue(try repo.listSavedPlaces().isEmpty)
        XCTAssertEqual(try repo.list().first?.encoded(),try trip.encoded())
        XCTAssertEqual(sqlite3_exec(sqlite,"DROP TRIGGER reject_saved",nil,nil,nil),SQLITE_OK)
        _ = try repo.savePlace(selection:.init(reference:.unlocated),draft:.init(name:"재시도"),id:UUID().uuidString)
        XCTAssertEqual(try repo.listSavedPlaces().count,1)
    }
}
