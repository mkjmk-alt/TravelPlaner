import Foundation
import CoreFoundation

public struct Coordinate: Equatable {
    public let latitude, longitude: Double
    public init(latitude: Double, longitude: Double) throws {
        guard latitude.isFinite, longitude.isFinite, (-90...90).contains(latitude), (-180...180).contains(longitude) else { throw PlaceError.invalidCoordinate }
        self.latitude = latitude; self.longitude = longitude
    }
    public static func from(item: [String: Any]) -> Coordinate? {
        guard let lat = item["lat"] as? NSNumber, let lng = item["lng"] as? NSNumber,
              CFGetTypeID(lat) != CFBooleanGetTypeID(), CFGetTypeID(lng) != CFBooleanGetTypeID() else { return nil }
        return try? Coordinate(latitude: lat.doubleValue, longitude: lng.doubleValue)
    }
}
public enum PlaceReference: Equatable { case manual(Coordinate), google(placeID: String), existing, unlocated }
public struct PlaceSelection {
    public let reference: PlaceReference
    public let originalItem: [String: Any]?
    public let sourceTripID: String?
    public let sourceItemKey: ItemKey?
    public let sourceSavedID: String?
    public init(reference: PlaceReference, originalItem: [String: Any]? = nil, sourceTripID: String? = nil, sourceItemKey: ItemKey? = nil, sourceSavedID: String? = nil) {
        self.reference = reference; self.originalItem = originalItem; self.sourceTripID = sourceTripID; self.sourceItemKey = sourceItemKey; self.sourceSavedID = sourceSavedID
    }
    public func validated() throws -> PlaceSelection {
        if case .google(let id) = reference {
            let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...1024).contains(trimmed.unicodeScalars.count) else { throw PlaceError.invalidReference }
            return .init(reference: .google(placeID: trimmed))
        }
        if case .existing = reference {
            guard let originalItem, let id = originalItem["id"] else { throw PlaceError.invalidReference }
            if let sourceSavedID {
                guard sourceTripID == nil, !sourceSavedID.isEmpty, id as? String == sourceSavedID else { throw PlaceError.invalidReference }
            } else {
                guard let sourceTripID, !sourceTripID.isEmpty, let sourceItemKey, try ItemKey(json: id) == sourceItemKey else { throw PlaceError.invalidReference }
            }
        }
        return self
    }
    func sourceKey(creationID: String) throws -> String {
        let value = try validated()
        switch value.reference {
        case .google(let id): return "google:" + id
        case .manual, .unlocated: return "manual:" + creationID
        case .existing:
            let parts = value.sourceSavedID.map { ["saved", $0] } ?? ["existing", value.sourceTripID!, value.sourceItemKey!.token]
            return "existing:" + TripBackup.hash(try JSONSerialization.data(withJSONObject: parts, options: [.withoutEscapingSlashes]))
        }
    }
    func durablePayload(id: String, draft: PlaceDraft) throws -> [String: Any] {
        guard UUID(uuidString: id) != nil else { throw ScheduleError.invalidID }
        let value = try validated()
        var raw: [String: Any] = value.reference == .existing ? value.originalItem! : [:]
        try draft.validate(original: raw)
        raw["id"] = id
        for (key, field) in draft.fields { raw[key] = field }
        switch value.reference {
        case .manual(let coordinate): raw["lat"] = coordinate.latitude; raw["lng"] = coordinate.longitude
        case .google(let placeID): raw["placeId"] = placeID; raw["nativePlaceSource"] = "google"
        case .existing, .unlocated: break
        }
        return raw
    }
}
public struct ResolvedPlace {
    public let placeID: String
    public let coordinate: Coordinate
    public let displayName, address: String
    public let attribution: [String]
    public let fetchedAt: Date
    public init(placeID: String, coordinate: Coordinate, displayName: String, address: String, attribution: [String], fetchedAt: Date) {
        self.placeID = placeID; self.coordinate = coordinate; self.displayName = displayName; self.address = address; self.attribution = attribution; self.fetchedAt = fetchedAt
    }
}
public enum PlaceError: LocalizedError {
    case invalidCoordinate, invalidReference, conflictingOperation
    public var errorDescription: String? {
        switch self {
        case .invalidCoordinate: return "위도(-90~90)와 경도(-180~180)를 함께 확인해주세요."
        case .invalidReference: return "장소 정보를 확인하지 못했습니다. 다시 선택해주세요."
        case .conflictingOperation: return "같은 저장 요청의 내용이 변경되었습니다. 다시 확인해주세요."
        }
    }
}
