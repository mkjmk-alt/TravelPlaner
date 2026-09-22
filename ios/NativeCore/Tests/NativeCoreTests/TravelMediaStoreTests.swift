import XCTest
@testable import NativeCore

final class TravelMediaStoreTests: XCTestCase {
    func testNewPhotoIsStoredUnderManagedTripDirectoryAndCanBeRemoved() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try TravelMediaStore(root: root)
        let bytes = Data([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01])
        let reference = try store.write(bytes, tripID: "trip-1")
        XCTAssertEqual(try store.read(reference), bytes)
        XCTAssertTrue(store.url(for: reference).path.hasPrefix(root.path))
        try store.remove(reference)
        XCTAssertThrowsError(try store.read(reference))
    }

    func testUnsupportedOrOversizePhotoIsRejectedWithoutWriting() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try TravelMediaStore(root: root)
        XCTAssertThrowsError(try store.write(Data([1,2,3]), tripID: "trip-1"))
        XCTAssertThrowsError(try store.write(Data(repeating: 0, count: TravelMediaStore.maxImageBytes + 1), tripID: "trip-1"))
    }
}
