# TripPlot 네이티브 지도·저장·자유 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 사용자 “네 구현해주세요.” 승인(ID `jpoHrBrgr1`) 후 같은 세션에서 구현 중이다. 후속 “이어서 진행해주세요”(ID `3da865e4be`)도 같은 범위를 이어간다. 실제 키 검증 전 전체 단계 완료로 표시하지 않는다. 요청 ID `Z6pN4xR8Lm`에 따라 실제 키 검증은 다음 지출·정산 단계 뒤로 보류하며, 그 시점에 다시 리마인드한다.

**Goal:** 별도 네이티브 미리보기에 Google 지도·검색·현재 위치·일정 마커·저장 장소를 연결하고, 지도와 일정을 실제 독립 영역으로 자유롭게 분할한다.

**Architecture:** SDK 객체는 화면 어댑터 안에만 둔다. 장소 참조·사용자 입력·일정 변경·즐겨찾기는 Core Data/Room에서 관리하며 지도 카메라 상태와 저장 데이터를 분리한다. 검색 결과 및 지도 장애가 일정 저장·하단 탭·백업으로 전파되지 않게 한다.

**Tech Stack:** 기존 SwiftUI/Core Data, Kotlin 2.2.21/Compose/Room 2.8.3. iOS GoogleMaps/GooglePlaces SPM 10.15.0, Android play-services-maps 20.0.0 / places 5.3.0 고정 후보. iOS UIViewRepresentable와 Android AndroidView(MapView)로 SDK를 좁게 감싼다. Maps Compose 추가 의존성은 사용하지 않는다.

**Spec:** `docs/superpowers/specs/2026-09-20-tripplot-native-ui-design.md`의 3단계. 2단계 기준선은 `docs/native-itinerary-transfer-verification.md`.

**Request ID:** `qcb9WbfOci`, `H3mQ7vL2Xa`, `B7nR2xK9Qp`, `F4mK8qR2Zx` · 2026-09-21~22 · “다음 단계 진행”.

## Execution status — 2026-09-22

- Task 1·2 implementation and keyless verification are complete; the ledger and verification report contain the actual counts.
- Task 3·4·5·6 remain open for configured-provider acceptance. iOS UI is 7/7 and Android device UI is 19/20; the sole Android failure is the API 36 DocumentsUI synthetic-file return path, not a confirmed product failure.
- Latest local evidence: Swift NativeCore 44/44, Android JVM 40/40, iOS UI 7/7, Android device UI 19/20 in the full run plus the changed saved-place flow 2/2, web/security/build pass, Android nativepreview/app builds and lint pass.
- Additional keyless fixes: iOS map-trip selection no longer rewrites the Trips navigation path; Android nested “new trip” drafts use independent SavedState and operation IDs. Both changes have focused regression evidence.
- Android system-back boundaries are now covered by a focused SavedPlaces UI run: 5/5 passed for saved-place detail, itinerary destination, and nested new-trip draft. Each internal screen consumes Back locally before the outer tab NavHost can pop.
- Android top-level native routes now also declare their intended Back behavior: trip detail, trip editor, split itinerary workspace, place editor, and backup screen. The route-boundary test passed 1/1, and the saved-place/split regression group passed 6/6.
- An external ADB cold-launch smoke on the API 36 AVD confirmed that the last trip detail is restored after force-stop. The attempted in-process instrumentation variant was removed because it force-stopped its own test runner; this is a test-harness limitation, not an app result.
- Fresh unconfigured-lane verification passed iOS native UI 7/7, Swift NativeCore 44/44, web tests 83/83, native security validation, and Vite production build. Android connected UI passed 23/24; the single known API 36 DocumentsUI synthetic-file result-return failure remains environment-level. Android app/nativepreview APK builds and lint also passed.
- No Google restricted key is present, so real Google tiles, Places search, location permission, attribution, and rendered marker/camera stability remain unverified. The user explicitly deferred this provider verification until after the expense/settlement stage; it remains a release gate, not a passed check. No commit, push, deployment, billing, or key operation was performed.
- Request `F4mK8qR2Zx`: self-review completed without a subagent. Swift NativeCore 44/44, web 83/83, native security, Vite build, Android JVM/APK/lint, and the original iOS app simulator build passed. A focused iOS landscape UI rerun passed 1/1; a parallel full iOS rerun was interrupted after simulator text-input automation stalled, so the prior full 7/7 evidence remains the authoritative full-suite result. No product source change was needed for this continuation.

## Global Constraints

