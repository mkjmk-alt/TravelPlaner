# SwiftUI Android Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `TripPlotNativePreview`의 다섯 탭과 하위 화면을 Android `nativepreview`의 색상·여백·카드·하단 메뉴 비율에 맞춘다.

**Architecture:** Android Compose 테마를 기준으로 SwiftUI 전용 공유 스타일과 탭바를 만든다. 각 SwiftUI 화면은 해당 스타일을 참조하되 `NativeTripStore`, 지도 렌더링, 여행/지출 저장 로직은 유지한다. 작업 중인 사용자 변경은 덮어쓰지 않는다.

**Tech Stack:** SwiftUI, XCUITest, Xcode Simulator; 비교 기준은 Kotlin/Jetpack Compose 소스.

**Spec:** [SwiftUI Android visual parity design](../specs/2026-09-27-swiftui-android-visual-parity-design.md)

## Global Constraints

- 대상은 `TripPlotNativePreview`만이다. WebView `TravelPlaner`, Android, 웹/서버 코드, 저장 데이터 형식은 변경하지 않는다.
- Android light/dark 색상 역할과 20pt 기본 좌우 여백, 24pt 상단 여백, 54pt 주요 버튼, 18/21/26pt 모서리 기준을 따른다.
- 다섯 탭과 기존 여행 선택·편집·지도·저장·지출·정산·더보기 흐름, 접근성 식별자를 유지한다.
- 안전 영역, Dynamic Type, VoiceOver, 44pt 이상의 터치 영역, 지도 키 미설정 상태를 지원한다.
- 기존의 미커밋 사용자 변경을 보존한다. 다른 파일을 한꺼번에 stage/commit하지 않는다.

## Review Focus

1. 저장된 탭이 상세 화면을 가리킬 때 재실행해도 선택 상태와 탭 이동이 정상인가? Task 1 UI 테스트로 확인한다.
2. 작은 iPhone에서 큰 글자와 홈 인디케이터 때문에 CTA나 하단 탭이 가려지지 않는가? Task 1/5 시뮬레이터 확인으로 검증한다.
3. 지도 키가 없어도 지도 밖의 검색·저장·탭 전환이 가능한가? Task 3 UI 테스트로 확인한다.
4. 지출·정산 입력 중 키보드가 버튼을 가리는가? Task 4 UI 테스트로 확인한다.
5. 일정/지도 분할 손잡이와 하단 탭바가 겹쳐 크기 조절을 방해하는가? Task 2 기존 `SplitWorkspaceUITests`로 확인한다.

---

### Task 1: 공유 테마와 다섯 탭

**Files:**
- Create: `ios/NativePreview/NativePreviewTheme.swift`, `ios/NativePreview/NativeTabBar.swift`
- Modify: `ios/NativePreview/NativeRootView.swift`, `ios/NativePreview/TripPlotNativePreviewApp.swift`
- Test: `ios/NativePreviewUITests/NativeVisualParityUITests.swift`; 기존 `ios/NativePreviewUITests/*.swift`의 탭 찾기 헬퍼

**Interfaces:** `NativePreviewTheme`는 `primary`, `primaryContainer`, `background`, `card`, `textPrimary`, `textMuted`의 동적 `Color`와 `screenPadding: CGFloat = 20`, `sectionSpacing: CGFloat = 24`, `primaryButtonHeight: CGFloat = 54`, `featuredCardRadius: CGFloat = 26`, `cardRadius: CGFloat = 21`을 제공한다. `NativeTabBar(selection: Binding<String>)`는 `trips/map/favorites/expenses/more` 문자열 선택을 받으며 각 버튼의 `tab-<route>` 접근성 ID를 제공한다.

