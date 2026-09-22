import XCTest
@testable import NativeCore

final class TripMapProjectionTests: XCTestCase {
    func fixture() throws -> TripDocument { try TripDocument(data: contractBytes("map-places.json")) }
    func testStableTypedKeysAndUnchangedInput() throws {
        let trip = try fixture(), bytes = try trip.encoded()
        let a = TripMapProjection.make(trip: trip, saved: [], resolved: [:])
        let expected = try JSONSerialization.jsonObject(with: contractBytes("map-expected.json")) as! [String: Any]
        XCTAssertEqual(a.markers.count, expected["markerCount"] as? Int)
        XCTAssertEqual(a.unlocatedItemCount, expected["unlocatedItemCount"] as? Int)
        XCTAssertEqual(Set(a.markers.map(\.key)).count, 6)
        XCTAssertEqual(a.markers.filter { $0.label == "같은 장소" }.count, 2)
        XCTAssertTrue(a.markers.contains { $0.coordinate == (try? Coordinate(latitude: 0, longitude: 0)) })
        XCTAssertEqual(a.markers.first { $0.itemKey == .string("1") }?.coordinate.latitude, 35.123456789)
        let moved = try TripSchedule.apply(.move(section: .day(1), key: .integer(1), to: .reserve), to: trip)
        let b = TripMapProjection.make(trip: moved, saved: [], resolved: [:])
        XCTAssertEqual(a.markers.first { $0.itemKey == .integer(1) }?.key, b.markers.first { $0.itemKey == .integer(1) }?.key)
        let edited = try TripSchedule.apply(.edit(section: .day(1), key: .integer(1), draft: .init(name: "같은 장소", memo: "바뀐 메모")), to: trip)
        XCTAssertEqual(a.markers, TripMapProjection.make(trip: edited, saved: [], resolved: [:]).markers)
        XCTAssertEqual(try trip.encoded(), bytes)
    }
    func testRoutesBreakAtMissingLocationsAndNeverCrossDaysOrReserve() throws {
        let p = TripMapProjection.make(trip: try fixture(), saved: [], resolved: [:])
        XCTAssertEqual(p.routes.map(\.day), [1, 1])
        XCTAssertEqual(p.routes.map { $0.markers.compactMap { $0.itemKey?.token } }, [["n:1","s:1"],["s:east","s:west"]])
    }
    func testDatelineBoundsChooseShortArc() throws {
        let bounds = MapBounds.fit([try Coordinate(latitude: 10, longitude: 179.9), try Coordinate(latitude: 11, longitude: -179.9)])
        XCTAssertEqual(bounds?.west ?? 0, 179.9, accuracy: 0.000001)
        XCTAssertEqual(bounds?.east ?? 0, -179.9, accuracy: 0.000001)
        XCTAssertEqual(bounds?.longitudeSpan ?? 0, 0.2, accuracy: 0.000001)
        XCTAssertNil(MapBounds.fit([]))
        XCTAssertEqual(MapBounds.fit([try Coordinate(latitude: 0, longitude: 0)])?.longitudeSpan, 0)
    }
    func testCoordinateRejectsInvalidAndNonNumericScalars() throws {
        for (lat, lng) in [(91.0,0.0), (0,181), (Double.nan,1), (1,Double.infinity)] {
            XCTAssertThrowsError(try Coordinate(latitude: lat, longitude: lng))
        }
        for value: Any in [true, "35", "NaN", NSNull()] { XCTAssertNil(Coordinate.from(item: ["lat":value,"lng":1])) }
        XCTAssertNotNil(try Coordinate(latitude: -90, longitude: -180))
    }
    func testGoogleReferenceExpiryNeverUsesDurableCoordinates() throws {
        let now = Date(timeIntervalSince1970: 1000), coordinate = try Coordinate(latitude: 37, longitude: 127)
        let row = SavedPlaceDocument(id: "favorite", sourceKey: "google:Place-A", payload: ["name":"내 장소","placeId":"Place-A","nativePlaceSource":"google","lat":1,"lng":2], createdAt: 1, updatedAt: 1)
        let result = ResolvedPlace(placeID: "Place-A", coordinate: coordinate, displayName: "Google name", address: "Google address", attribution: [], fetchedAt: now)
        let fresh = TripMapProjection.make(trip: nil, saved: [row], resolved: ["Place-A":result], now: now)
        XCTAssertEqual(fresh.markers.first?.coordinate, coordinate)
        XCTAssertEqual(fresh.markers.first?.label, "내 장소")
        XCTAssertEqual(fresh.markers.first?.favoriteID, "favorite")
        let expired = TripMapProjection.make(trip: nil, saved: [row], resolved: ["Place-A":result], now: now.addingTimeInterval(300))
        XCTAssertTrue(expired.markers.isEmpty); XCTAssertEqual(expired.unlocatedItemCount, 1)
        XCTAssertTrue(TripMapProjection.make(trip: nil, saved: [row], resolved: [:], now: now).markers.isEmpty)
        XCTAssertThrowsError(try PlaceSelection(reference: .google(placeID: "  ")).validated())
        XCTAssertThrowsError(try PlaceSelection(reference: .google(placeID: String(repeating:"x",count:1025))).validated())
        XCTAssertEqual(try PlaceSelection(reference: .google(placeID: " Place-A ")).validated().reference, .google(placeID:"Place-A"))
        XCTAssertThrowsError(try PlaceSelection(reference: .existing).validated())
    }
}