- iOS 16.0 / Android minSdk 26 유지. Xcode 27, compileSdk/targetSdk 36 및 기존 Kotlin/Compose 설정을 유지한다. 의존성 해결이 지원 하한을 올리면 임의 상향하지 않고 그 지점에서 보고한다.
- 대상 앱은 `com.travelplaner.app.nativepreview`, 표시명 `TripPlot Native`. 기존 `com.travelplaner.app`, 웹, 계정, 서명키, 운영 데이터를 자동 변경하지 않는다.
- 기존 미커밋 1·2단계와 웹 오류 수정은 보존한다. 새 작업 폴더에 HEAD만 복제하면 기반 소스가 빠진다. 실행 시 기존 승인된 작업 폴더를 사용하고 근거를 기록한다. 별도 요청 전 커밋·푸시·배포하지 않는다.
- Google Cloud 프로젝트 생성, 유료 결제, API 활성화, 키 생성/제한 변경은 이번 로컬 구현 승인으로 간주하지 않는다. 준비된 제한 키를 로컬 비추적 설정에 연결하며 키 값을 대화·로그·fixture에 출력하지 않는다.
- 키 누락·거절·통신 실패에도 여행/일정/수동 저장 장소/백업/하단 메뉴는 동작한다. 지도 실연동 미확인은 전체 3단계 완료로 표시하지 않는다.
- 장소 ID의 문자열/숫자 구별, `itinerary: [{day, items}]`, `reserveItems`, 기존 좌표·사진·지출·알 수 없는 JSON 필드 보존 계약을 유지한다. 좌표가 없는 장소를 `(0,0)`으로 대체하지 않는다.
- 단계 4의 지출·정산, 단계 5의 사진·기록, 단계 6의 계정·전역 즐겨찾기 이전은 이번에 추가하지 않는다. 여행별 JSON 백업을 전역 즐겨찾기 백업이라고 안내하지 않는다.
- 현재 웹의 경로는 장소 순서를 잇는 Polyline이다. 네이티브도 **방문 순서 연결선**이며 도로 길찾기·ETA·최적 경로·새 Routes API 결제는 제공하지 않는다.
- 기존 시험 앱을 제거하거나 저장소를 초기화하지 않는다. Android의 `android.injected.androidTest.leaveApksInstalledAfterRun=true`를 유지한다. DB 이전 실패를 빈 DB 생성으로 처리하지 않는다.

## 현재 코드에서 출발하는 지점

- `ios/NativePreview/NativeRootView.swift`, Android `ui/TripPlotApp.kt`의 지도·저장은 안내 화면이다. Google SDK와 네이티브 위치 권한이 아직 연결되어 있지 않다.
- `ItineraryView.swift` / `ItineraryScreen.kt`는 일정 단일 화면이며 독립 지도 영역이 없다. 기존 장소 편집 동작은 유지하고 목록 본문만 재사용 가능한 컴포넌트로 추출한다.
- Swift `TripStoreModel.current`는 TripRecord + ImportReceipt이고, Room `TripDatabase`는 같은 역할의 스키마 2다. 새 저장 장소 테이블을 추가할 때 **단계 1과 단계 2 저장소를 모두 읽을 수 있어야 한다**.
- 웹 즐겨찾기의 이름 비교 방식은 네이티브에 복사하지 않는다. 동명 장소는 서로 다를 수 있다. 기존 웹에서는 POI 선택 결과에 placeId가 빠진 경우도 있으므로 이름/좌표로 다른 장소를 자동 병합하지 않는다.

## 사용자 경험과 범위

1. 내 여행 → 여행 상세 → 일정·지도: 처음에는 50:50. 이후 여행별 마지막 비율·일차·목록 위치를 복원한다. 지도와 목록은 형제 레이아웃이며 서로 덮지 않는다.
2. 가운데 손잡이만 드래그하면 0~100% 사이에서 자유 조절된다. 손을 떼도 가까운 비율로 강제 이동하지 않는다. 지도 전체/일정 전체/분할 복원 조작은 항상 남는다.
3. 휴대폰과 태블릿 세로는 위 지도/아래 일정. 가로에서 가용 영역이 폭 840 및 높이 600 pt/dp 이상인 경우에만 좌 지도/우 일정. 가로 휴대폰과 작은 멀티윈도는 세로 분할을 유지한다. 웹의 데스크톱/모바일 레이아웃은 변경하지 않는다.
4. 지도 탭은 전체 지도·검색·현재 위치·저장 장소 및 선택 여행 표시. 여행이 없어도 검색·저장은 가능하며 **일정에 추가**를 누를 때 여행과 일차/예비 목록을 반드시 확인한다.
5. 저장 탭은 독립 스크롤 목록, 사용자 이름·메모 검색, 직접 등록, 지도에서 보기, 일정에 복사, 삭제 확인을 제공한다. 저장 목록에서 삭제해도 이미 추가한 일정은 삭제하지 않는다.
6. 마커 선택은 장소 카드만 열고, 명시적인 **지도에서 보기/전체 장소 보기/현재 위치** 동작만 카메라를 옮긴다. 일반 지도 드래그·목록 갱신·분할 크기 변경 때 자동 재중앙화하지 않는다.

### 지도 데이터와 오프라인 보관 경계 — 검토 필요 사항

Google 검색 응답 전체를 영구 여행 JSON으로 저장하는 설계는 사용하지 않는다. 장소 ID는 장기 보관할 수 있지만 검색 원문/캐시에는 별도 제한이 있다. 따라서 **새 Google 검색 장소**는 placeId와 사용자가 직접 입력한 이름·메모·시간·아이콘을 영구 저장하고, Google 제공 이름/주소/좌표/출처는 화면의 일시적 조회 결과로 분리한다. 검색 결과명은 참고 영역에 표시하며 저장할 이름 입력란에 자동 복사해 영구 저장하지 않는다.

