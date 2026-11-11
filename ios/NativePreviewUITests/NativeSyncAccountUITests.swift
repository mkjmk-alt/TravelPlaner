import XCTest

final class NativeSyncAccountUITests: XCTestCase {
    func testMoreOrganizesAccountSettingsAndSupport() {
        let app = XCUIApplication(); app.launchNativeTest()
        app.buttons["tab-more"].tap()
        XCTAssertTrue(app.buttons["moreAccountAction"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["moreSettingsSection"].exists)
        XCTAssertTrue(app.staticTexts["moreSupportSection"].exists)
        let disclosure = app.buttons["appOnlyFeaturesToggle"]
        XCTAssertTrue(disclosure.exists)
        XCTAssertFalse(app.buttons["backupImport"].exists)
        disclosure.tap()
        XCTAssertTrue(app.buttons["backupImport"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["syncAccountHeading"].exists)
        XCTAssertTrue(app.staticTexts["nativeMapKeyInfo"].exists)
    }

    func testLoginEntryPresentsGoogleAndEmailSignIn() throws {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-more"].tap()
        let entry = app.buttons["moreAccountAction"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10))
        entry.tap()
        let google = app.buttons["syncGoogleSignIn"]
        XCTAssertTrue(google.waitForExistence(timeout: 5), "로그인 진입점에서 Google 로그인이 바로 보여야 합니다")
        XCTAssertTrue(app.textFields["syncAuthEmail"].exists)
        XCTAssertTrue(app.secureTextFields["syncAuthPassword"].exists)
        XCTAssertFalse(app.buttons["syncAuthSubmit"].isEnabled)
        let mode = app.buttons["syncAuthModeToggle"]
        if !mode.isHittable { app.swipeUp() }
        XCTAssertTrue(mode.waitForExistence(timeout: 5))
        mode.tap()
        XCTAssertTrue(app.buttons["syncAuthSubmit"].label.contains("회원가입"))
    }

    func testMoreHeaderProvidesWebAccountEntryAndCompactNoTripLayout() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-more"].tap()

        let moreTitle = app.staticTexts["더보기"].firstMatch
        XCTAssertTrue(moreTitle.waitForExistence(timeout: 5))
        XCTAssertLessThanOrEqual(moreTitle.frame.minY, 145, "더보기 제목은 상단 브랜드 헤더 아래에 가깝게 시작해야 합니다")

        let headerAccountAction = app.buttons["brandAccountAction"]
        XCTAssertTrue(headerAccountAction.waitForExistence(timeout: 5), "더보기 상단에도 웹과 같은 로그인 진입 버튼이 있어야 합니다")
        XCTAssertFalse(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "여행을 하나 선택하면 기록·준비 메뉴가 열립니다")).firstMatch.exists,
            "여행 미선택 안내 문구가 공통 더보기 카드와 요약 사이에 끼어들지 않아야 합니다"
        )

        headerAccountAction.tap()
        let nativeFeatures = app.buttons["appOnlyFeaturesToggle"]
        XCTAssertTrue(nativeFeatures.waitForExistence(timeout: 5))
        XCTAssertEqual(nativeFeatures.value as? String, "펼침", "상단 로그인 버튼은 계정·동기화 설정을 열어야 합니다")
    }

    func testMoreNativeFeaturesAreCollapsedAndRemainAvailableOnDemand() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-more"].tap()

        XCTAssertTrue(app.buttons["moreAccountAction"].waitForExistence(timeout: 5), "웹과 같은 계정 메뉴가 더보기에 있어야 합니다")
        XCTAssertTrue(app.buttons["moreSupportTerms"].exists, "지원 및 약관 메뉴는 바로 보여야 합니다")
        XCTAssertTrue(app.staticTexts["moreSavedTripSummary"].exists, "저장 장소와 일정 수 요약은 바로 보여야 합니다")

        let disclosure = app.buttons["appOnlyFeaturesToggle"]
        XCTAssertTrue(disclosure.waitForExistence(timeout: 5), "앱 전용 기능은 접이식 메뉴로 제공되어야 합니다")
        XCTAssertFalse(app.buttons["backupImport"].exists, "기본 화면에서는 백업 기능이 접혀 있어야 합니다")
        XCTAssertFalse(app.staticTexts["syncAccountHeading"].exists, "기본 화면에서는 동기화 설정이 접혀 있어야 합니다")
        let mapKeyInfo = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "별도 네이티브 지도 키")).firstMatch
        XCTAssertFalse(mapKeyInfo.exists, "기본 화면에서는 지도 키 안내가 접혀 있어야 합니다")

        disclosure.tap()
        XCTAssertTrue(app.buttons["backupImport"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["syncAccountHeading"].waitForExistence(timeout: 5))
        XCTAssertTrue(mapKeyInfo.waitForExistence(timeout: 5))

        disclosure.tap()
        XCTAssertFalse(app.buttons["backupImport"].exists, "접으면 앱 전용 기능이 화면에서 숨겨져야 합니다")
    }

    func testSignedOutAccountSectionKeepsLocalTripsAvailableWithoutOfferingSync() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-more"].tap()
        app.buttons["appOnlyFeaturesToggle"].tap()

        XCTAssertTrue(app.staticTexts["syncAccountHeading"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["syncConfigurationMissing"].exists,
                      "공개 Supabase 설정이 없을 때 설정 방법을 알려야 합니다")
        XCTAssertTrue(app.staticTexts["localOnlyStatus"].exists,
                      "로그인 전에도 기기 여행을 계속 이용할 수 있어야 합니다")
        XCTAssertTrue(app.buttons["syncLoginButton"].exists)
        XCTAssertFalse(app.buttons["syncLoginButton"].isEnabled,
                       "설정이 없으면 인증 요청을 시작하면 안 됩니다")
        XCTAssertFalse(app.buttons["syncNowButton"].exists,
                       "로그인하지 않은 계정에는 동기화 동작을 노출하지 않습니다")
        XCTAssertFalse(app.buttons["syncConflictLink"].exists,
                       "로그인하지 않은 계정에는 다른 계정의 충돌 항목을 노출하지 않습니다")
    }
}
