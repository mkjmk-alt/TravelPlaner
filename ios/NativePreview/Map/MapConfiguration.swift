import Foundation
import NativeCore
import GoogleMaps
import GooglePlaces

enum MapConfiguration {
    static var key: String? { NativeMapConfiguration.key(Bundle.main.object(forInfoDictionaryKey:"TripPlotMapsAPIKey") as? String) }
    @MainActor private static var initialized=false
    @MainActor static func configure() -> Bool {
        guard let key else { return false }
        if !initialized { GMSServices.provideAPIKey(key); GMSPlacesClient.provideAPIKey(key); initialized=true }
        return true
    }
    @MainActor static func makeState() -> NativeMapState {
        NativeMapState(places: configure() ? GooglePlacesClient() : nil, location: CurrentLocationClient())
    }
}