- 새 검색 장소 저장 시 직접 붙일 이름을 입력한다. 검색 결과의 위치는 온라인 조회로 다시 얻는다. 오프라인에서는 직접 입력한 이름·메모와 “위치는 연결 후 확인” 안내가 남는다.
- 이 단계는 Google 상세 응답을 디스크 캐시/백업에 넣지 않는다. 화면에서 쓰는 조회 결과만 메모리에 두고, 화면 종료 또는 5분 경과 시 버린다. 지도 타일 오프라인 다운로드도 구현하지 않는다.
- 기존에 가져온 여행의 좌표/이름/확장 필드와 직접 입력한 좌표는 재작성하거나 일괄 제거하지 않는다. 새로운 SDK 응답 저장 규칙과 사용자 원본 보존을 구분한다.
- 새 Google 참조 항목의 여행 백업에는 직접 입력한 이름/메모/placeId는 남지만 조회 좌표는 없다. 현재 웹 가져오기는 일정 텍스트를 읽을 수 있으나 해당 새 항목의 지도 위치를 자동 복원한다고 보장하지 않는다. 웹의 placeId 해석 확장은 별도 호환 작업이다. 이 차이를 가져오기/내보내기 안내와 검증 기록에 명시한다.
- Google 표시/출처와 제3자 attribution은 지도·검색 결과에서 가리지 않는다. 더보기에서 기존 공개 개인정보처리방침·이용약관을 열 수 있게 하되 운영 문서를 임의 게시/수정하지 않는다. 배포 전 Google 사용 관련 문구 검토가 필요하다.

## Review Focus

1. 동명 장소·문자/숫자 ID·같은 장소 여러 일차: 마커와 삭제 대상이 섞이지 않아야 한다 → Task 1, 2.
2. 날짜 변경선·좌표 누락/NaN/문자열·검색 중 탭 변경: 잘못된 `(0,0)` 표시나 늦게 온 검색 결과 덮어쓰기가 없어야 한다 → Task 1, 3, 4.
3. 분할 드래그·지도 관성 이동·목록 스크롤·회전·큰 글씨가 겹칠 때 카메라/마커가 튀거나 마지막 행/복원 조작이 가려지지 않아야 한다 → Task 3, 5.
4. 단계 2 DB의 원본 파일 이력을 가진 상태에서 저장 장소를 추가하고 재시작/실패할 때 여행·이력을 잃지 않아야 한다 → Task 2, 6.
5. 네이티브 키 없음/잘못된 제한/위치 권한 거절·대략 위치/SDK 준비 전 현재 위치 요청: 앱 전체 오류·무한 로딩·권한 반복 요구·민감한 위치 기록이 없어야 한다 → Task 3, 6.

## 파일 구성

두 플랫폼의 도메인·저장 코드와 SDK/UI 코드를 섞지 않는다.

| 역할 | iOS | Android (`android/nativepreview/src/main/java/com/travelplaner/nativepreview/` 기준) |
| --- | --- | --- |
| 참조·저장 문서·마커 계약 | `ios/NativeCore/Sources/NativeCore/PlaceReference.swift`, `SavedPlaceDocument.swift`, `TripMapProjection.swift` | `domain/PlaceReference.kt`, `SavedPlaceDocument.kt`, `TripMapProjection.kt` |
| 장소 영구 저장 | 기존 `TripRepository.swift`, `TripStoreModel.swift` | 기존 `data/TripRepository.kt`, `TripDatabase.kt` |
| SDK 연결 | `ios/NativePreview/Map/GoogleMapSurface.swift`, `GooglePlacesClient.swift`, `CurrentLocationClient.swift`, `MapConfiguration.swift` | `map/GoogleMapSurface.kt`, `GooglePlacesClient.kt`, `CurrentLocationClient.kt`, `MapConfiguration.kt` |
| 화면 상태·검색·저장 | `Map/NativeMapState.swift`, `PlaceSearchView.swift`, `PlaceDetailView.swift`, `SavedPlacesView.swift`, `PlaceDestinationView.swift` | `map/MapViewModel.kt`, `ui/PlaceSearchScreen.kt`, `PlaceDetailScreen.kt`, `SavedPlacesScreen.kt`, `PlaceDestinationScreen.kt` |
| 자유 분할·일정 재사용 | NativeCore `SplitLayout.swift`; NativePreview `TripWorkspaceView.swift`, `ItineraryContent.swift` | `domain/SplitLayout.kt`; `ui/TripWorkspaceScreen.kt`, `ItineraryContent.kt` |

테스트는 `ios/NativeCore/Tests/NativeCoreTests/`, `ios/NativePreviewUITests/`, Android `android/nativepreview/src/test/java/com/travelplaner/nativepreview/`, `android/nativepreview/src/androidTest/java/com/travelplaner/nativepreview/`에 기능별 파일로 나눈다. 공통 fixture는 `contracts/native/fixtures/map-places.json`, `map-expected.json`을 직접 읽는다. 순수 테스트는 기존 `contractBytes(name)` helper를 사용한다. Android instrumented tests는 기존 test assets의 같은 fixture를 사용한다.

