import XCTest
@testable import NativeCore

final class SplitLayoutTests:XCTestCase {
    func testCameraRestorationRejectsInvalidPrimitives() {
        XCTAssertNil(MapCameraSnapshot(values:[.nan,0,16,0,0]))
        XCTAssertNil(MapCameraSnapshot(values:[0,0,100,0,0]))
        XCTAssertNil(MapCameraSnapshot(values:[91,0,16,0,0]))
        XCTAssertNil(MapCameraSnapshot(values:[0]))
        XCTAssertEqual(MapCameraSnapshot(values:[35,139,16,45,20])?.values,[35,139,16,45,20])
    }
    func testFreeResizeReleaseRestoreAndInvalidValues() {
        let value=SplitLayout.resize(startRatio:0.5,delta:-137,extent:1000)
        XCTAssertEqual(value,0.363,accuracy:0.000001)
        XCTAssertEqual(SplitLayout.commit(value),value)
        XCTAssertEqual(SplitLayout.restore(value),value)
        for extent in [0, -10, Double.nan, .infinity] { XCTAssertEqual(SplitLayout.resize(startRatio:value,delta:40,extent:extent),value) }
        for value in [0,1,Double.nan,.infinity,-1] { XCTAssertEqual(SplitLayout.restore(value),0.5) }
        XCTAssertEqual(SplitLayout.commit(.nan),0.5)
        XCTAssertEqual(SplitLayout.resize(startRatio:0.5,delta:100,extent:1),1)
        XCTAssertEqual(SplitLayout.resize(startRatio:0.5,delta:-100,extent:1),0)
        XCTAssertEqual(SplitLayout.resize(startRatio:0.363,delta:.nan,extent:100),0.363)
    }
    func testAxisUsesAvailableContainerNotDeviceName() {
        XCTAssertFalse(SplitLayout.isHorizontal(width:839,height:600))
        XCTAssertFalse(SplitLayout.isHorizontal(width:900,height:599))
        XCTAssertFalse(SplitLayout.isHorizontal(width:840,height:1000))
        XCTAssertTrue(SplitLayout.isHorizontal(width:840,height:600))
    }
}
