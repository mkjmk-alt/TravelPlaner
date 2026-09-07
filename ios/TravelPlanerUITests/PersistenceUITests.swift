import XCTest

final class PersistenceUITests: XCTestCase {
    private let tripName = "iOS저장0907"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testAnonymousTripSurvivesColdRelaunch() throws {
        let app = XCUIApplication()
        app.launch()

        dismissOnboardingIfNeeded(in: app)

        let createButton = app.buttons["새 여행 계획하기"]
        XCTAssertTrue(createButton.waitForExistence(timeout: 15), "새 여행 버튼이 나타나지 않았습니다.")
        createButton.tap()

        let labeledNameField = app.textFields["여행 이름"]
        let nameField = labeledNameField.exists ? labeledNameField : app.textFields.firstMatch
        XCTAssertTrue(nameField.waitForExistence(timeout: 5), "여행 이름 입력란이 나타나지 않았습니다.")
        nameField.tap()
        nameField.typeText(tripName)

        let saveButton = app.buttons["여행 만들기"]
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5), "여행 만들기 버튼이 나타나지 않았습니다.")
        saveButton.tap()
        dismissOnboardingIfNeeded(in: app)

        app.terminate()
        app.launch()
        dismissOnboardingIfNeeded(in: app)

        XCTAssertTrue(app.staticTexts[tripName].waitForExistence(timeout: 15), "콜드 재실행 후 로그인 없는 일정이 복원되지 않았습니다.")
    }

    private func dismissOnboardingIfNeeded(in app: XCUIApplication) {
        let laterButton = app.buttons["나중에"]
        if laterButton.waitForExistence(timeout: 2) {
            laterButton.tap()
        }
    }
}
