import XCTest

final class NativeTripUITests: XCTestCase {
    func testLandscapeEditorCanScrollAndSave() {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication(); app.launch()
        app.tabBars.buttons["내 여행"].tap()
        for _ in 0..<4 {
            if app.buttons["newTripButton"].exists { break }
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        for _ in 0..<12 {
            let button = app.buttons["newTripButton"]
            if button.isHittable && button.frame.maxY < app.frame.maxY * 0.85 { break }
            app.swipeUp()
        }
        app.buttons["newTripButton"].tap()
        if !app.textFields["tripNameField"].waitForExistence(timeout: 5) { print("LAYOUT_TREE", app.debugDescription) }
        app.textFields["tripNameField"].tap(); app.textFields["tripNameField"].typeText("LayoutQA-\(Int(Date().timeIntervalSince1970))")
        app.buttons["saveTripButton"].tap()
        for _ in 0..<12 {
            let button = app.buttons["openItinerary"]
            if button.exists && button.isHittable && button.frame.maxY < app.frame.maxY * 0.85 { break }
            app.swipeUp()
        }
        app.buttons["openItinerary"].tap(); app.buttons["addPlace"].tap()
        app.textFields["placeName"].tap(); app.textFields["placeName"].typeText("Landscape place\n")
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        // Multiline SwiftUI TextField is exposed as TextView at accessibility sizes.
        let memo = app.descendants(matching: .any).matching(identifier: "placeMemo").firstMatch
        for _ in 0..<12 {
            if memo.isHittable { break }
            // In landscape the keyboard covers the screen midpoint; scroll the form,
            // not the keyboard's suggestion row where a full-screen swipe begins.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.35))
                .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.18)))
        }
        if !memo.exists { print("MEMO_LAYOUT_TREE", app.debugDescription) }
        memo.tap(); memo.typeText("large text memo")
        XCTAssertTrue(app.buttons["savePlace"].isHittable)
        let capture = XCTAttachment(screenshot: app.screenshot()); capture.name = "landscape-editor-save"; capture.lifetime = .keepAlways; add(capture)
        app.buttons["savePlace"].tap()
        XCTAssertTrue(app.buttons["addPlace"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .portrait
        for _ in 0..<12 { if app.staticTexts["large text memo"].exists { break }; app.swipeUp() }
        if !app.staticTexts["large text memo"].exists { print("SAVED_LAYOUT_TREE", app.debugDescription) }
        XCTAssertTrue(app.staticTexts["large text memo"].exists)
    }
    func testSystemFilePickerOpensAndCancels() {
        let app = XCUIApplication(); app.launch(); app.tabBars.buttons["더보기"].tap()
        app.buttons["backupImport"].tap(); app.buttons["backupImport"].tap()
        let cancel = app.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        cancel.tap()
        XCTAssertTrue(app.buttons["backupImport"].waitForExistence(timeout: 5))
    }
    func testSystemFileImportPreviewAndRepeat() {
        let app = XCUIApplication(); app.launch(); app.tabBars.buttons["더보기"].tap()
        app.buttons["backupImport"].tap()
        func select(_ name: String) {
            for _ in 0..<12 { if app.buttons["backupImport"].isHittable { break }; app.swipeDown() }
            app.buttons["backupImport"].tap()
            XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 8))
            app.buttons.matching(identifier: "둘러보기").allElementsBoundByIndex.last?.tap()
            if app.staticTexts["나의 iPhone"].waitForExistence(timeout: 2) { app.staticTexts["나의 iPhone"].tap() }
            if app.staticTexts["TripPlot Native"].waitForExistence(timeout: 2) { app.staticTexts["TripPlot Native"].tap() }
            let file = app.cells.containing(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
            if !file.waitForExistence(timeout: 5) { print("IMPORT_PICKER_TREE", app.debugDescription) }
            XCTAssertTrue(file.exists); file.tap()
        }
        select("stage2-invalid")
        XCTAssertTrue(app.staticTexts["import-error"].waitForExistence(timeout: 5))
        select("stage2-legacy")
        XCTAssertTrue(app.staticTexts["import-preview"].waitForExistence(timeout: 5))
        for _ in 0..<12 { if app.buttons["confirmImport"].isHittable { break }; app.swipeUp() }
        app.buttons["confirmImport"].tap()
        XCTAssertTrue(app.staticTexts["backup-result"].waitForExistence(timeout: 5))
        select("stage2-legacy")
        XCTAssertTrue(app.staticTexts["import-preview"].waitForExistence(timeout: 5))
        for _ in 0..<12 { if app.buttons["confirmImport"].isHittable { break }; app.swipeUp() }
        app.buttons["confirmImport"].tap()
        XCTAssertTrue(app.staticTexts["backup-result"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["backup-result"].label.contains("이미 가져온 여행"))
        for _ in 0..<12 {
            let picker = app.buttons["backupTripSelection"]
            if picker.isHittable && picker.frame.maxY < app.tabBars.firstMatch.frame.minY { break }
            app.swipeUp()
        }
        app.buttons["backupTripSelection"].tap()
        for _ in 0..<20 { if app.buttons["구형 여행"].firstMatch.isHittable { break }; app.swipeUp() }
        if !app.buttons["구형 여행"].firstMatch.exists { print("EXPORT_SELECTION_TREE", app.debugDescription) }
        app.buttons["구형 여행"].firstMatch.tap()
        app.buttons["backupExport"].tap()
        let saveFile = app.navigationBars["FullDocumentManagerViewControllerNavigationBar"].buttons["저장"]
        XCTAssertTrue(saveFile.waitForExistence(timeout: 8))
        saveFile.tap()
        // Only this synthetic fixture output may already exist from a prior test run.
        // The system asks before replacing it; completion must wait for that decision.
        if app.alerts.buttons["대치"].waitForExistence(timeout: 2) { app.alerts.buttons["대치"].tap() }
        // Export controls are below the result section. Form virtualizes that
        // section while scrolled down, so bring it back before checking success.
        for _ in 0..<12 { if app.staticTexts["backup-result"].exists { break }; app.swipeDown() }
        XCTAssertTrue(app.staticTexts["backup-result"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["backup-result"].label.contains("백업을 저장"))
        select("stage2-android")
        XCTAssertTrue(app.staticTexts["import-preview"].waitForExistence(timeout: 5))
        for _ in 0..<12 {
            if app.buttons["confirmImport"].isHittable || app.buttons["keepBothImport"].isHittable { break }
            app.swipeUp()
        }
        let confirmation = app.buttons["keepBothImport"].exists ? app.buttons["keepBothImport"] : app.buttons["confirmImport"]
        confirmation.tap()
        XCTAssertTrue(app.staticTexts["backup-result"].waitForExistence(timeout: 5))
    }
    func testManualPlaceEditMoveAndRelaunch() {
        let app = XCUIApplication(); app.launch()
        app.tabBars.buttons["내 여행"].tap()
        for _ in 0..<3 {
            if app.buttons["newTripButton"].exists { break }
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        app.buttons["newTripButton"].tap()
        let name = "ScheduleQA-\(Int(Date().timeIntervalSince1970))"
        app.textFields["tripNameField"].tap(); app.textFields["tripNameField"].typeText(name)
        app.buttons["saveTripButton"].tap()
        XCTAssertTrue(app.buttons["openItinerary"].waitForExistence(timeout: 5))
        app.buttons["openItinerary"].tap(); app.buttons["section-day-1"].tap()
        app.buttons["addPlace"].tap()
        app.textFields["placeName"].tap(); app.textFields["placeName"].typeText("Tokyo place")
        app.textFields["placeTime"].tap(); app.textFields["placeTime"].typeText("24:00")
        app.buttons["savePlace"].tap()
        XCTAssertTrue(app.staticTexts["place-error"].waitForExistence(timeout: 3))
        let time = app.textFields["placeTime"]; time.tap(); time.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 5) + "09:30")
        app.buttons["savePlace"].tap()
        XCTAssertTrue(app.staticTexts["Tokyo place"].waitForExistence(timeout: 5))
        app.buttons["placeActions"].firstMatch.tap(); app.buttons["장소 편집"].tap()
        app.textFields["placeMemo"].tap(); app.textFields["placeMemo"].typeText("persisted memo")
        app.buttons["savePlace"].tap()
        app.buttons["placeActions"].firstMatch.tap(); app.buttons["예비 목록으로 이동"].tap()
        app.buttons["section-reserve"].tap()
        XCTAssertTrue(app.staticTexts["persisted memo"].waitForExistence(timeout: 5))
        app.buttons["placeActions"].firstMatch.tap(); app.buttons["장소 삭제"].tap(); app.buttons["취소"].tap()
        XCTAssertTrue(app.staticTexts["Tokyo place"].exists)
        app.terminate(); app.launch()
        app.buttons["openItinerary"].tap(); app.buttons["section-reserve"].tap()
        XCTAssertTrue(app.staticTexts["Tokyo place"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["persisted memo"].exists)
        XCTAssertTrue(app.staticTexts["09:30"].exists)
        app.tabBars.buttons["더보기"].tap()
        XCTAssertTrue(app.buttons["backupImport"].exists)
        XCTAssertEqual(app.webViews.count, 0)
    }
    func testCreateEditAndRelaunchWithoutWebView() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertEqual(app.webViews.count, 0)
        app.tabBars.buttons["내 여행"].tap()
        // A previous test run may have restored the trip detail.
        if !app.buttons["newTripButton"].exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        XCTAssertTrue(app.buttons["newTripButton"].waitForExistence(timeout: 5))
        app.buttons["newTripButton"].tap()
        let name = "NativeQA-\(Int(Date().timeIntervalSince1970))"
        let field = app.textFields["tripNameField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText(name)
        app.buttons["saveTripButton"].tap()
        XCTAssertTrue(app.buttons["editTripButton"].waitForExistence(timeout: 5))
        app.terminate(); app.launch()
        XCTAssertEqual(app.webViews.count, 0)
        XCTAssertTrue(app.navigationBars[name].waitForExistence(timeout: 5))
        app.buttons["editTripButton"].tap()
        app.buttons["clearTripName"].tap()
        app.textFields["tripNameField"].tap()
        app.textFields["tripNameField"].typeText(name + "-edited")
        app.buttons["saveTripButton"].tap()
        XCTAssertTrue(app.navigationBars[name + "-edited"].waitForExistence(timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.navigationBars[name + "-edited"].waitForExistence(timeout: 5))
        for tab in ["지도", "저장", "지출", "더보기", "내 여행"] {
            app.tabBars.buttons[tab].tap()
            XCTAssertEqual(app.webViews.count, 0)
        }
        XCTAssertTrue(app.navigationBars[name + "-edited"].exists)
    }

    func testExpenseEditorPersistsAndSettlementOpens() {
        let app = XCUIApplication()
        app.launch()
        app.tabBars.buttons["내 여행"].tap()
        if !app.buttons["newTripButton"].exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        XCTAssertTrue(app.buttons["newTripButton"].waitForExistence(timeout: 5))
        app.buttons["newTripButton"].tap()
        let tripName = "ExpenseQA-(Int(Date().timeIntervalSince1970))"
        let tripNameField = app.textFields["tripNameField"]
        XCTAssertTrue(tripNameField.waitForExistence(timeout: 5))
        tripNameField.tap(); tripNameField.typeText(tripName)
        app.buttons["saveTripButton"].tap()
        XCTAssertTrue(app.tabBars.buttons["지출"].waitForExistence(timeout: 5))
        app.tabBars.buttons["지출"].tap()
        let addExpense = app.buttons["addExpense"]
        XCTAssertTrue(addExpense.waitForExistence(timeout: 5))
        addExpense.tap()
        let amount = app.textFields["expenseAmount"]
        XCTAssertTrue(amount.waitForExistence(timeout: 5))
        amount.tap(); amount.typeText("1200")
        let amountKRW = app.textFields["expenseAmountKRW"]
        amountKRW.tap(); amountKRW.typeText("1200")
        app.buttons["saveExpense"].tap()
        XCTAssertTrue(app.staticTexts["KRW 1200.0 · self 결제"].waitForExistence(timeout: 5))
        app.buttons["openSettlement"].tap()
        XCTAssertTrue(app.navigationBars["함께 정산"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["총 지출 ₩1200 · 1건"].exists)
    }
}