- [ ] **Step 1:** `testTabNavigationAndSafeArea`를 추가해 다섯 탭의 존재·전환·재실행 후 선택 상태, 탭 버튼 44pt 이상 높이를 단언한다.
- [ ] **Step 2:** 새 테스트가 현재 기본 탭바와 ID 차이로 실패함을 확인한다. `xcodebuild -project ios/TravelPlaner.xcodeproj -scheme TripPlotNativePreview -destination 'platform=iOS Simulator,id=3081E2CF-3CDB-491E-9A45-6858DA1D606A' -only-testing:TripPlotNativePreviewUITests/NativeVisualParityUITests/testTabNavigationAndSafeArea test CODE_SIGNING_ALLOWED=NO`
- [ ] **Step 3:** 두 공유 파일과 `NativeRootView`에 Android 기준 색상/비율·사용자 정의 안전 영역 탭바를 구현한다. 기존 `TabView`의 탭별 `NavigationStack`과 `@AppStorage` 상태를 유지한다.
- [ ] **Step 4:** 새 UI 테스트와 기존 탭 전환 테스트를 통과시키고 작은 iPhone에서도 하단 버튼이 보이는지 스크린샷으로 확인한다.
- [ ] **Step 5:** 이 Task의 파일만 diff로 검토한다. 기존 미커밋 변경이 포함된 파일은 임의로 커밋하지 않는다.

### Task 2: 내 여행·상세·일정 화면

**Files:**
- Modify: `ios/NativePreview/TripListView.swift`, `ios/NativePreview/TripEditorView.swift`, `ios/NativePreview/TripWorkspaceView.swift`, `ios/NativePreview/ItineraryContent.swift`
- Test: `ios/NativePreviewUITests/NativeVisualParityUITests.swift`, 기존 `NativeTripUITests.swift`, `SplitWorkspaceUITests.swift`

**Interfaces:** Task 1의 `NativePreviewTheme`를 사용한다. 기존 여행 관련 접근성 ID와 `TripDetailView`의 여행 전환 인터페이스는 그대로 둔다.

- [ ] **Step 1:** `testTripListVisualHierarchyAndSelection`을 추가해 고유 이름의 여행을 생성하고 대표 여행 카드의 `featuredTripCard` 식별자·새 여행 버튼·카드 선택 후 상세 이동을 확인한다. 날짜가 다른 여행을 추가해 다른 여행/지난 여행 제목도 확인한다.
- [ ] **Step 2:** 새 테스트를 실행해 변경 전 시각 구조 또는 선택 상태 조건의 실패를 확인한다.
- [ ] **Step 3:** 여행 목록의 보라색·카드/헤더/버튼 비율을 Android 값으로 바꾸고, 편집·상세·일정/지도 분할의 공통 여백과 표면을 조정한다. 분할 계산식/마커와 저장 로직은 변경하지 않는다.
- [ ] **Step 4:** 새 테스트, 여행 생성/편집, `SplitWorkspaceUITests`를 실행하고 대표 여행 카드 및 지도 50:50 상태를 캡처한다.
- [ ] **Step 5:** 이 Task의 diff에서 여행 데이터·분할 계산 변경이 없는지 검토한다.

### Task 3: 지도·저장 장소 화면

**Files:**
- Modify: `ios/NativePreview/Map/PlaceSearchView.swift`, `ios/NativePreview/Map/SavedPlacesView.swift`, `ios/NativePreview/Map/PlaceDetailView.swift`, `ios/NativePreview/Map/PlaceDestinationView.swift`, `ios/NativePreview/PlaceEditorView.swift`
- Test: `ios/NativePreviewUITests/NativeVisualParityUITests.swift`, 기존 저장 장소 UI 테스트

**Interfaces:** Task 1의 테마를 적용한다. `MapConfiguration`, `NativeMapPane`, `PlaceSelection`, `NativeTripStore` 인터페이스와 Google 지도 키 처리에는 손대지 않는다.

