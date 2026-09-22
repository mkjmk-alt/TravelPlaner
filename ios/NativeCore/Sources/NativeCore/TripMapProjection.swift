import Foundation

public struct MapMarker: Equatable, Identifiable {
    public enum Kind: Equatable { case saved, reserve, day(Int) }
    public let key: String
    public var id: String { key }
    public let coordinate: Coordinate
    public let label: String
    public let kind: Kind
    public let tripID: String?
    public let itemKey: ItemKey?
    public let favoriteID: String?
}
public struct MapRoute {
    public let day: Int
    public let markers: [MapMarker]
}
public struct MapProjection {
    public let markers: [MapMarker]
    public let unlocatedItemCount: Int
    public let routes: [MapRoute]
}
public enum TripMapProjection {
    public static func googlePlaceIDs(trip:TripDocument?,saved:[SavedPlaceDocument])->[String] {
        var items=saved.map(\.payload)
        if let trip { for section in [.reserve] + (1...trip.dayCount).map(ScheduleSection.day) { items += (try? TripSchedule.items(in:section,trip:trip)) ?? [] } }
        return Set(items.compactMap { item -> String? in
            guard item["nativePlaceSource"] as? String == "google",let id=item["placeId"] as? String,
                  (1...1024).contains(id.unicodeScalars.count) else { return nil }
            return id
        }).sorted()
    }
    public static func make(trip: TripDocument?, saved: [SavedPlaceDocument], resolved: [String: ResolvedPlace], now: Date = Date()) -> MapProjection {
        var markers = [MapMarker](), routes = [MapRoute](), missing = 0, seen = Set<String>()
        func coordinate(_ item: [String: Any]) -> Coordinate? {
            if item["nativePlaceSource"] as? String == "google" {
                guard let id = item["placeId"] as? String, let found = resolved[id], found.placeID == id,
                      (0..<300).contains(now.timeIntervalSince(found.fetchedAt)) else { return nil }
                return found.coordinate
            }
            return Coordinate.from(item: item)
        }
        func key(_ parts: [String]) -> String {
            // Encoding a tuple avoids collisions even when IDs contain separators.
            String(data: try! JSONSerialization.data(withJSONObject: parts, options: [.withoutEscapingSlashes]), encoding: .utf8)!
        }
        if let trip {
            for section in [.reserve] + (1...trip.dayCount).map(ScheduleSection.day) {
                var segment = [MapMarker]()
                func flush() {
                    if section.token > 0 && segment.count > 1 { routes.append(.init(day: section.token, markers: segment)) }
                    segment.removeAll()
                }
                for item in (try? TripSchedule.items(in: section, trip: trip)) ?? [] {
                    guard let rawID = item["id"], let id = try? ItemKey(json: rawID),
                          let point = coordinate(item) else { missing += 1; flush(); continue }
                    let markerKey = key(["trip", trip.id, id.token])
                    guard seen.insert(markerKey).inserted else { missing += 1; flush(); continue }
                    let marker = MapMarker(key: markerKey, coordinate: point, label: label(item), kind: section.token == 0 ? .reserve : .day(section.token), tripID: trip.id, itemKey: id, favoriteID: nil)
                    markers.append(marker); segment.append(marker)
                }
                flush()
            }
        }
        for row in saved {
            guard let point = coordinate(row.payload) else { missing += 1; continue }
            let markerKey = key(["saved",row.id])
            guard seen.insert(markerKey).inserted else { missing += 1; continue }
            markers.append(.init(key: markerKey, coordinate: point, label: label(row.payload), kind: .saved, tripID: nil, itemKey: nil, favoriteID: row.id))
        }
        return .init(markers: markers, unlocatedItemCount: missing, routes: routes)
    }
    private static func label(_ item: [String: Any]) -> String {
        let display = item["displayName"] as? String ?? ""
        return display.isEmpty ? item["name"] as? String ?? "이름 없는 장소" : display
    }
}
public struct MapBounds: Equatable {
    public let south, north, west, east, longitudeSpan: Double
    public static func fit(_ coordinates: [Coordinate]) -> MapBounds? {
        guard !coordinates.isEmpty else { return nil }
        let sorted = coordinates.map { $0.longitude < 0 ? $0.longitude + 360 : $0.longitude }.sorted()
        var gap = -1.0, index = 0
        for i in sorted.indices {
            let next = i + 1 < sorted.count ? sorted[i + 1] : sorted[0] + 360
            if next - sorted[i] > gap { gap = next - sorted[i]; index = i }
        }
        func signed(_ value: Double) -> Double { value > 180 ? value - 360 : value }
        return .init(south: coordinates.map(\.latitude).min()!, north: coordinates.map(\.latitude).max()!,
                     west: signed(sorted[(index + 1) % sorted.count]), east: signed(sorted[index]), longitudeSpan: 360 - gap)
    }
}
