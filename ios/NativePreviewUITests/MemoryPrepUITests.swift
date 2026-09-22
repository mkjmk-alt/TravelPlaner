import XCTest

final class MemoryPrepUITests: XCTestCase {
    func testMoreRoutesExposeMemoryPreparationAndDetails() {
        let app = XCUIApplication()
        app.launch()
        app.tabBars.buttons["내 여행"].tap()
        if !app.buttons["newTripButton"].exists {
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        XCTAssertTrue(app.buttons["newTripButton"].waitForExistence(timeout: 5))
        app.buttons["newTripButton"].tap()
        let name = "Memory QA-\(UUID().uuidString.prefix(6))"
        let nameField = app.textFields["tripNameField"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.tap(); nameField.typeText(name)
        app.buttons["saveTripButton"].tap()
        XCTAssertTrue(app.buttons["editTripButton"].waitForExistence(timeout: 5))

        app.tabBars.buttons["더보기"].tap()
        app.buttons["여행 기록·사진"].tap()
        XCTAssertTrue(app.navigationBars["여행 기록"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["여행 준비 체크리스트"].tap()
        XCTAssertTrue(app.navigationBars["여행 준비"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["항공·숙소 정보"].tap()
        XCTAssertTrue(app.navigationBars["항공·숙소 정보"].waitForExistence(timeout: 5))
    }

    func testMemoryRecordCanEditAndConfirmDelete() {
        let app = XCUIApplication()
        app.launch()
        app.tabBars.buttons["내 여행"].tap()
        if !app.buttons["newTripButton"].exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        XCTAssertTrue(app.buttons["newTripButton"].waitForExistence(timeout: 5))
        app.buttons["newTripButton"].tap()
        let tripName = "Memory Edit QA-\(UUID().uuidString.prefix(6))"
        app.textFields["tripNameField"].tap(); app.textFields["tripNameField"].typeText(tripName)
        app.buttons["saveTripButton"].tap()
        app.tabBars.buttons["더보기"].tap(); app.buttons["여행 기록·사진"].tap()
        let title = app.textFields["memory-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        let originalTitle = "Original Memory-\(UUID().uuidString.prefix(6))"
        title.tap(); title.typeText(originalTitle)
        XCTAssertTrue(app.buttons["memory-save"].isEnabled)
        app.buttons["memory-save"].tap()
        XCTAssertTrue(app.buttons["memory-edit"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["memory-edit"].firstMatch.tap()
        app.textFields["memory-title"].tap(); app.textFields["memory-title"].typeText("Edited Memory")
        app.buttons["memory-edit-save"].tap()
        XCTAssertTrue(app.buttons["memory-edit"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["memory-delete"].firstMatch.tap()
        app.buttons["memory-delete-confirm"].firstMatch.tap()
        let deletedTitle = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", originalTitle))
        let deadline = Date().addingTimeInterval(3)
        while deletedTitle.count > 0, Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertEqual(deletedTitle.count, 0)
    }

    func testMemoryDraftRestoresAfterLeavingAndReentering() {
        let app = XCUIApplication()
        app.launch()
        app.tabBars.buttons["내 여행"].tap()
        if !app.buttons["newTripButton"].exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        XCTAssertTrue(app.buttons["newTripButton"].waitForExistence(timeout: 5))
        app.buttons["newTripButton"].tap()
        let tripName = "Memory Draft QA-\(UUID().uuidString.prefix(6))"
        app.textFields["tripNameField"].tap(); app.textFields["tripNameField"].typeText(tripName)
        app.buttons["saveTripButton"].tap()
        app.tabBars.buttons["더보기"].tap(); app.buttons["여행 기록·사진"].tap()
        let title = app.textFields["memory-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("Restored Memory Draft")
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["여행 기록·사진"].tap()
        let restoredTitle = app.textFields["memory-title"]
        XCTAssertTrue(restoredTitle.waitForExistence(timeout: 5))
        XCTAssertEqual(restoredTitle.value as? String, "Restored Memory Draft")
    }
}
