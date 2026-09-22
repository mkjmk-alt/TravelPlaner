import XCTest
@testable import NativeCore

@MainActor final class NativeMapStateTests: XCTestCase {
    final class Places: PlacesClient {
        var requests = [String: CheckedContinuation<[PlacePrediction], Error>]()
        var sessions = [UUID]()
        func autocomplete(query: String, sessionID: UUID) async throws -> [PlacePrediction] {
            sessions.append(sessionID)
            return try await withCheckedThrowingContinuation { requests[query] = $0 }
        }
        var detailRequests = [String: CheckedContinuation<ResolvedPlace, Error>]()
        func details(placeID: String, sessionID: UUID?) async throws -> ResolvedPlace {
            try await withCheckedThrowingContinuation { detailRequests[placeID] = $0 }
        }
        func endSession() {}
        func complete(_ query: String, _ result: [PlacePrediction]) { requests.removeValue(forKey:query)?.resume(returning:result) }
    }
    final class Clock {
        var waiting = [CheckedContinuation<Void, Error>]()
        var delays = [UInt64]()
        func sleep(_ nanos: UInt64) async throws {
            delays.append(nanos)
            try await withCheckedThrowingContinuation { waiting.append($0) }
        }
        func advance() { let values=waiting; waiting=[]; values.forEach { $0.resume() } }
    }
    final class Location: LocationClient {
        var calls=0
        func requestCurrent() async -> LocationOutcome { calls += 1; return .denied }
        func cancel() {}
    }
    func settle() async { for _ in 0..<30 { await Task.yield() } }
    func testLateLocationAfterLeavingScreenCannotMoveCamera() async throws {
        final class LateLocation:LocationClient {
            var completion:CheckedContinuation<LocationOutcome,Never>?
            func requestCurrent() async -> LocationOutcome {await withCheckedContinuation {completion=$0}}
            func cancel() {}
        }
        let location=LateLocation(),state=NativeMapState(places:nil,location:LateLocation())
        _=state
        let model=NativeMapState(places:nil,location:location)
        let request=Task {await model.locate()};await settle();model.deactivate()
        location.completion?.resume(returning:.granted(try Coordinate(latitude:35,longitude:139),approximate:false))
        await request.value
        XCTAssertNil(model.cameraCommand);XCTAssertNil(model.locationOutcome)
    }
    func testReferenceResolutionDoesNotSelectOrMoveAndDropsLateResultOnExit() async throws {
        let client=Places(), state=NativeMapState(places:nil,location:Location())
        await state.resolveReferences(["a"]); XCTAssertNil(state.error)
        let model=NativeMapState(places:client,location:Location())
        let first=Task { await model.resolveReferences(["a","a"]) }; await settle()
        let place=ResolvedPlace(placeID:"a",coordinate:try Coordinate(latitude:35,longitude:139),displayName:"Provider only",address:"Transient",attribution:[],fetchedAt:Date())
        client.detailRequests.removeValue(forKey:"a")?.resume(returning:place); await first.value
        XCTAssertEqual(model.resolved.count,1); XCTAssertNil(model.selected); XCTAssertNil(model.cameraCommand)
        let late=Task { await model.resolveReferences(["b"]) }; await settle()
        model.deactivate()
        client.detailRequests.removeValue(forKey:"b")?.resume(returning:place); await late.value
        XCTAssertTrue(model.resolved.isEmpty)
    }
    func testLateResultsCannotOverwriteNewSearchAndCancelClearsSession() async {
        let client=Places(), clock=Clock(), location=Location()
        let state=NativeMapState(places:client,location:location,sleep:clock.sleep)
        state.search("tok"); await settle()
        XCTAssertEqual(clock.delays,[300000000]); XCTAssertTrue(client.requests.isEmpty)
        clock.advance(); await settle(); XCTAssertNotNil(client.requests["tok"])
        state.search("tokyo"); await settle(); clock.advance(); await settle()
        let b=PlacePrediction(placeID:"b",text:"Tokyo",attribution:[])
        client.complete("tokyo",[b]); await settle()
        client.complete("tok",[.init(placeID:"a",text:"Tok",attribution:[])]); await settle()
        XCTAssertEqual(state.results,[b]); XCTAssertEqual(Set(client.sessions).count,1)
        state.cancelSearch(); XCTAssertTrue(state.results.isEmpty); XCTAssertNil(state.sessionID)
    }
    func testLocationDenialDoesNotDisableSearchOrAskAgain() async {
        let client=Places(), clock=Clock(), location=Location(), state=NativeMapState(places:Places(),location:Location())
        _ = state
        let model=NativeMapState(places:client,location:location,sleep:clock.sleep)
        XCTAssertEqual(location.calls,0); await model.locate()
        XCTAssertEqual(location.calls,1); XCTAssertEqual(model.locationOutcome,.denied)
        model.applyMarkers([]); XCTAssertEqual(location.calls,1)
        model.search("서울"); await settle(); clock.advance(); await settle()
        client.complete("서울",[.init(placeID:"s",text:"서울",attribution:[])]); await settle()
        XCTAssertEqual(model.results.count,1); XCTAssertEqual(location.calls,1)
    }
    func testMissingKeyFactoryNeverInvokedAndCommandsConsumedOnce() throws {
        var factoryCalls=0
        for raw in ["","  ","$(TRIPPLOT_MAPS_API_KEY)","YOUR_RESTRICTED_KEY"] {
            let value: Int? = NativeMapConfiguration.makeIfConfigured(raw) { _ in factoryCalls += 1; return 1 }
            XCTAssertNil(value)
        }
        XCTAssertEqual(factoryCalls,0)
        var queue=CameraQueue(), moves=[CameraCommand]()
        let command=CameraCommand(target:.center(try Coordinate(latitude:35,longitude:139),zoom:16))
        queue.enqueue(command); queue.consume(ready:false) { moves.append($0) }
        XCTAssertTrue(moves.isEmpty)
        queue.consume(ready:true) { moves.append($0) }; queue.enqueue(command); queue.consume(ready:true) { moves.append($0) }
        XCTAssertEqual(moves.count,1)
        queue.enqueue(.init(target:.fit([]))); queue.cancelPending(); queue.consume(ready:true) { moves.append($0) }
        XCTAssertEqual(moves.count,1)
    }
}