## Task 1: 장소 참조·좌표·안정적인 마커 계약

**Files:** 위 도메인 파일 3개씩, `TripSchedule.swift/.kt`, 공통 map fixture, `TripMapProjectionTests.swift` / `TripMapProjectionTest.kt`.

**Interfaces:** `Coordinate(latitude: Double, longitude: Double)`는 유한 숫자·위도 ±90/경도 ±180 검증(Swift throwing initializer, Kotlin require, 값 동등성 지원). `PlaceReference`는 `manual(Coordinate)`, `google(placeID: String)`, `existing` 세 종류. Google placeID는 공백 제거 후 1~1024자, 대소문자 그대로 보존한다. `existing`은 이미 저장된 입력 JSON을 읽기 위한 출처이며 새 SDK 결과에는 사용할 수 없다. `MapMarker`는 문자열 key, coordinate, 사용자 label, kind(saved/reserve/day), 선택할 tripID/itemKey 또는 favoriteID만 담는다. SDK 타입은 담지 않는다.

- [ ] **RED:** fixture에 id `1`/`"1"`, 동명 다른 지점, 유효한 `(0,0)`, 위도 91, 문자 좌표, 누락 좌표, 경도 179.9/-179.9를 넣는다. 기존 fixture의 지출/사진은 그대로 둔다.

```swift
let trip = try TripDocument(data: contractBytes("map-places.json"))
let a = TripMapProjection.make(trip: trip, saved: [], resolved: [:])
XCTAssertEqual(Set(a.markers.map(\.key)).count, a.markers.count)
let origin = try Coordinate(latitude: 0, longitude: 0)
XCTAssertTrue(a.markers.contains { $0.coordinate == origin })
XCTAssertEqual(a.unlocatedItemCount, 3)
let moved = try TripSchedule.apply(.move(section: .day(1), key: .integer(1), to: .reserve), to: trip)
let b = TripMapProjection.make(trip: moved, saved: [], resolved: [:])
XCTAssertEqual(a.markers.first { $0.itemKey == .integer(1) }?.key,
               b.markers.first { $0.itemKey == .integer(1) }?.key)
```

- [ ] **RED run:** `swift test --package-path ios/NativeCore --filter TripMapProjectionTests`; Android `./gradlew :nativepreview:testDebugUnitTest --tests '*TripMapProjectionTest'`. Expected: missing new types/methods before implementation; fixture-loading failures do not count as feature RED.
- [ ] **Implement:** `TripMapProjection.make(trip: TripDocument?, saved: [SavedPlaceDocument], resolved: [String: ResolvedPlace]) -> MapProjection`. Kotlin equivalent returns immutable `MapProjection`. `ResolvedPlace` holds Google placeID, coordinate, display name, address, attribution and fetchedAt, exists only in memory. Invalid legacy coordinates are skipped with count, not changed in the original trip. `resolved` keys are placeIDs and values expire after 5 minutes. A Google-origin item does not fall back to an expired coordinate.
- [ ] **Keys/route:** use collision-resistant encoded tuples `["trip",tripID,itemKey.token]` and `["saved",favoriteID]`, not row index/name/rounded coordinate. Moving a place to another day must keep its marker key. `MapProjection` exposes per-day contiguous route segments; missing location breaks a segment, reserve items are excluded, and no implicit cross-day connection is drawn. Fit bounds uses the shorter longitude arc across the date line.
- [ ] **GREEN:** same fixture expectations on both platforms; rebuild projection after unrelated memo edits without changed coordinates/IDs, no input JSON mutation, distinct duplicate names, deterministic keys, invalid scalar types rejected, original numeric coordinate precision retained.

## Task 2: 저장 장소·일정 연결과 비파괴 DB 이전

**Files:** `SavedPlaceDocument.swift/.kt`, existing repositories/models, Room `android/nativepreview/schemas/com.travelplaner.nativepreview.data.TripDatabase/3.json`, `SavedPlaceRepositoryTests.swift`, Android `SavedPlaceRepositoryTest.kt` (instrumented), using the exact source/test directories in the file structure above.

**Interfaces:** `SavedPlaceDocument` has `id`, unique `sourceKey`, original durable JSON payload, `createdAt`, `updatedAt`. Repository methods: `listSavedPlaces() -> [SavedPlaceDocument]`, `savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String) -> SavedPlaceDocument`, `deleteSavedPlace(id: String) -> Void`. Kotlin returns List/SavedPlaceDocument/Unit and methods are suspend. `PlaceSelection(reference, originalItem = nil/null)` contains reference plus an optional original existing item JSON; `existing` additionally requires sourceTripID and sourceItemKey properties, otherwise validation fails. No Google response object is accepted. These APIs reread within the existing DB transaction helpers.

