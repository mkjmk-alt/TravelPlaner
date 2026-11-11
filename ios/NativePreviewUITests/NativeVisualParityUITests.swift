import XCTest

extension XCUIApplication {
    func launchNativeTest() {
        launchArguments += ["-native.hasSeenWelcome", "YES"]
        launch()
    }

    func launchFirstRun() {
        launchArguments += ["-native.hasSeenWelcome", "NO"]
        launch()
    }

    func nativeTab(_ label: String) -> XCUIElement {
        let routes = [
            "내 여행": "trips", "지도": "trips", "저장": "favorites",
            "지출": "budget", "예산·지출": "budget", "여행 기록": "memory", "더보기": "more"
        ]
        return buttons["tab-\(routes[label] ?? label)"]
    }

    func openTripListRoot() {
        nativeTab("내 여행").tap()
        let mapSearch = buttons["mapSearchButton"]
        for _ in 0..<8 {
            if mapSearch.waitForExistence(timeout: 1) { return }
            let back = buttons["tripListBack"]
            guard back.exists && back.isHittable else { break }
            back.tap()
        }
        XCTAssertTrue(mapSearch.waitForExistence(timeout: 5), "내 여행 탭의 지도 검색 버튼이 표시되어야 합니다")
    }
}

final class NativeVisualParityUITests: XCTestCase {
    private func attachScreen(_ name: String, in app: XCUIApplication) {
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = name
        capture.lifetime = .keepAlways
        add(capture)
    }

    func testSharedBrandHeaderAppearsAcrossTabsAndAccountActionOpensMore() {
        let app = XCUIApplication()
        app.launchNativeTest()

        for route in ["trips", "favorites", "budget", "memory", "more"] {
            let tab = app.buttons["tab-\(route)"]
            tab.tap()
            XCTAssertTrue(tab.isSelected, "\(route) 하단 탭이 실제로 선택되어야 합니다")
            let brandTitle = app.staticTexts["TripPlot"].firstMatch
            XCTAssertTrue(brandTitle.waitForExistence(timeout: 5),
                          "\(route) 탭에도 공통 TripPlot 헤더가 보여야 합니다")
            XCTAssertTrue(brandTitle.isHittable,
                          "\(route) 탭의 TripPlot 헤더는 현재 화면에 보여야 합니다")
            attachScreen("parity-brand-\(route)", in: app)
        }

        app.buttons["tab-favorites"].tap()
        let accountAction = app.buttons["brandAccountAction"]
        XCTAssertTrue(accountAction.waitForExistence(timeout: 5), "계정 동작은 공유 헤더에 있어야 합니다")
        XCTAssertTrue(accountAction.isHittable, "계정 버튼은 현재 화면에서 누를 수 있어야 합니다")
        accountAction.tap()
        XCTAssertTrue(app.buttons["tab-more"].isSelected, "계정 버튼은 계정 설정이 있는 더보기로 이동해야 합니다")
    }

