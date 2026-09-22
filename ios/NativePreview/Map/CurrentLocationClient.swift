import CoreLocation
import NativeCore

@MainActor final class CurrentLocationClient: NSObject, LocationClient, @preconcurrency CLLocationManagerDelegate {
    private let manager=CLLocationManager()
    private var pending:CheckedContinuation<LocationOutcome,Never>?
    private var timeout:Task<Void,Never>?
    override init() {
        super.init(); manager.delegate=self; manager.desiredAccuracy=kCLLocationAccuracyHundredMeters
    }
    func requestCurrent() async -> LocationOutcome {
        guard pending == nil else { return .unavailable }
        return await withCheckedContinuation { continuation in
            pending=continuation
            timeout=Task { [weak self] in
                do { try await Task.sleep(nanoseconds:10000000000) } catch { return }
                self?.finish(.timedOut)
            }
            switch manager.authorizationStatus {
            case .notDetermined: manager.requestWhenInUseAuthorization()
            default: authorized()
            }
        }
    }
    func cancel() { finish(.unavailable) }
    private func authorized() {
        guard pending != nil else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways,.authorizedWhenInUse: manager.requestLocation()
        case .denied: finish(.denied)
        case .restricted: finish(.restricted)
        case .notDetermined: break
        @unknown default: finish(.unavailable)
        }
    }
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager) { authorized() }
    func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]) {
        guard let location=locations.last(where: { $0.horizontalAccuracy >= 0 && (0...30).contains(Date().timeIntervalSince($0.timestamp)) }),
              let point=try? Coordinate(latitude:location.coordinate.latitude,longitude:location.coordinate.longitude) else { return }
        finish(.granted(point,approximate:manager.accuracyAuthorization == .reducedAccuracy))
    }
    func locationManager(_ manager:CLLocationManager,didFailWithError error:Error) {
        if (error as? CLError)?.code == .denied { finish(.denied) } else { finish(.unavailable) }
    }
    private func finish(_ result:LocationOutcome) {
        manager.stopUpdatingLocation(); timeout?.cancel(); timeout=nil
        let value=pending; pending=nil; value?.resume(returning:result)
    }
}
