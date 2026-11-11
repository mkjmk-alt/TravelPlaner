import XCTest

final class SplitWorkspaceUITests:XCTestCase {
    private func showTripList(_ app: XCUIApplication) {
        for _ in 0..<6 {
            if app.buttons["newTripButton"].exists { return }
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
    }

    private func tabItem(_ label: String, in app: XCUIApplication) -> XCUIElement {
        let tabBarButton = app.nativeTab(label)
        if tabBarButton.exists { return tabBarButton }
        let symbol = ["내 여행": "suitcase.rolling", "저장": "heart"][label] ?? label
        return app.descendants(matching: .any).matching(identifier: symbol).firstMatch
    }

    func testItineraryListScrollDoesNotResizeSplit() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-native.selectedTab", "trips"]
        app.launchNativeTest()
        let tripsTab = tabItem("내 여행", in: app)
        XCTAssertTrue(tripsTab.waitForExistence(timeout: 5))
        tripsTab.tap()
        showTripList(app)
        app.buttons["newTripButton"].tap()
        app.textFields["tripNameField"].tap()
        app.textFields["tripNameField"].typeText("ScrollQA-\(UUID().uuidString.prefix(6))")
        app.buttons["saveTripButton"].tap()

        let handle = app.descendants(matching: .any)["splitHandle"].firstMatch
        try XCTSkipUnless(handle.waitForExistence(timeout: 5), "지도 키가 없거나 지도를 불러오지 못해 분할 화면을 사용할 수 없습니다.")
        XCTAssertEqual(handle.value as? String, "지도 50%")

        for index in 0..<14 {
            let name = String(format: "ScrollRow-%02d", index)
            app.buttons["addPlace"].tap()
            app.textFields["placeName"].tap()
            app.textFields["placeName"].typeText(name)
            app.buttons["savePlace"].tap()
            XCTAssertTrue(app.buttons["addPlace"].waitForExistence(timeout: 5), "장소 저장 후 일정 편집 화면으로 돌아와야 합니다")
        }

        let firstRow = app.staticTexts["ScrollRow-00"]
        let lastRow = app.staticTexts["ScrollRow-13"]
        let list = app.descendants(matching: .any)["itinerary-list"].firstMatch
        XCTAssertTrue(handle.exists, "일정 스크롤을 시작하기 전에 분할 핸들이 있어야 합니다")
        for _ in 0..<8 where !firstRow.isHittable { list.swipeDown() }
        XCTAssertTrue(firstRow.isHittable)
        // List accessibility bounds extend behind the custom bottom tab bar; gesture only in the visible list area.
        let swipeStart = list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.70))
        swipeStart.press(forDuration: 0.05, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.20)))
        XCTAssertFalse(firstRow.isHittable, "일정 목록을 위로 스크롤하면 첫 행이 화면 밖으로 이동해야 합니다")
        XCTAssertEqual(handle.value as? String, "지도 50%", "일정 목록 스크롤이 분할 비율을 바꾸면 안 됩니다")
        for _ in 0..<8 where !lastRow.isHittable {
            let start = list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.70))
            start.press(forDuration: 0.05, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.20)))
            XCTAssertEqual(handle.value as? String, "지도 50%", "일정 목록 스크롤이 분할 비율을 바꾸면 안 됩니다")
        }
        XCTAssertTrue(lastRow.isHittable, "마지막 일정 행까지 스크롤할 수 있어야 합니다")
        XCTAssertEqual(handle.value as? String, "지도 50%")
    }

    func testFreeDividerRestoresAfterMapFullAndRelaunch() throws {
        XCUIDevice.shared.orientation = .portrait
        let app=XCUIApplication(); app.launchNativeTest()
        let tripsTab = tabItem("내 여행", in: app)
        XCTAssertTrue(tripsTab.waitForExistence(timeout: 5)); tripsTab.tap()
        for _ in 0..<4 { if app.buttons["newTripButton"].exists { break }; app.navigationBars.buttons.element(boundBy:0).tap() }
        app.buttons["newTripButton"].tap()
        app.textFields["tripNameField"].tap(); app.textFields["tripNameField"].typeText("SplitQA-"+UUID().uuidString.prefix(8))
        app.buttons["saveTripButton"].tap()
        let handle=app.descendants(matching:.any)["splitHandle"].firstMatch
        try XCTSkipUnless(handle.waitForExistence(timeout:5), "지도 키가 없거나 지도를 불러오지 못해 분할 화면을 사용할 수 없습니다.")
        XCTAssertEqual(handle.value as? String,"지도 50%")
        app.buttons["splitListFull"].tap(); XCTAssertEqual(handle.value as? String,"지도 0%")
        app.buttons["splitRestore"].tap()
        let start=handle.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5))
        start.press(forDuration:0.1,thenDragTo:start.withOffset(CGVector(dx:0,dy:-83)))
        let value=handle.value as? String
        XCTAssertNotEqual(value,"지도 50%"); XCTAssertNotEqual(value,"지도 0%")
        app.buttons["splitMapFull"].tap(); XCTAssertEqual(handle.value as? String,"지도 100%")
        let fullMapCapture = XCTAttachment(screenshot: app.screenshot())
        fullMapCapture.name = "full-map-before-restore"; fullMapCapture.lifetime = .keepAlways; add(fullMapCapture)
        app.buttons["splitRestore"].tap(); XCTAssertEqual(handle.value as? String,value)
        app.terminate(); app.launchNativeTest()
        XCTAssertTrue(handle.waitForExistence(timeout:5)); XCTAssertEqual(handle.value as? String,value)
        XCTAssertTrue(tabItem("저장", in: app).isHittable)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "stage3-keyless-free-split"; capture.lifetime = .keepAlways; add(capture)
    }
}