    func testFirstRunWelcomeCanBeDismissedAndStaysDismissed() {
        let app = XCUIApplication()
        app.launchFirstRun()

        XCTAssertTrue(app.staticTexts["firstRunWelcomeTitle"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["firstRunWelcomeStep1"].exists)
        XCTAssertTrue(app.staticTexts["firstRunWelcomeStep2"].exists)
        XCTAssertTrue(app.staticTexts["firstRunWelcomeStep3"].exists)
        let welcomeCard = app.descendants(matching: .any)["firstRunWelcomeCard"]
        XCTAssertTrue(welcomeCard.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(welcomeCard.frame.minX, app.frame.minX)
        XCTAssertLessThanOrEqual(welcomeCard.frame.maxX, app.frame.maxX)
        XCTAssertLessThanOrEqual(abs(welcomeCard.frame.midY - app.frame.midY), app.frame.height * 0.12,
                                 "첫 실행 안내 카드는 화면 가운데에 맞춰 표시되어야 합니다")
        attachScreen("parity-first-run-welcome", in: app)
        app.buttons["welcomeLater"].tap()

        let hidden = NSPredicate(format: "exists == false")
        expectation(for: hidden, evaluatedWith: app.buttons["welcomeLater"])
        waitForExpectations(timeout: 5)

        app.terminate()
        app.launchArguments = []
        app.launch()
        app.openTripListRoot()
        XCTAssertTrue(app.buttons["newTripButton"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["welcomeLater"].exists, "나중에를 선택하면 다음 실행에 안내를 다시 띄우지 않아야 합니다")
    }

    func testFirstRunWelcomeStartsTripCreation() {
        let app = XCUIApplication()
        app.launchFirstRun()

        XCTAssertTrue(app.buttons["welcomeCreateTrip"].waitForExistence(timeout: 5))
        app.buttons["welcomeCreateTrip"].tap()
        XCTAssertTrue(app.textFields["tripNameField"].waitForExistence(timeout: 5))
    }

    func testKeylessMapAndSavedPlaceCard() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.openTripListRoot()
        app.buttons["mapSearchButton"].tap()
        XCTAssertTrue(app.buttons["mapTripPicker"].waitForExistence(timeout: 5))
        app.buttons["closeMapSearch"].tap()
        app.nativeTab("저장").tap()
        app.buttons["savedPlaceAddManual"].tap()
        let name = "ParityPlace-\(UUID().uuidString.prefix(6))"
        let field = app.textFields["savedPlaceName"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(name)
        app.buttons["savedPlaceSave"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "saved-place-card-")).firstMatch.waitForExistence(timeout: 5))
    }

    func testBudgetWithoutSelectedTripOffersNavigationToTrips() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-budget"].tap()

        let goToTrips = app.buttons["budgetGoToTrips"]
        XCTAssertTrue(goToTrips.waitForExistence(timeout: 5), "여행 미선택 안내에는 웹처럼 내 여행으로 이동하는 버튼이 있어야 합니다")
        attachScreen("parity-budget-requires-trip", in: app)
        goToTrips.tap()
        XCTAssertTrue(app.buttons["mapSearchButton"].waitForExistence(timeout: 5), "버튼을 누르면 여행을 선택할 수 있는 내 여행 화면으로 이동해야 합니다")
    }

    func testMemoryWithoutSelectedTripUsesWebNoticeCard() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.nativeTab("여행 기록").tap()

        let card = app.descendants(matching: .any)["memoryTripRequiredCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 5), "여행 미선택 기록 화면은 웹과 같은 안내 카드로 보여야 합니다")
        let goToTrips = app.buttons["memoryGoToTrips"]
        XCTAssertTrue(goToTrips.isHittable,
                      "안내 카드의 내 여행 이동 버튼을 바로 사용할 수 있어야 합니다")
        attachScreen("parity-memory-requires-trip", in: app)
        goToTrips.tap()
        XCTAssertTrue(app.buttons["mapSearchButton"].waitForExistence(timeout: 5),
                      "내 여행으로 이동 버튼은 여행 목록으로 연결되어야 합니다")
    }