- [ ] **RED:** disk test creates a stage-2 store containing a trip and ImportReceipt, then opens new store and compares exact travel/receipt source bytes. Save → close/reopen → same saved document; same Google placeID saves once; same name/different IDs remain separate; delete saved record leaves copied itinerary intact; injected write failure leaves all old data unchanged.

```kotlin
val originalTrip = repository.list().single()
val selected = PlaceSelection(reference = PlaceReference.Google("place-a"))
val first = repository.savePlace(selected, PlaceDraft(name = "集合場所"), UUID.randomUUID().toString())
val again = repository.savePlace(selected, PlaceDraft(name = "集合場所"), UUID.randomUUID().toString())
assertEquals(first.id, again.id)
assertEquals(1, repository.listSavedPlaces().size)
assertEquals(originalTrip.json, repository.list().single().json)
```

- [ ] **Schema:** retain exact Swift original model and exact stage-2 model; current model adds SavedPlaceRecord (`id`, `sourceKey`, `payload`, created/updated timestamps). Before migration identify source model from metadata; recovery SQLite/WAL copy and comparison now include **both trips and receipts**. Do not replace the old model constant and accidentally make stage-2 stores unreadable. Room adds only saved_places with unique sourceKey in migration 2→3 and retains migration 1→2; test 1→3 and 2→3. No destructive fallback.
- [ ] **Identity:** sourceKey is `google:<case-sensitive placeID>` for Google, hash of encoded `["existing",tripID,itemKey.token]` for a copied existing item, or `manual:<creation UUID>`. Do not deduplicate by name or proximity. A duplicate save returns the existing record and does not overwrite its later user memo; editing saved user fields is explicit. Deletion is by record ID with confirmation.
- [ ] **Schedule attachment:** add `ScheduleChange.addPlace(section, id, draft, selection)` alongside existing add. It uses the same draft validation and typed-ID uniqueness checks. Manual coordinate selection adds validated lat/lng. Google selection adds placeId + `nativePlaceSource: "google"`, no Google name/address/coordinate. Existing selection copies original extra fields, replaces only id and the six edited draft fields. Repository rereads target trip/day before inserting; if target disappeared show “여행이나 일차가 변경되었습니다”. Retry with the same operation UUID returns the same inserted item only when its data matches; different data with that UUID errors.
- [ ] **Copy/export tests:** saved→itinerary copy has fresh UUID and same permitted fields; later saved deletion has no cascade. Existing item coordinates/expenses/photo fields remain equal. Google response names/addresses/coordinates/SDK instances cannot reach durable JSON or exports. Existing backups still pass all stage-2 tests. A single-trip export continues excluding global saved-place records.
- [ ] **GREEN run:** `swift test --package-path ios/NativeCore`; Android JVM + connected `SavedPlaceRepositoryTest` and existing `TripImportTest`. Expected: all pass with nonzero counts; reopen old DB without clearing its data.

## Task 3: Google 지도·검색·위치 어댑터와 키 실패 격리

**Files:** Map adapter/config/client files above; `ios/project.yml`, new `ios/NativePreview/Map/NativeMaps.xcconfig.example`, nontracked `NativeMaps.local.xcconfig`, `Info.plist`; Android module gradle/manifest, ignored `android/native-maps.properties`, tracked example, `.gitignore`; map state unit tests and adapter host tests.

**Interfaces:** `PlacesClient.autocomplete(query, sessionID) -> [PlacePrediction]`, `details(placeID, sessionID?) -> ResolvedPlace`; async/throws in Swift, suspend in Kotlin. `PlacePrediction` has placeID and transient display strings/attribution. `LocationClient.requestCurrent() -> LocationOutcome` with granted(Coordinate, approximate), denied, restricted, unavailable, timedOut. `CameraCommand(id: UUID, target: center(Coordinate,zoom) | fit([Coordinate]))` is consumed once, not assigned on every state update.

`NativeMapState`/`MapViewModel` expose `search(query)`, `applyMarkers(markers)`, read-only `results`, and typed loading/error state. Tests inject a controllable PlacesClient fake with `complete(query, predictions)` and a CameraSink spy counting actual move calls. Advance a virtual clock through 300ms debounce and dispatch queued coroutine/Task results before assertions; do not make live network calls in unit tests.

- [ ] **RED:** injected fake client completes query A after query B; only B is shown. Key-missing factory never creates GMSMapView/MapView. Canceled search clears results and session. Repeated renders with the same camera command call camera once; marker-only updates never move camera. Location denial leaves route/search available and does not request permission again automatically.

```kotlin
state.search("tok")
state.search("tokyo")
fake.complete("tokyo", listOf(predictionB))
fake.complete("tok", listOf(predictionA))
assertEquals(listOf(predictionB), state.results)
state.applyMarkers(updatedMarkers)
assertEquals(0, cameraSpy.moveCount)
```

