import Foundation

public struct SavedPlaceDocument: Identifiable {
    public let id, sourceKey: String
    public let payload: [String: Any]
    public let createdAt, updatedAt: Double
    public init(id: String, sourceKey: String, payload: [String: Any], createdAt: Double, updatedAt: Double) {
        self.id = id; self.sourceKey = sourceKey; self.payload = payload; self.createdAt = createdAt; self.updatedAt = updatedAt
    }
    public var draft: PlaceDraft { PlaceDraft(item: payload) }
    public var selection: PlaceSelection {
        // A saved row is already a durable user-owned record. Copy it as an
        // existing payload so extension fields survive a second itinerary copy;
        // accepting a fresh SDK result remains the Google selection path.
        return .init(reference: .existing, originalItem: payload, sourceSavedID: id)
    }
}
