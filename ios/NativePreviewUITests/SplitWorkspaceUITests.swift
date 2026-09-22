import XCTest

final class SplitWorkspaceUITests:XCTestCase {
    func testFreeDividerRestoresAfterMapFullAndRelaunch() {
        XCUIDevice.shared.orientation = .portrait
        let app=XCUIApplication(); app.launch(); app.tabBars.buttons["내 여행"].tap()
        for _ in 0..<4 { if app.buttons["newTripButton"].exists { break }; app.navigationBars.buttons.element(boundBy:0).tap() }
        app.buttons["newTripButton"].tap()
        app.textFields["tripNameField"].tap(); app.textFields["tripNameField"].typeText("SplitQA-"+UUID().uuidString.prefix(8))
        app.buttons["saveTripButton"].tap(); app.buttons["openItinerary"].tap()
        let handle=app.descendants(matching:.any)["splitHandle"].firstMatch
        XCTAssertTrue(handle.waitForExistence(timeout:5)); guard handle.exists else { return }
        XCTAssertEqual(handle.value as? String,"지도 50%")
        app.buttons["splitListFull"].tap(); XCTAssertEqual(handle.value as? String,"지도 0%")
        app.buttons["splitRestore"].tap()
        let start=handle.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5))
        start.press(forDuration:0.1,thenDragTo:start.withOffset(CGVector(dx:0,dy:-83)))
        let value=handle.value as? String
        XCTAssertNotEqual(value,"지도 50%"); XCTAssertNotEqual(value,"지도 0%")
        app.buttons["splitMapFull"].tap(); XCTAssertEqual(handle.value as? String,"지도 100%")
        app.buttons["splitRestore"].tap(); XCTAssertEqual(handle.value as? String,value)
        app.terminate(); app.launch(); app.buttons["openItinerary"].tap()
        XCTAssertTrue(handle.waitForExistence(timeout:5)); XCTAssertEqual(handle.value as? String,value)
        XCTAssertTrue(app.tabBars.buttons["저장"].isHittable)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "stage3-keyless-free-split"; capture.lifetime = .keepAlways; add(capture)
    }
}