- [ ] **SDK pin/setup:** XcodeGen SPM packages `https://github.com/googlemaps/ios-maps-sdk` and `https://github.com/googlemaps/ios-places-sdk`, exactVersion `10.15.0`, products GoogleMaps/GooglePlaces on preview target only. Their published Package.swift both require iOS16. Android preview adds `com.google.android.gms:play-services-maps:20.0.0`, `com.google.android.libraries.places:places:5.3.0`; nativepreview only gains INTERNET, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION. Do not request background location. Use platform LocationManager to avoid another fused-location dependency.
- [ ] **Local key wiring:** iOS `TRIPPLOT_MAPS_API_KEY` build setting from optional `#include?` local xcconfig, emitted under `TripPlotMapsAPIKey` in preview Info.plist. Android property `TRIPPLOT_MAPS_API_KEY` read from ignored properties or environment, manifest `com.google.android.geo.API_KEY`. Blank/unexpanded placeholder is absent. Missing files produce blank keys and a usable app, not a build failure. Keys must be restricted to the preview bundle ID or package plus debug SHA-1 and required APIs. Never use the web key or remove its restrictions. Document that embedded client keys are not unextractable secrets: provider restrictions provide protection.
- [ ] **Map lifecycle:** one native map per mounted surface/coordinator, SDK-managed geographic markers; reconcile a key→marker registry, update only changed properties and remove obsolete markers. Never clear/recreate all markers or animate from `(0,0)` during camera gestures. On Android forward MapView lifecycle using the host LifecycleOwner and release listeners/onDestroy once. Pass Activity/UI context. On iOS keep delegates in Coordinator. Resize bounds without recreating map/markers. Do not disable global StrictMode because of SDK internals; record SDK 20's known StrictMode issue if encountered.
- [ ] **Search:** trim 2~200 Unicode scalar query, 300ms debounce, at most one visible session, discard stale callbacks by generation ID even if SDK cancellation is unavailable. One Google session token per user search session, used for autocomplete and the chosen details request, reset on selection/cancel/error as documented. Request only ID/display name/formatted address/location/attribution fields. No reviews/photos/opening-hours bulk request. Request timeout 10s, retriable error, no automatic quota-consuming retry loop. Use Google Places native SDK New APIs, not a browser endpoint.
- [ ] **Location:** ask only on “현재 위치” tap. iOS WhenInUse/CoreLocation with purpose text. Android coarse/fine pair on user action, accept approximate permission. A single fresh fix (age≤30s, nonnegative accuracy) or 10s timeout; stop listeners after completion/tab background. No location history in DB/logs. Denial offers explanation and optional system settings; search remains usable. If map not ready, store only the latest explicit camera command until ready; user pan cancels pending automatic focus.
- [ ] **Failure:** missing key immediately shows small in-pane explanation. If initial tiles are not ready after 15s, offer “지도 불러오기 지연 · 다시 시도” without diagnosing it as an invalid key. Catch supported SDK/search error callbacks; do not promise the SDK supplies an auth failure callback where none exists. Invalid key/test network failures never mount a global error view. Collapsed/inactive map stops timeout checks. Preserve Google's visible attribution/safe inset.
- [ ] **GREEN:** resolve dependencies/build both previews and original apps at existing deployment targets; fake tests pass. Separate actual-key smoke test must verify tiles/search/current location; compile-only or fake tiles do not satisfy it. No new key or billing action is performed to force this test through.

## Task 4: 지도·저장 탭과 장소 추가 흐름 연결

**Files:** search/detail/saved/destination files above, `NativeRootView.swift`, `NativeTripStore.swift`, Android `TripPlotApp.kt`, `TripViewModel.kt`; focused navigation coordinator/state files if needed. Avoid putting all new screens into TripPlotApp.

- [ ] **RED UI:** no trip → map search result → save with user label → Saved tab → reopen app → same label. Create travel → saved place “일정에 추가” → choose trip + day2 → success exactly once → source saved record unchanged. Same-name places retain separate detail screens. Delete saved record → itinerary still exists. Keyless manual saved item works without map.

```swift
app.tabBars.buttons["저장"].tap()
app.buttons["savedPlaceAddManual"].tap()
app.textFields["savedPlaceName"].typeText("MapQA 직접 입력")
app.buttons["savedPlaceSave"].tap()
app.terminate(); app.launch()
app.tabBars.buttons["저장"].tap()
XCTAssertTrue(app.staticTexts["MapQA 직접 입력"].waitForExistence(timeout: 5))
```

- [ ] **Implement navigation:** store only destination IDs/tokens. Map tab shows active trip name or “여행 미선택”; never silently choose the first trip. A place can be saved without an active trip. Destination picker initially confirms current trip/day but requires explicit Add; if none, show travel selection and a create-trip link that returns to the draft. Preserve existing per-tab back stacks and stage-2 startup restoration regression test.
- [ ] **Manual saved form:** name required, optional address/memo/emoji and optional lat/lng pair. Both coordinates or neither; range/type validation before DB mutation. Store draft per screen operation, disable double submit, on failure keep input. Location from current-location button is not automatically a saved place. Google selection requires user label; Google display name/address are a clearly attributed read-only reference, not copied into stored fields.
- [ ] **Lists/details:** saved list supports scroll and local case-insensitive search over user label/memo only; empty/errors/retry distinguish zero records from DB read failure. Place card exposes Save/Unsave with confirmation, Add to itinerary, View on map. Insets/keyboard allow the final action to remain reachable at maximum accessible text. Saved deletion never removes schedule rows; repeated Google save highlights existing record.
- [ ] **Transient data:** SDK responses and query text are not serialized into navigation, crash logs or SavedStateHandle. User-written draft can use existing draft state. After process death unconfirmed Google detail must be requested again; saved placeID/label remain. Details unavailable shows the stored label and an explicit retry.
- [ ] **GREEN:** native UI tests for manual/keyless flow, fake-provider navigation/race/error scenarios, real provider smoke when configured. Confirm original iOS/Android/web functionality remains unchanged and no operational account data was read.

