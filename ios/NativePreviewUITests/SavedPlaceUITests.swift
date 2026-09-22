import XCTest

final class SavedPlaceUITests:XCTestCase {
    func testManualFavoritePersistsAfterRelaunchWithNoKey() {
        let app=XCUIApplication(); app.launch(); app.tabBars.buttons["저장"].tap()
        let add=app.buttons["savedPlaceAddManual"]
        XCTAssertTrue(add.waitForExistence(timeout:5))
        guard add.exists else { return }; add.tap()
        let name="MapQA-" + UUID().uuidString.prefix(8)
        app.textFields["savedPlaceName"].tap(); app.textFields["savedPlaceName"].typeText(name)
        app.buttons["savedPlaceSave"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout:5))
        app.terminate(); app.launch(); app.tabBars.buttons["저장"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout:5))
        app.tabBars.buttons["지도"].tap()
        XCTAssertTrue(app.descendants(matching:.any)["nativeMapUnavailable"].firstMatch.waitForExistence(timeout:5), app.debugDescription)
        XCTAssertEqual(app.webViews.count,0)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "stage3-keyless-map"; capture.lifetime = .keepAlways; self.add(capture)
    }
}
