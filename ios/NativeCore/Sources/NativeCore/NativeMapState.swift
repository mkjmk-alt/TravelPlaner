import Foundation
import Combine

public struct PlacePrediction: Equatable, Identifiable {
    public let placeID, text: String
    public let attribution: [String]
    public var id: String { placeID }
    public init(placeID: String, text: String, attribution: [String]) { self.placeID=placeID; self.text=text; self.attribution=attribution }
}
@MainActor public protocol PlacesClient: AnyObject {
    func autocomplete(query: String, sessionID: UUID) async throws -> [PlacePrediction]
    func details(placeID: String, sessionID: UUID?) async throws -> ResolvedPlace
    func endSession()
}
public enum LocationOutcome: Equatable {
    case granted(Coordinate, approximate: Bool), denied, restricted, unavailable, timedOut
}
@MainActor public protocol LocationClient: AnyObject {
    func requestCurrent() async -> LocationOutcome
    func cancel()
}
public enum NativeMapConfiguration {
    public static func key(_ raw: String?) -> String? {
        guard let value=raw?.trimmingCharacters(in:.whitespacesAndNewlines), !value.isEmpty,
              !value.contains("$("), !value.contains("${"), !value.hasPrefix("YOUR_") else { return nil }
        return value
    }
    public static func makeIfConfigured<T>(_ raw: String?, factory: (String)->T) -> T? { key(raw).map(factory) }
}
public struct CameraCommand: Equatable {
    public enum Target: Equatable { case center(Coordinate, zoom: Double), fit([Coordinate]) }
    public let id: UUID
    public let target: Target
    public init(id: UUID = UUID(), target: Target) { self.id=id; self.target=target }
}
public struct CameraQueue {
    private var pending: CameraCommand?
    private var consumed: UUID?
    public init() {}
    public mutating func enqueue(_ command: CameraCommand) { if command.id != consumed { pending=command } }
    public mutating func cancelPending() { if let pending { consumed=pending.id }; pending=nil }
    public mutating func consume(ready: Bool, sink: (CameraCommand)->Void) {
        guard ready, let next=pending else { return }
        pending=nil; consumed=next.id; sink(next)
    }
}
@MainActor public final class NativeMapState: ObservableObject {
    @Published public private(set) var results=[PlacePrediction]()
    @Published public private(set) var selected: ResolvedPlace?
    @Published public private(set) var resolved=[String:ResolvedPlace]()
    @Published public private(set) var markers=[MapMarker]()
    @Published public private(set) var loading=false
    @Published public private(set) var error: String?
    @Published public private(set) var locationOutcome: LocationOutcome?
    @Published public private(set) var cameraCommand: CameraCommand?
    public private(set) var sessionID: UUID?
    private let places: PlacesClient?
    private let location: LocationClient
    private let sleep: (UInt64) async throws -> Void
    private var searchTask: Task<Void,Never>?
    private var expiryTasks=[String:Task<Void,Never>]()
    private var generation=UUID()
    private var resolutionGeneration=UUID()
    private var locationGeneration=UUID()
    private var locating=false
    public init(places: PlacesClient?, location: LocationClient, sleep: @escaping (UInt64) async throws -> Void = { try await Task.sleep(nanoseconds:$0) }) {
        self.places=places; self.location=location; self.sleep=sleep
    }
    public func search(_ query: String) {
        searchTask?.cancel(); generation=UUID()
        let token=generation, trimmed=query.trimmingCharacters(in:.whitespacesAndNewlines)
        results=[]; error=nil; loading=false
        guard (2...200).contains(trimmed.unicodeScalars.count) else { cancelSearch(); return }
        guard let places else { error="지도 검색 키가 설정되지 않았습니다. 직접 장소를 등록할 수 있어요."; return }
        let session=sessionID ?? UUID(); sessionID=session; loading=true
        searchTask=Task { [weak self] in
            guard let self else { return }
            do {
                try await sleep(300000000); try Task.checkCancellation()
                let value=try await places.autocomplete(query:trimmed,sessionID:session)
                guard generation==token, !Task.isCancelled else { return }
                results=value; loading=false
            } catch {
                guard generation==token, !Task.isCancelled else { return }
                loading=false; self.error="장소를 불러오지 못했어요. 연결을 확인하고 다시 검색해주세요."; sessionID=nil; places.endSession()
            }
        }
    }
    public func cancelSearch() {
        searchTask?.cancel(); searchTask=nil; generation=UUID(); results=[]; loading=false; sessionID=nil; places?.endSession()
    }
    public func select(placeID: String) async {
        searchTask?.cancel(); generation=UUID(); let token=generation
        let session=sessionID; loading=true; error=nil
        selected=nil
        guard let places else { loading=false; error="지도 검색 키가 설정되지 않았습니다."; return }
        do {
            let detail=try await places.details(placeID:placeID,sessionID:session)
            guard generation==token, !Task.isCancelled else { return }
            guard detail.placeID == placeID else {
                loading=false; error="장소 참조가 변경되었어요. 검색에서 다시 확인해주세요."; sessionID=nil; places.endSession(); return
            }
            selected=detail; cache(detail); results=[]; loading=false; sessionID=nil; places.endSession()
        } catch {
            guard generation==token else { return }
            loading=false; self.error="장소 상세를 불러오지 못했어요. 다시 시도해주세요."; sessionID=nil; places.endSession()
        }
    }
    public func resolveReferences(_ ids: [String]) async {
        resolutionGeneration=UUID(); let token=resolutionGeneration
        guard let places else { return }
        for id in Set(ids).sorted() {
            guard token==resolutionGeneration, !Task.isCancelled else { return }
            if let value=resolved[id], (0..<300).contains(Date().timeIntervalSince(value.fetchedAt)) { continue }
            do {
                let value=try await places.details(placeID:id,sessionID:nil)
                guard token==resolutionGeneration, !Task.isCancelled else { return }
                // Do not silently rewrite an existing reference when the provider changes its ID.
                guard value.placeID==id else { error="장소 참조가 변경되었어요. 검색에서 다시 확인해주세요."; continue }
                cache(value)
            } catch {
                guard token==resolutionGeneration, !Task.isCancelled else { return }
                self.error="일부 장소의 위치를 조회하지 못했어요. 위치 다시 조회를 눌러 재시도할 수 있어요."
            }
        }
    }
    private func cache(_ place: ResolvedPlace) {
        resolved[place.placeID]=place; expiryTasks[place.placeID]?.cancel()
        expiryTasks[place.placeID]=Task { [weak self] in
            do { try await Task.sleep(nanoseconds:300000000000) } catch { return }
            self?.resolved.removeValue(forKey:place.placeID)
            if self?.selected?.placeID==place.placeID { self?.selected=nil }
            self?.expiryTasks.removeValue(forKey:place.placeID)
        }
    }
    public func applyMarkers(_ values: [MapMarker]) { markers=values }
    public func focus(_ coordinate: Coordinate) { cameraCommand = .init(target:.center(coordinate,zoom:16)) }
    public func fit(_ coordinates: [Coordinate]) {
        guard !coordinates.isEmpty else { error="표시할 위치가 없습니다."; return }
        cameraCommand = .init(target:coordinates.count==1 ? .center(coordinates[0],zoom:16) : .fit(coordinates))
    }
    public func locate() async {
        guard !locating else {return};locating=true
        let token=locationGeneration
        let outcome=await location.requestCurrent()
        guard token==locationGeneration else {return}
        locating=false;locationOutcome=outcome
        if case .granted(let point, _) = outcome { focus(point) }
    }
    public func deactivate() {
        resolutionGeneration=UUID()
        locationGeneration=UUID();locating=false
        cameraCommand=nil
        cancelSearch(); location.cancel(); selected=nil; resolved=[:]; expiryTasks.values.forEach { $0.cancel() }; expiryTasks=[:]
    }
}