## Task 5: 독립된 두 영역과 자유 크기 조절

**Files:** `SplitLayout.swift/.kt`, workspace/content files above, existing itinerary screens/list navigation, `SplitLayoutTests.swift` / `SplitLayoutTest.kt`, split UI tests.

**Interfaces:** `SplitLayout` is a pure helper (Swift static functions / Kotlin object); UI owns `ratio: Double` (map share of usable extent), `lastInteriorRatio: Double`, and axis. `resize(startRatio, delta, extent) -> Double` uses finite positive extent and clamps to 0...1; zero/invalid extent returns the sanitized start value. `commit(ratio) -> Double` returns the sanitized actual ratio without snapping. `restore(lastInteriorRatio) -> Double` returns last strictly interior ratio or 0.5. Nonfinite ratio is 0.5. UI expandMap sets 1, expandList sets 0 without replacing the last interior ratio; after release UI persists commit's result. Ratio is per trip; selection and list scroll use stable item IDs.

- [ ] **RED:** pure resize test uses a non-snap value and validates unchanged release. Test extent0, NaN input, very small panels, extremes, rotation, restored invalid settings. UI swiping inside list does not change ratio; map gesture does not move divider; divider does not edit place coordinates.

```kotlin
val value = SplitLayout.resize(startRatio = 0.5, delta = -137.0, extent = 1000.0)
assertEquals(0.363, value, 0.000001)
assertEquals(value, SplitLayout.commit(value), 0.000001)
assertEquals(0.363, SplitLayout.restore(lastInteriorRatio = value), 0.000001)
```

- [ ] **Implement layout:** subtract safe areas/tab bar once via the native parent container; reserve a 44 pt/dp divider control strip. Remaining height/width is split by ratio into sibling clipped map/list containers. Do not use a sheet/offset/overlay for the schedule pane. Small pane content may clip, but the divider/restore actions never do. At 0/1 collapse just that pane; retain map instance/state when feasible and restore camera without full reinitialization.
- [ ] **Gestures:** drag attaches only to handle hit area, reading cumulative translation against drag-start ratio (not accumulating cumulative translation every frame). No gesture recognizer on entire screen/list. Divider provides native accessibility adjustable actions in 10% steps and explicit map/list/restore buttons of at least 44 pt/dp. Only accessibility buttons step; pointer drag stays continuous. Tests verify TalkBack/VoiceOver labels/value, not just presence of a decorative grip.
- [ ] **State/camera:** ratio/day/scroll survive tab switches and restart. Rotation changes axis only under the stated container threshold and uses same normalized ratio. No auto-fit during resize or stored data refresh. Explicit “전체 장소 보기” emits one fit command; one point uses fixed zoom16, none shows a message, date-line points use shorter bounds. Store primitive camera values only; a location permission change does not write user position to travel data.
- [ ] **Itinerary extraction:** move existing sections/rows/actions into `ItineraryContent` with explicit selectedSection binding and action callbacks; preserve editor/delete/time sort behavior. Marker tap selects its existing item/day without mutating order. List “지도에서 보기” opens map pane if collapsed and emits explicit focus; mere scrolling has no camera effect.
- [ ] **GREEN:** UI 0→0.363→1→restore0.363; list scroll reaches last of ≥50 synthetic rows at ratio0.3; tab bar/restore remain reachable at big text. Phone portrait/landscape and tablet landscape/portrait; ten map drags + pinch zoom do not change stored lat/lng or marker keys. Real SDK visual capture separately checks screen-position stability—pure projection tests alone do not prove rendered stability.

## Task 6: 3단계 통합 검증과 인계

**Files:** new `docs/native-maps-saved-split-verification.md`, `docs/native-stage3/` screenshots, README, this plan, `기록-history.md`. Add focused native security tests for new key/config paths without exposing values.

- [ ] **Unconfigured lane:** absent key and injected unusable key/search errors; trip creation/edit, favorites direct entry, import/export and all bottom tabs remain usable. No SDK instance created for absent key. Exact error text does not falsely imply a diagnosed cause.
- [ ] **Configured lane:** use user-provided restricted preview keys, real Google map/search, location grant/deny/approximate, airplane/no-network then retry, simultaneous list scroll/map pan/divider drag, screen rotation and background/foreground. Test against emulator synthetic GPS/known fixture coordinates; never log real user location.
- [ ] **Storage lane:** upgrade copies of stage1/stage2 synthetic DBs; compare trips, receipt source bytes and IDs before/after. Add saved place, copy to itinerary, remove only saved record after explicit test confirmation, force-stop/relaunch, verify copied itinerary still present. Document exact synthetic deletions; never clear the operating app. New Google-only selection export preserves user fields/placeId, excludes transient SDK data, and honestly reports current web's lack of coordinate resolution.
- [ ] **Regression commands:** use installed simulator/AVD and Java17; resolve project config without rewriting original target identifiers.