    func testExpenseAndMoreLayout() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.nativeTab("내 여행").tap()
        for _ in 0..<5 {
            if app.buttons["newTripButton"].exists { break }
            let back = app.buttons["tripListBack"]
            guard back.exists && back.isHittable else { break }
            back.tap()
        }
        app.buttons["newTripButton"].tap()
        let tripName = "ExpenseParity-\(UUID().uuidString.prefix(6))"
        let nameField = app.textFields["tripNameField"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.tap()
        nameField.typeText(tripName)
        app.buttons["saveTripButton"].tap()
        app.nativeTab("지출").tap()
        XCTAssertTrue(app.descendants(matching: .any)["expense-page"].waitForExistence(timeout: 5))
        app.buttons["addExpense"].tap()
        let amount = app.textFields["expenseAmount"]
        XCTAssertTrue(amount.waitForExistence(timeout: 5))
        amount.tap()
        amount.typeText("200")
        XCTAssertTrue(app.buttons["saveExpense"].isHittable)
        let converted = app.textFields["expenseAmountKRW"]
        converted.tap()
        converted.typeText("200")
        app.buttons["saveExpense"].tap()
        let delete = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "deleteExpense-")).firstMatch
        XCTAssertTrue(delete.waitForExistence(timeout: 5), "지출 카드에서 삭제를 누를 수 있어야 합니다")
        delete.tap()
        app.alerts.buttons["삭제"].tap()
        app.nativeTab("더보기").tap()
        app.buttons["appOnlyFeaturesToggle"].tap()
        XCTAssertTrue(app.buttons["backupImport"].waitForExistence(timeout: 5))
        app.buttons["backupImport"].tap()
        XCTAssertTrue(app.navigationBars["여행 백업"].waitForExistence(timeout: 5))
    }

    func testTripListVisualHierarchyAndSelection() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.openTripListRoot()

        app.buttons["newTripButton"].tap()
        let name = "VisualQA-\(UUID().uuidString.prefix(6))"
        let field = app.textFields["tripNameField"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(name)
        app.buttons["saveTripButton"].tap()
        XCTAssertTrue(app.navigationBars[name].waitForExistence(timeout: 5))
        app.buttons["tripListBack"].tap()

        let featured = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trip-")).firstMatch
        XCTAssertTrue(featured.waitForExistence(timeout: 5))
        XCTAssertEqual(featured.value as? String, "대표 여행")
        attachScreen("parity-trip-list", in: app)
        featured.tap()
        XCTAssertTrue(app.buttons["editTripButton"].waitForExistence(timeout: 5))
        attachScreen("parity-trip-detail", in: app)
    }

    func testTabNavigationAndSafeArea() {
        let app = XCUIApplication()
        app.launchNativeTest()

        for route in ["trips", "favorites", "budget", "memory", "more"] {
            let tab = app.buttons["tab-\(route)"]
            XCTAssertTrue(tab.waitForExistence(timeout: 5), "\(route) 탭이 표시되어야 합니다")
            XCTAssertTrue(tab.isHittable)
            XCTAssertGreaterThanOrEqual(tab.frame.height, 44)
            XCTAssertLessThanOrEqual(tab.frame.maxY, app.frame.maxY)
        }

        XCTAssertFalse(app.buttons["tab-map"].exists, "지도는 하단 탭이 아니라 내 여행 흐름에서 열려야 합니다")
        app.openTripListRoot()
        app.buttons["mapSearchButton"].tap()
        XCTAssertTrue(app.buttons["mapTripPicker"].waitForExistence(timeout: 5))
        attachScreen("parity-map", in: app)
        app.buttons["closeMapSearch"].tap()
        app.buttons["tab-favorites"].tap()
        XCTAssertTrue(app.buttons["savedPlaceAddManual"].waitForExistence(timeout: 5))
        attachScreen("parity-saved", in: app)
        app.buttons["tab-budget"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["expense-page"].waitForExistence(timeout: 5))
        attachScreen("parity-expenses", in: app)
        app.buttons["tab-memory"].tap()
        XCTAssertTrue(app.buttons["tab-memory"].isSelected)
        attachScreen("parity-memory", in: app)
        app.buttons["tab-more"].tap()
        XCTAssertTrue(app.buttons["appOnlyFeaturesToggle"].waitForExistence(timeout: 5))
        attachScreen("parity-more", in: app)
        XCTAssertTrue(app.buttons["tab-more"].isSelected)

        app.terminate()
        app.launchNativeTest()
        XCTAssertTrue(app.buttons["tab-more"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab-more"].isSelected)
        app.buttons["tab-trips"].tap()
        XCTAssertTrue(app.buttons["tab-trips"].isSelected)
    }

    func testTripsTabContentReturnsAfterRelaunchFromMoreTab() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-more"].tap()
        XCTAssertTrue(app.buttons["appOnlyFeaturesToggle"].waitForExistence(timeout: 5))
        app.buttons["appOnlyFeaturesToggle"].tap()
        XCTAssertTrue(app.buttons["backupImport"].waitForExistence(timeout: 5))

        app.terminate()
        app.launchNativeTest()
        XCTAssertTrue(app.buttons["appOnlyFeaturesToggle"].waitForExistence(timeout: 5),
                      "다시 실행하면 앱 전용 기능은 접힌 상태로 시작해야 합니다")
        app.buttons["appOnlyFeaturesToggle"].tap()
        XCTAssertTrue(app.buttons["backupImport"].waitForExistence(timeout: 5),
                      "더보기에서 앱을 다시 열면 기존 탭의 콘텐츠가 복원되어야 합니다")
        let moreSelected = NSPredicate(format: "isSelected == true")
        expectation(for: moreSelected, evaluatedWith: app.buttons["tab-more"])
        waitForExpectations(timeout: 5)
        app.buttons["tab-trips"].tap()
        attachScreen("parity-trips-after-more-relaunch", in: app)

        XCTAssertTrue(app.buttons["mapSearchButton"].waitForExistence(timeout: 5),
                      "앱을 더보기에서 다시 열어도 내 여행 탭 콘텐츠가 표시되어야 합니다")
    }

    func testLegacyExpenseTabRouteRestoresToBudgetTab() {
        let app = XCUIApplication()
        app.launchArguments += ["-native.selectedTab", "expenses"]
        app.launchNativeTest()

        let budgetTab = app.buttons["tab-budget"]
        XCTAssertTrue(budgetTab.waitForExistence(timeout: 5))
        let selected = NSPredicate(format: "isSelected == true")
        expectation(for: selected, evaluatedWith: budgetTab)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(app.descendants(matching: .any)["expense-page"].waitForExistence(timeout: 5))
    }

    func testTripsMapPreviewAndListRemainAvailable() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.openTripListRoot()

        let mapPreview = app.descendants(matching: .any)["tripsMapPreview"]
        XCTAssertTrue(mapPreview.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["mapSearchButton"].exists)
        XCTAssertTrue(app.buttons["newTripButton"].exists)
        XCTAssertTrue(app.buttons["tab-trips"].isHittable)
        XCTAssertGreaterThan(app.buttons["mapSearchButton"].frame.minY, mapPreview.frame.minY + 40,
                             "지도 검색은 상태 표시줄 아래에서 눌릴 수 있어야 합니다")
        XCTAssertLessThanOrEqual(mapPreview.frame.minY, app.frame.minY + 4,
                                 "지도 미리보기는 웹처럼 화면 상단부터 시작해야 합니다. map=\(mapPreview.frame), app=\(app.frame)")
        XCTAssertLessThanOrEqual(mapPreview.frame.minY, 4,
                                 "지도 배경은 iPhone 상태 영역까지 이어져야 합니다. map=\(mapPreview.frame)")
        XCTAssertGreaterThanOrEqual(mapPreview.frame.height, app.frame.height * 0.49,
                                    "지도 높이는 웹 기본 화면의 절반 정도여야 합니다. map=\(mapPreview.frame), app=\(app.frame)")
        XCTAssertTrue(app.staticTexts["아직 계획된 여행이 없습니다"].exists,
                       "빈 여행 목록은 웹의 안내 문구와 같아야 합니다")
        let emptyHint = app.staticTexts["새 여행을 만들고 장소를 검색해 일정에 추가해 보세요."]
        XCTAssertTrue(emptyHint.exists,
                       "빈 여행 목록은 웹의 다음 단계 안내를 보여야 합니다")
        let listScrollView = app.scrollViews["tripsListScrollView"]
        XCTAssertTrue(listScrollView.exists)
        XCTAssertLessThanOrEqual(emptyHint.frame.maxY, listScrollView.frame.maxY,
                                 "빈 안내는 실제 목록 스크롤 영역 안에 있어야 합니다. hint=\(emptyHint.frame), list=\(listScrollView.frame)")
        let tripsTab = app.buttons["tab-trips"]
        XCTAssertLessThanOrEqual(emptyHint.frame.maxY, tripsTab.frame.minY,
                                 "빈 여행 안내가 하단 탭 영역보다 위에 보여야 합니다")
        XCTAssertFalse(app.staticTexts["첫 여행을 만들어보세요"].exists,
                       "네이티브에만 있는 빈 화면 문구가 남으면 안 됩니다")
        XCTAssertFalse(app.staticTexts["0개"].exists,
                       "여행 개수는 웹에 없는 값이므로 빈 목록 헤더에서 숨겨야 합니다")
        attachScreen("parity-trips-map-preview", in: app)
    }

    func testTripsListFillsSpaceAboveCustomTabBar() {
        let app = XCUIApplication()
        app.launchArguments += ["-native.selectedTab", "trips"]
        app.launchNativeTest()
        app.nativeTab("내 여행").tap()
        let mapSearch = app.buttons["mapSearchButton"]
        XCTAssertTrue(mapSearch.waitForExistence(timeout: 5), app.debugDescription)

        let listScrollView = app.scrollViews["tripsListScrollView"]
        XCTAssertTrue(listScrollView.waitForExistence(timeout: 5))
        let tripsTab = app.buttons["tab-trips"]
        XCTAssertTrue(tripsTab.exists)

        XCTAssertGreaterThanOrEqual(
            listScrollView.frame.maxY,
            tripsTab.frame.minY - 48,
            "여행 목록과 커스텀 하단 메뉴 사이에 숨겨진 시스템 탭바 높이만큼 빈 공간이 남으면 안 됩니다"
        )
    }

    func testAiItineraryShortcutImportsWebJSON() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.openTripListRoot()

        XCTAssertTrue(app.buttons["newTripButton"].exists, "새 여행 동작이 웹처럼 상단 바로가기에 있어야 합니다")
        let shortcut = app.buttons["aiItineraryButton"]
        XCTAssertTrue(shortcut.waitForExistence(timeout: 5), "내 여행 상단에 AI 일정 바로가기가 있어야 합니다")
        XCTAssertTrue(app.buttons["joinTripButton"].exists, "웹과 같은 참여 동작을 명시적으로 표시해야 합니다")
        XCTAssertTrue(app.buttons["accountActionButton"].exists, "웹과 같은 계정 동작을 명시적으로 표시해야 합니다")
        app.buttons["joinTripButton"].tap()
        XCTAssertTrue(app.alerts["여행 참여 기능 준비 중"].waitForExistence(timeout: 5))
        app.alerts.buttons["확인"].tap()
        shortcut.tap()

        let editor = app.textViews["aiItineraryJSON"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5), "웹에서 쓰는 JSON 붙여넣기 흐름을 제공해야 합니다")
        app.scrollViews.firstMatch.swipeUp()
        app.scrollViews.firstMatch.swipeUp()
        XCTAssertTrue(editor.isHittable, "JSON 입력칸을 스크롤해 조작할 수 있어야 합니다")
        editor.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.12)).tap()
        editor.typeText("""
        ```json
        {"name":"Parity AI Trip","country":"Japan","startDate":"2026-11-01","endDate":"2026-11-01","itinerary":[{"day":1,"items":[]}]}
        ```
        """)
        app.buttons["importAIItinerary"].tap()

        XCTAssertTrue(app.staticTexts["Parity AI Trip"].waitForExistence(timeout: 5), "가져오기 전에 일정 미리보기를 보여야 합니다")
        app.buttons["confirmAIImport"].tap()
        XCTAssertTrue(app.buttons["tripListBack"].waitForExistence(timeout: 5), "저장한 AI 일정의 상세 화면으로 이동해야 합니다")
        XCTAssertTrue(app.staticTexts["Parity AI Trip"].exists)
    }

    func testPrimaryTripActionUsesWebPurpleAccent() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.buttons["tab-trips"].tap()

        let createTrip = app.buttons["newTripButton"]
        for _ in 0..<6 where !createTrip.exists {
            let back = app.buttons["tripListBack"]
            guard back.exists else { break }
            back.tap()
        }
        XCTAssertTrue(createTrip.waitForExistence(timeout: 5))

        guard let image = createTrip.screenshot().image.cgImage else {
            XCTFail("여행 만들기 버튼을 캡처할 수 있어야 합니다")
            return
        }
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
        let rendered = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: bitmapInfo
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard rendered else {
            XCTFail("버튼 색상을 읽을 수 있어야 합니다")
            return
        }
        let offset = ((height / 2) * width + width / 8) * 4
        let actual = Array(pixels[offset..<(offset + 3)]).map(Int.init)
        let webPurpleVariants = [[0x8B, 0x5C, 0xF6], [0xA7, 0x8B, 0xFA]]
        let usesWebPurple = webPurpleVariants.contains { expected in
            zip(actual, expected).allSatisfy { pair in abs(pair.0 - pair.1) <= 18 }
        }
        XCTAssertTrue(usesWebPurple, "웹 보라색 계열 버튼이어야 합니다. 실제 RGB: \(actual)")
    }

}
