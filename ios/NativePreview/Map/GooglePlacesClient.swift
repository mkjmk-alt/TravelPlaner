import Foundation
import GooglePlaces
import NativeCore

@MainActor final class GooglePlacesClient: PlacesClient {
    private let client=GMSPlacesClient.shared()
    private var sessionID:UUID?
    private var token:GMSAutocompleteSessionToken?
    private func session(_ id:UUID?) -> GMSAutocompleteSessionToken? {
        guard let id else { return nil }
        if sessionID != id { sessionID=id; token=GMSAutocompleteSessionToken() }
        return token
    }
    func endSession() { token=nil; sessionID=nil }
    func autocomplete(query:String,sessionID:UUID) async throws -> [PlacePrediction] {
        let request=GMSAutocompleteRequest(query:query); request.sessionToken=session(sessionID)
        return try await NativeCallback.perform { finish in
            client.fetchAutocompleteSuggestions(from:request) { values,error in
                if let error { finish(.failure(error)); return }
                finish(.success((values ?? []).compactMap { result in
                    guard let place=result.placeSuggestion else { return nil }
                    return PlacePrediction(placeID:place.placeID,text:place.attributedFullText.string,attribution:[])
                }))
            }
        }
    }
    func details(placeID:String,sessionID:UUID?) async throws -> ResolvedPlace {
        let fields: [GMSPlaceProperty] = [.placeID, .name, .formattedAddress, .coordinate]
        let request=GMSFetchPlaceRequest(placeID:placeID,placeProperties:fields.map(\.rawValue),sessionToken:session(sessionID))
        return try await NativeCallback.perform { finish in
            client.fetchPlace(with:request) { place,error in
                if let error { finish(.failure(error)); return }
                guard let place else { finish(.failure(PlaceError.invalidReference)); return }
                do {
                    let coordinate=try Coordinate(latitude:place.coordinate.latitude,longitude:place.coordinate.longitude)
                    finish(.success(ResolvedPlace(placeID:place.placeID ?? placeID,coordinate:coordinate,displayName:place.name ?? "",address:place.formattedAddress ?? "",attribution:place.attributions.map { [$0.string] } ?? [],fetchedAt:Date())))
                } catch { finish(.failure(error)) }
            }
        }
    }
}
// SDK callbacks may arrive after cancellation/timeout. Resume exactly once; don't log payloads.
@MainActor private final class NativeCallback<T> {
    private var continuation:CheckedContinuation<T,Error>?
    private var timeout:Task<Void,Never>?
    func finish(_ result:Result<T,Error>) { guard let continuation else { return }; self.continuation=nil; timeout?.cancel(); timeout=nil; continuation.resume(with:result) }
    static func perform(_ register: (@escaping (Result<T,Error>)->Void)->Void) async throws -> T {
        let box=NativeCallback<T>()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                box.continuation=continuation
                if Task.isCancelled { box.finish(.failure(CancellationError())); return }
                box.timeout=Task {
                    do { try await Task.sleep(nanoseconds:10000000000) } catch { return }
                    box.finish(.failure(URLError(.timedOut)))
                }
                register { result in Task { @MainActor in box.finish(result) } }
            }
        } onCancel: { Task { @MainActor in box.finish(.failure(CancellationError())) } }
    }
}