```bash
swift test --package-path ios/NativeCore
# From ios/:
xcodegen generate
xcodebuild -project TravelPlaner.xcodeproj -scheme TripPlotNativePreview \
  -destination 'platform=iOS Simulator,id=3081E2CF-3CDB-491E-9A45-6858DA1D606A' \
  -derivedDataPath DerivedData/NativePreviewStage3 -parallel-testing-enabled NO \
  -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO COMPILATION_CACHE_ENABLE_CACHING=NO test
xcodebuild -project TravelPlaner.xcodeproj -scheme TravelPlaner \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath DerivedData/Stage3OriginalCheck CODE_SIGNING_ALLOWED=NO build
# From android/:
./gradlew :nativepreview:testDebugUnitTest :nativepreview:connectedDebugAndroidTest \
  :nativepreview:assembleDebug :nativepreview:lintDebug :app:assembleDebug --console=plain
# From repository root:
npm test
npm run native:security
npm run build
git diff --check
```

Expected: nonzero relevant test counts, zero failures/build errors; classify warnings separately. Missing keys mean configured lane is **unverified**, not skipped-and-passed. Do not mark entire stage3 complete until map/search and gesture behavior are actually exercised on both platforms. Minimum-OS/physical-device/provider availability gaps remain explicit release gates.

- [ ] **Review/handoff:** one final independent review if available; if unavailable disclose author-only review. Record actual counts, source files, runtime screenshots, key setup readiness (not key values), deferred issues and request ID. No automatic commit/push/deployment. Keep uncommitted work/recovery copies.

## 확인한 공식 근거와 주의점

- [Maps iOS 10.15.0 Package.swift](https://raw.githubusercontent.com/googlemaps/ios-maps-sdk/10.15.0/Package.swift), [Places iOS 10.15.0 Package.swift](https://raw.githubusercontent.com/googlemaps/ios-places-sdk/10.15.0/Package.swift): 두 패키지의 iOS16 지원 선언 확인. iOS Maps의 크기 변경 관련 수정 기록은 [릴리스 노트](https://developers.google.com/maps/documentation/ios-sdk/release-notes)에 있다. 설치/빌드는 아직 하지 않았다.
- [Android Maps 릴리스 노트](https://developers.google.com/maps/documentation/android-sdk/release-notes), [Android Places 릴리스 노트](https://developers.google.com/maps/documentation/places/android-sdk/release-notes): 20.0.0/5.3.0 확인. Maps20에는 SDK 내부 StrictMode 이슈가 안내되어 있어 실제 환경 검증과 기록이 필요하다. Places5에서는 새 `DISPLAY_NAME`, `FORMATTED_ADDRESS`, `LOCATION` 필드를 사용한다.
- [키 보안 안내](https://developers.google.com/maps/api-security-best-practices): 앱별 키 및 애플리케이션/API 제한. 웹 제한 키를 그대로 재사용하지 않는다.
- [Places iOS 정책](https://developers.google.com/maps/documentation/places/ios-sdk/policies), [서비스별 조건](https://cloud.google.com/maps-platform/terms/maps-service-terms): placeId 보관과 지도 콘텐츠 캐시를 구분한다. 이 계획의 비영구 검색 응답/사용자 입력 분리는 이를 고려한 보수적 구현 선택이며 법적 검토 완료를 뜻하지 않는다.
- [iOS Autocomplete](https://developers.google.com/maps/documentation/places/ios-sdk/place-autocomplete), [Android Autocomplete](https://developers.google.com/maps/documentation/places/android-sdk/place-autocomplete): 검색 세션과 선택한 장소 상세 요청을 연결한다.

## 계획 자체 점검

- 승인 설계의 지도/검색/현재 위치/마커는 Task1·3·4, 저장은 Task2·4, 자유 분할은 Task5, 실패 격리와 검증은 Task6에 연결했다.
- SDK 상태/영구 JSON/사용자 입력을 분리했고, 같은 Google 장소와 동명 다른 장소의 식별을 구분했다. 검색 응답을 영구 백업에서 제외하는 사용자 영향과 현재 웹 호환 한계를 별도로 적었다.
- 기존 iOS 단계2 모델과 원본 수신 바이트를 새 DB 이전에서도 비교해야 함을 명시했다. 스키마 변경을 앱 초기화로 대신하지 않는다.
- Review Focus 다섯 항목마다 담당 작업과 실제 테스트를 지정했다. 현재 단계는 계획 검토이며 제품 코드/SDK 설치/새 기능 테스트는 아직 실행하지 않았다.
