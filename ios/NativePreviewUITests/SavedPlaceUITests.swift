import XCTest

final class SavedPlaceUITests:XCTestCase {
    func testSavedPlaceSearchStartsCollapsedAndCanExpand() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.nativeTab("저장").tap()

        let searchButton = app.buttons["savedPlaceToggleSearch"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 5), "저장 제목 옆에 검색 버튼이 있어야 합니다")
        XCTAssertFalse(app.textFields["savedPlaceSearch"].exists, "검색창은 처음에는 접혀 있어야 합니다")

        searchButton.tap()
        XCTAssertTrue(app.textFields["savedPlaceSearch"].waitForExistence(timeout: 5), "검색 버튼을 누르면 검색창이 펼쳐져야 합니다")
        searchButton.tap()
        XCTAssertFalse(app.textFields["savedPlaceSearch"].exists, "검색 버튼을 다시 누르면 검색창이 접혀야 합니다")
    }

    func testSavedPlaceEmptyCardUsesCompactHeight() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.nativeTab("저장").tap()

        let emptyCard = app.descendants(matching: .any)["savedPlaceEmptyCard"]
        XCTAssertTrue(emptyCard.waitForExistence(timeout: 5), "저장 장소가 없으면 압축된 빈 상태 카드가 있어야 합니다")
        XCTAssertGreaterThanOrEqual(emptyCard.frame.height, 140, "빈 상태 카드가 너무 작아서는 안 됩니다")
        XCTAssertLessThanOrEqual(emptyCard.frame.height, 175, "빈 상태 카드는 약 150pt로 표시되어야 합니다")
    }

    func testSavedPlaceEmptyStateMatchesWebCopy() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.nativeTab("저장").tap()

        XCTAssertTrue(app.staticTexts["저장한 장소가 없습니다"].waitForExistence(timeout: 5),
                      "저장한 장소가 없을 때 웹과 같은 빈 상태를 보여야 합니다")
        XCTAssertTrue(app.images["savedPlaceEmptyHeart"].exists,
                      "저장 화면의 빈 상태는 하트 윤곽 아이콘을 보여야 합니다")
    }

    func testSavedPlacePrimaryActionUsesWebFavoritesAccent() {
        let app = XCUIApplication()
        app.launchNativeTest()
        app.nativeTab("저장").tap()

        let add = app.buttons["savedPlaceAddManual"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        guard let image = add.screenshot().image.cgImage else {
            XCTFail("저장 장소 추가 버튼을 캡처할 수 있어야 합니다")
            return
        }

        var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
        let rendered = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: image.width,
                height: image.height,
                bitsPerComponent: 8,
                bytesPerRow: image.width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: bitmapInfo
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        XCTAssertTrue(rendered, "버튼 색상을 읽을 수 있어야 합니다")

        let offset = ((image.height / 4) * image.width + image.width / 2) * 4
        let actual = Array(pixels[offset..<(offset + 3)]).map(Int.init)
        let webFavoritesAccent = [0xE1, 0x1D, 0x48]
        XCTAssertTrue(zip(actual, webFavoritesAccent).allSatisfy { abs($0.0 - $0.1) <= 18 },
                      "저장 화면의 주요 동작은 웹의 장미색 테마여야 합니다. 실제 RGB: \(actual)")
    }

    func testManualFavoritePersistsAfterRelaunchWithNoKey() {
        let app=XCUIApplication(); app.launchNativeTest(); app.nativeTab("저장").tap()
        let add=app.buttons["savedPlaceAddManual"]
        XCTAssertTrue(add.waitForExistence(timeout:5))
        guard add.exists else { return }; add.tap()
        let name="MapQA-" + UUID().uuidString.prefix(8)
        app.textFields["savedPlaceName"].tap(); app.textFields["savedPlaceName"].typeText(name)
        app.buttons["savedPlaceSave"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout:5))
        app.terminate(); app.launchNativeTest(); app.nativeTab("저장").tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout:5))
        app.openTripListRoot()
        app.buttons["mapSearchButton"].tap()
        XCTAssertTrue(app.descendants(matching:.any)["nativeMapUnavailable"].firstMatch.waitForExistence(timeout:5), app.debugDescription)
        XCTAssertEqual(app.webViews.count,0)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "stage3-keyless-map"; capture.lifetime = .keepAlways; self.add(capture)
        app.buttons["closeMapSearch"].tap()
    }
}