- [ ] **Step 1:** `testKeylessMapAndSavedPlacesRemainUsable`을 추가해 지도 키가 없는 상태의 지도 탭, 저장 탭, 직접 등록 버튼 및 탭 전환을 확인한다. 직접 등록으로 고유 이름의 장소를 하나 만든 뒤 새 저장 장소 카드의 `saved-place-card` 식별자도 단언한다.
- [ ] **Step 2:** 새 테스트의 변경 전 실패를 확인한다.
- [ ] **Step 3:** 검색·선택·지도 조작 버튼, 저장 장소의 카드/빈 상태/편집 행을 Android 간격·색상으로 조정한다.
- [ ] **Step 4:** 새 테스트 및 기존 장소 저장 흐름을 실행하고 지도 키 없는 상태의 화면을 캡처한다.
- [ ] **Step 5:** 지도 좌표·검색·권한·저장 데이터 로직의 diff가 없는지 확인한다.

### Task 4: 지출·정산·더보기 하위 화면

**Files:**
- Modify: `ios/NativePreview/ExpenseView.swift`, `ios/NativePreview/NativeRootView.swift`, `ios/NativePreview/TravelMemoryView.swift`, `ios/NativePreview/TravelPrepView.swift`, `ios/NativePreview/TravelDetailsView.swift`, `ios/NativePreview/TripBackupView.swift`
- Test: `ios/NativePreviewUITests/NativeVisualParityUITests.swift`, 기존 지출/백업/기록 UI 테스트

**Interfaces:** Task 1의 테마와 탭을 사용한다. 정산 계산, 사진/파일 시스템 UI, 여행 JSON 데이터 계약은 그대로 둔다.

- [ ] **Step 1:** `testExpenseMoreAndEditorSafeArea`를 추가해 고유 이름의 여행을 만든 뒤 지출·더보기 탭, 지출 목록의 `expense-page` 식별자, 지출 추가 폼의 저장 버튼과 키보드 상태, 백업 진입을 확인한다.
- [ ] **Step 2:** 새 테스트를 실행해 변경 전 실패를 확인한다.
- [ ] **Step 3:** 목록·입력 행·빈 상태·카드·주요 버튼을 공통 규칙으로 정리하고 시스템 사진/파일 선택 UI는 유지한다.
- [ ] **Step 4:** 새 테스트 및 기존 정산/백업/기록 흐름을 실행한다.
- [ ] **Step 5:** 계산·파일 입출력 변경이 없는지 diff로 확인한다.

### Task 5: 전체 시각·접근성 회귀 검증

**Files:**
- Modify: 위 화면 중 검증에서 간격/잘림이 드러난 파일만
- Test: `ios/NativePreviewUITests/NativeVisualParityUITests.swift`

**Interfaces:** 새 기능 없음. Task 1~4의 결과를 Android 기준 시뮬레이터 이미지와 비교한다.

- [ ] **Step 1:** iPhone 17e와 17 Pro의 첫 화면·다섯 탭·대표 하위 화면을 캡처하고 Android 기준 이미지와 콘텐츠 시작선/카드 폭/CTA/탭바를 비교한다.
- [ ] **Step 2:** Dynamic Type 확대, 다크 모드, 키보드 표시, 지도 키 없는 상태를 살펴 잘림/비활성 조작을 기록한다.
- [ ] **Step 3:** 발견된 표시 문제만 수정하고 관련 UI 테스트를 다시 실행한다.
- [ ] **Step 4:** `xcodebuild -project ios/TravelPlaner.xcodeproj -scheme TripPlotNativePreview -configuration Debug -destination 'platform=iOS Simulator,id=3081E2CF-3CDB-491E-9A45-6858DA1D606A' CODE_SIGNING_ALLOWED=NO build`와 관련 UI 테스트가 종료 코드 0인지 확인한다.
- [ ] **Step 5:** `git diff --check`와 전체 변경 목록을 확인하고, 수정 범위·검증 결과·남은 플랫폼 차이를 사용자에게 보고한다. 푸시/배포는 하지 않는다.
