# TripPlot 일정·백업 이전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 2026-09-21 승인된 2단계 Task 1–5 구현·검증 완료. 독립 검토 미실행 및 실기기/지원 OS 검증 한계는 [검증 기록](../../native-itinerary-transfer-verification.md)을 참고한다. 출시·푸시·배포 완료를 의미하지 않는다.

**Goal:** 기존 네이티브 미리보기에서 일차·예비 목록을 직접 편집하고, 웹의 여행 JSON 백업을 원본 보존·중복 방지·가져오기 미리보기와 함께 왕복 처리한다.

**Architecture:** 기존 SwiftUI/Core Data 및 Compose/Room 구조를 유지한다. 일정 변경은 순수 함수, 파일 해석은 백업 어댑터, 저장·이전 이력은 DB 트랜잭션으로 분리한다. 가져온 파일은 사용자가 확인하기 전 DB를 변경하지 않는다.

**Tech Stack:** SwiftUI, Foundation, Core Data, CryptoKit, XCTest; Kotlin, Compose, Room, kotlinx.serialization, java.security.MessageDigest, JVM/instrumentation tests. 새 서버·지도 SDK는 추가하지 않는다.

**Spec:** `docs/superpowers/specs/2026-09-20-tripplot-native-ui-design.md`의 단계 2. 단계 1 결과는 `docs/native-foundation-verification.md` 참조.

**Request ID:** `Ixp3gqZ2SM` · 요청: “다음 단계 진행”.

## Global Constraints

- iOS 16.0 / Android minSdk 26 유지. 운영 앱 식별자 `com.travelplaner.app`와 서명키는 변경하지 않는다.
- 이번 대상은 `TripPlot Native`, `com.travelplaner.app.nativepreview`다. 기존 웹/앱/계정 데이터에 자동 접근하지 않는다.
- `itinerary: [{ day, items }]`와 `reserveItems`를 사용한다. 시간은 현지 시각 문자열 `HH:mm` 또는 미정인 빈 문자열이며 날짜를 UTC timestamp로 치환하지 않는다.
- 장소 편집은 `name`, `displayName`, `loc`, `time`, `memo`, `emoji`만 변경한다. 기존 ID·좌표·예약번호·URL·지출·사진·알 수 없는 필드는 보존한다.
- 공유 연결·관리 권한인 루트의 `sharedId`, `sharedManagementToken`은 가져온 네이티브 여행 및 내보낸 백업에서 제외한다. 수신 원본은 앱 내부 이전 이력에 보관하고 사용자용 내보내기에 포함하지 않는다.
- 웹 백업은 루트에 여행 객체 하나를 담는다(`src/App.jsx:3059`). 전역 즐겨찾기·설정은 포함하지 않으므로 이 작업을 계정 전체 이전이라고 표현하지 않는다.
- Safari/Chrome 파일 및 기존 앱에서 사용자가 내보낸 JSON을 시스템 파일 선택기로 가져온다. 기존 앱의 sandbox 자동 추출·실제 같은 ID 앱 업데이트 이전은 단계 6이다.
- 이번 작업에서 운영 웹의 가져오기 동작·로그인·서버·푸시·배포·결제는 변경하지 않는다.
- 이미 있는 미커밋 변경을 보존한다. 요청 ID·답변·수정·검증 결과를 `기록-history.md`에 누적한다. 문서/기능 커밋은 사용자가 별도로 요청할 때만 한다.

## 사용자 흐름 및 결정 기준

1. **일정:** 내 여행 → 여행 상세 → 예비 목록/1일차/2일차 선택 → 장소 추가·편집. 장소 이름, 표시 이름, 주소, 시간, 메모, 아이콘을 입력한다. 지도 검색은 아직 없으므로 수동 입력임을 명시한다.
2. **이동:** 각 장소 메뉴에 위로/아래로, 다른 일차·예비 목록으로 이동, 삭제 확인을 제공한다. 저장된 배열 순서가 기본 표시 순서다. 시간 변경으로 조용히 재정렬하지 않으며 필요하면 별도 `시간순 정렬` 동작을 제공한다. 동일 시각은 원래 상대 순서를 유지하고 빈 시간은 마지막으로 보낸다.
3. **백업:** 여행 상세의 내보내기 → JSON 파일 생성 → 시스템 저장/공유. 더보기의 `여행 백업 가져오기`는 활성 여행이 없어도 보인다. 선택된 여행이 없으면 내보내기에는 여행 선택 안내를 보인다.
4. **가져오기:** 파일 선택 → 이름·국가·기간·일정/예비/지출 개수·보완 항목·충돌 상태 미리보기 → 사용자가 확인 → DB 저장 → 재읽기 → 완료. 취소·해석 실패는 기존 DB를 전혀 변경하지 않는다.
5. **중복/충돌:** 같은 파일의 재시도는 이전 기록을 찾아 완료된 여행으로 안내한다. 같은 원본 여행 ID에 내용이 다른 데이터가 있으면 기본 선택은 `취소`, 대안은 `별도 여행으로 가져오기`다. 기존 여행 덮어쓰기는 이번 단계에서 제공하지 않는다. 복사본도 동일 파일 반복 가져오기 시 중복 생성하지 않는다.
6. **삭제된 이전 여행:** 이전 기록은 있지만 대상 여행이 삭제됐으면 그 사실을 표시하고, 명시적인 `새 여행으로 복원` 확인 후 새 ID로 생성한다. 조용히 삭제를 취소하지 않는다. 이전 기록에는 과거 대상 ID를 보존한다.
7. **쓰기 실패:** 폼/가져오기 화면을 유지하고 재시도한다. DB 성공 전에 `저장됨`이나 `가져오기 완료`를 표시하지 않는다. 파일 내보내기 선택 취소는 성공 메시지가 아니다.

## Review Focus

- 숫자 장소 ID `1`과 문자열 장소 ID `"1"`, 중복/누락 ID: 다른 항목을 수정하지 않고 원래 값을 보존해야 한다(Task 1).
- 오래된 백업의 누락 필드와 잘못된 값: 누락만 미리보기에서 보완하고 유효하지 않은 기존 값을 덮어 고치지 않는다(Task 2).
- 이름/시간 편집 및 일차 이동 후 좌표·예약·사진·정산 정보: 편집 범위 밖의 JSON이 같아야 한다(Task 1, 5).
- 반복 가져오기·미리보기 이후 DB 변경·저장 중 종료: 중복·부분 저장·기존 여행 덮어쓰기가 없어야 한다(Task 2).
- 큰 JSON/읽기 권한 만료/회전/키보드/큰 글자/취소: 메모리나 UI 오류로 데이터가 사라지거나 저장 버튼이 가려지지 않아야 한다(Task 2–5).

## Task 1: 공통 일정 계약 및 순수 편집 로직

**Files**

- Create: `contracts/native/fixtures/schedule-edit.json`, `contracts/native/fixtures/legacy-trip-backup.json`, `contracts/native/fixtures/schedule-expected.json`.
- Create: `ios/NativeCore/Sources/NativeCore/TripSchedule.swift`, `ios/NativeCore/Tests/NativeCoreTests/TripScheduleTests.swift`.
- Create: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/domain/TripSchedule.kt`, `android/nativepreview/src/test/java/com/travelplaner/nativepreview/TripScheduleTest.kt`.
- Modify: 두 플랫폼의 `TripDocument` 검증을 새 계약에 필요한 범위에서만 확장한다. 손상된 저장 데이터에 대한 기존 검증은 약화하지 않는다.

**Interfaces (equivalent types on both platforms)**

```swift
public enum ScheduleSection: Equatable { case reserve, day(Int) }
public enum ItemKey: Equatable { case string(String), integer(Int64) }
public struct PlaceDraft {
    public var name, displayName, loc, time, memo, emoji: String
}
public enum ScheduleChange {
    case add(section: ScheduleSection, id: String, draft: PlaceDraft)
    case edit(section: ScheduleSection, key: ItemKey, draft: PlaceDraft)
    case move(section: ScheduleSection, key: ItemKey, to: ScheduleSection)
    case shift(section: ScheduleSection, key: ItemKey, offset: Int)
    case remove(section: ScheduleSection, key: ItemKey)
    case sortByTime(section: ScheduleSection)
}
public enum TripSchedule {
    public static func apply(_ change: ScheduleChange, to trip: TripDocument) throws -> TripDocument
}
```

```kotlin
sealed interface ScheduleSection { data object Reserve : ScheduleSection; data class Day(val number: Int) : ScheduleSection }
sealed interface ItemKey { data class Text(val value: String) : ItemKey; data class Integer(val value: Long) : ItemKey }
data class PlaceDraft(val name: String, val displayName: String, val loc: String, val time: String, val memo: String, val emoji: String)
sealed interface ScheduleChange {
    data class Add(val section: ScheduleSection, val id: String, val draft: PlaceDraft) : ScheduleChange
    data class Edit(val section: ScheduleSection, val key: ItemKey, val draft: PlaceDraft) : ScheduleChange
    data class Move(val section: ScheduleSection, val key: ItemKey, val to: ScheduleSection) : ScheduleChange
    data class Shift(val section: ScheduleSection, val key: ItemKey, val offset: Int) : ScheduleChange
    data class Remove(val section: ScheduleSection, val key: ItemKey) : ScheduleChange
    data class SortByTime(val section: ScheduleSection) : ScheduleChange
}
object TripSchedule { fun apply(change: ScheduleChange, trip: TripDocument): TripDocument }
```

- [x] **RED:** fixture에 두 ID 타입, 동명 장소, 서로 다른 시간, 좌표·예약·futureField를 포함하고 아래 검증을 추가한다. fixture 로더는 각 플랫폼의 테스트 클래스에서 공용으로 사용하며 `contracts/native/fixtures`를 직접 읽는다. 따로 복제한 리소스를 기준으로 삼지 않는다.

```swift
let before = try loadFixture("schedule-edit.json")
let after = try TripSchedule.apply(.move(section: .day(1), key: .integer(1), to: .reserve), to: before)
XCTAssertEqual((after.raw["reserveItems"] as? [[String: Any]])?.count, 2)
XCTAssertEqual(try jsonValue(after.raw["expenses"]), try jsonValue(before.raw["expenses"]))
// jsonValue uses JSONSerialization fragmentsAllowed + sortedKeys and returns Data.
```

```kotlin
val before = fixture("schedule-edit.json")
val after = TripSchedule.apply(ScheduleChange.Move(ScheduleSection.Day(1), ItemKey.Integer(1), ScheduleSection.Reserve), before)
assertEquals(2, after.json.getValue("reserveItems").jsonArray.size)
assertEquals(before.json["expenses"], after.json["expenses"])
```

- [x] **RED run:** `swift test --package-path ios/NativeCore --filter TripScheduleTests`; Android `./gradlew :nativepreview:testDebugUnitTest --tests '*TripScheduleTest'`. Expect missing new types/methods before implementation.
- [x] **Implement:** resolve exactly one matching section/item; error if zero/multiple matches. Numeric IDs must be integers within ±9007199254740991 and not JSON booleans. New IDs are UUID strings. Add appends, cross-section move appends without replacing item fields, shift accepts only -1/+1 and boundary is a no-op. Edit overlays six draft fields without reconstructing the item. Delete requires exactly one target. Validate nonblank name, empty or `00:00`–`23:59` time; limit user-entered name/display name/address/memo to 200/200/2000/10000 characters, showing validation rather than truncating. Preserve existing longer data on import; editing requires correction only for edited fields. Bump `updatedAt` monotonically for actual mutations, not no-ops.
- [x] **GREEN:** test add/edit/delete/move/reorder/sort, empty-day boundaries, same section move, stale/duplicate key failure, string/integer ID separation, emoji, invalid times, unknown JSON preservation, repeat movement, unchanged original object. Compare expected fixture after a fixed sequence; do not only assert UI labels.

## Task 2: 백업 어댑터·이전 원장·트랜잭션

**Files**

- Create: `ios/NativeCore/Sources/NativeCore/TripBackup.swift`, `TripImport.swift`, `TripStoreModel.swift` in the same directory; `ios/NativeCore/Tests/NativeCoreTests/TripBackupTests.swift`, `TripImportTests.swift`.
- Modify: `ios/NativeCore/Sources/NativeCore/TripRepository.swift`.
- Create: Android `domain/TripBackup.kt`, `domain/TripImport.kt`, `src/test/.../TripBackupTest.kt`, `src/androidTest/.../TripImportTest.kt`.
- Modify: Android `data/TripDatabase.kt`, `data/TripRepository.kt`; Room schema export.

**Interfaces**

- `ImportCandidate`: `sourceHash` (SHA-256 exact original bytes), `sourceBytes` (original), `trip` (normalized validated TripDocument), `warnings` (string list).
- `ImportDisposition`: `newTrip`, `alreadyImported`, `identicalExisting`, `conflict`, `previouslyDeleted`.
- `ImportPreview`: `candidate`, `disposition`, `targetID` (existing or proposed new string ID), `expectedExistingHash` (nullable SHA-256 of current stored payload), `expectedReceiptHash` (nullable SHA-256 of previous ledger row).
- `ImportDecision`: `confirmNew`, `keepBoth`, `restoreDeleted`; cancel does not call the repository.
- `ImportOutcome`: `tripID`, `created` boolean, `alreadyImported` boolean.

```swift
public enum TripBackup {
    public static func decode(_ data: Data) throws -> ImportCandidate
    public static func encode(_ trip: TripDocument) throws -> Data
}
// Added to TripRepository, not to UI:
public func prepareImport(_ candidate: ImportCandidate) throws -> ImportPreview
public func commitImport(_ preview: ImportPreview, decision: ImportDecision) throws -> ImportOutcome
public func applySchedule(tripID: String, change: ScheduleChange) throws -> TripDocument
```

```kotlin
object TripBackup {
    fun decode(bytes: ByteArray): ImportCandidate
    fun encode(trip: TripDocument): ByteArray
}
// Added to TripRepository interface and RoomTripRepository:
suspend fun prepareImport(candidate: ImportCandidate): ImportPreview
suspend fun commitImport(preview: ImportPreview, decision: ImportDecision): ImportOutcome
suspend fun applySchedule(tripID: String, change: ScheduleChange): TripDocument
```

- [x] **RED:** both platforms decode real current web payload and a legacy payload without `id`, timestamps, `country`, optional arrays, sequential `day` fields and missing item IDs. Assertions: optional absent fields are filled, warnings list each repair, existing fields (including `expenses`, `lat/lng`, unknown nested data) remain equal, `sharedManagementToken` never appears in export. Use original byte hash and fixed fallback timestamp 0 for deterministic legacy decoding; missing root ID is `import-<sha256>`, missing item ID is `import-<sha256>-day-<day>-item-<index>` or `...-reserve-<index>`.
- [x] **Implement decoder:** accept one UTF-8 JSON object, optionally with BOM; no arrays/account dumps or markdown text in this stage. `name`, `startDate`, `itinerary` are required. `endDate` absent may be derived from valid start plus itinerary count−1 and must be shown as a repair. Root timestamps absent become existing other timestamp or 0. Fill only absent fields, not null/wrong-type values. Require valid 1–100 sequential days, object item arrays, unique valid typed item IDs across each trip (generated IDs must not collide). Reject a malformed present date/time rather than guessing. Preserve every other key; strip only known sharing credentials in normalized/exported payload. Original file remains available in the private receipt.
- [x] **Limits:** bounded streaming read at 20 MiB+1; reject over 20 MiB before JSON parsing with a clear message that no data was imported. Max 10,000 itinerary+reserve items, nesting depth 64. Accept existing image data as opaque JSON within this limit. Do not fetch URLs. The file picker must not read an arbitrary directory or retain broad filesystem permissions.
- [x] **Depth validation:** before the JSON library recursively decodes data, scan bounded UTF-8 bytes for object/array depth while respecting quoted strings and escaped quotes; reject depth >64. Let the JSON parser reject malformed syntax. Test brackets embedded in memo strings and deep nested unknown values independently.
- [x] **Schema:** add `ImportReceipt` with `sourceHash` primary/unique, `sourceBytes`, `targetID`, `previousTargetIDs` JSON, `importedAt`. iOS programmatic Core Data source model must remain reproducible: factor current exact model into `TripStoreModel.original`, new model into `current`, compare persistent-store metadata and use an inferred mapping with `NSMigrationManager` when required. Retain a recoverable source store snapshot until the new store opens and re-reads correctly; fail without resetting on incompatibility. Room adds a non-destructive migration creating `import_receipts`; update the schema number only as required by Room, not as a request/history version identifier.
- [x] **Migration safety:** never copy only a live `.sqlite` file while ignoring its WAL. Close the owning stack and use Core Data persistent-store migration/replacement APIs to write a temporary destination and replace the store only after validation, preserving a recoverable original. Test an old store containing uncheckpointed recent writes. Apple requires source/destination models to be available for inferred migration; see [Core Data automatic migration](https://developer.apple.com/documentation/coredata/migrating-your-data-model-automatically) and [NSMigrationManager](https://developer.apple.com/documentation/coredata/nsmigrationmanager). Android migration tests use the existing Room 2.8.3-compatible `androidx.room:room-testing:2.8.3` and exported schema assets; do not switch to Room 3 merely because newer examples use it. See [MigrationTestHelper](https://developer.android.com/reference/androidx/room/testing/MigrationTestHelper).
- [x] **Atomic import:** load current record and receipt inside one transaction, compare to preview hashes, fail `내용이 바뀌어 다시 확인이 필요합니다` if stale. No receipt → insert/reuse exactly according to disposition and decision. Existing successful receipt → return target without overwriting later local edits. Conflict → only explicit keepBoth creates proposed UUID trip; record source mapping. Previously deleted → only explicit restoreDeleted inserts new UUID and appends old target to receipt history. Write trip + receipt, verify payload/ID by re-reading within transaction, then commit. Do not set completion preference outside this transaction. Roll back both on any failure.
- [x] **Schedule storage:** re-read latest trip inside transaction before applying a ScheduleChange; write + re-read before returning. Never save the UI's stale whole document over a newer one. On iOS use Core Data queue confinement; on Android use existing Dispatchers.IO and `withTransaction`.
- [x] **GREEN DB tests:** actual disk DB original schema → new schema, original bytes/IDs preserved; import→reopen→repeat yields one trip/receipt; local edit after import survives repeat; keepBoth repeat yields one copy; deleted destination requires explicit restore; preview stale rejection; inject failure between trip/receipt writes and ensure neither partially commits; retry succeeds; malformed file leaves all rows untouched. Original source bytes stay identical in receipt. Test schema mismatch failure without destructive fallback.

```kotlin
val candidate = TripBackup.decode(fixtureBytes("legacy-trip-backup.json"))
val first = repository.commitImport(repository.prepareImport(candidate), ImportDecision.ConfirmNew)
val again = repository.commitImport(repository.prepareImport(candidate), ImportDecision.ConfirmNew)
assertEquals(first.tripID, again.tripID)
assertEquals(1, repository.list().size)
assertTrue(again.alreadyImported)
```

## Task 3: iOS 일정 화면과 시스템 파일 흐름

**Files**

- Create: `ios/NativePreview/ItineraryView.swift`, `PlaceEditorView.swift`, `TripBackupView.swift`, `TripBackupFile.swift`.
- Modify: `ios/NativePreview/TripListView.swift`, `NativeTripStore.swift`, `NativeRootView.swift`, `ios/project.yml`, `ios/NativePreviewUITests/NativeTripUITests.swift`.

- [x] **RED UI tests:** create trip→open itinerary→add manual place→edit memo/time→move to reserve→relaunch→assert same section/time/memo. Assert inaccessible delete is not triggered without confirmation. Accessibility identifiers: `openItinerary`, `section-reserve`, `section-day-1`, `addPlace`, `placeName`, `placeTime`, `placeMemo`, `savePlace`, `backupImport`, `backupExport`, `confirmImport`, `keepBothImport`.
- [x] **Implement:** keep existing trip info edit entry, replace empty day summary with entry to ItineraryView. Sections have horizontally scrollable picker and vertically scrollable items, bottom tab space managed by SwiftUI. List rows expose edit/move/shift/delete menu; selected day is a serializable integer/reserve token. PlaceEditorView is a sheet using local draft state; failed saves retain it. Disable interactive dismiss when edited and ask before explicit discard. Use `.font(.body)`/Dynamic Type and native minimum touch sizes, not web fixed pixel heights.
- [x] **File adapter:** `TripBackupFile: FileDocument`, readable/writable `.json`, regular-file data only. `.fileImporter` handles security-scoped access with balanced start/stop; read bounded bytes off the main actor; pass immutable candidate to main actor for preview. `.fileExporter` writes TripBackup.encode output and distinguishes cancellation/failure from completion. Use sanitized filename `<trip-name>-backup.json` (replace filesystem separators/control chars; cap 80 characters), no token in name/log. No database write in picker completion until confirmation.

  Access lifetime follows [Apple security-scoped URL guidance](https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource()). Balance only an acquired access; release it after the bounded read finishes, not before an asynchronous read starts.
- [x] **Store:** expose prepare/commit/apply methods via NativeTripStore; publish re-read DB state only on success. Changing tabs must not cause input draft reset. Place editor invalid time and storage error use inline explanation. More offers import even with zero trips; export selects a trip explicitly.
- [x] **GREEN:** simulator test above, invalid file/cancel/keepBoth preview, re-open persisted schedule, large accessibility text scroll to save, keyboard, landscape/portrait. Generate project with `xcodegen generate`; preserve original TravelPlaner scheme and deployment floor. Build and run tests on the installed simulator. If Simulator GUI remains unavailable, report it and capture runtime screenshots rather than claiming its window opened.

## Task 4: Android 일정 화면과 시스템 파일 흐름

**Files**

- Create under `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/`: `ItineraryScreen.kt`, `PlaceEditorScreen.kt`, `TripBackupScreen.kt`, `TripBackupViewModel.kt`.
- Create: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/data/BackupFileAccess.kt`.
- Modify: `ui/TripPlotApp.kt`, `ui/TripViewModel.kt`, `src/androidTest/.../NativePreviewUiTest.kt`, `src/test/.../TripViewModelTest.kt`, module gradle test dependencies only if required by migration tests.

- [x] **RED UI tests:** create→itinerary→manual place→change time/memo→reserve→recreate activity→relaunch→same saved fields. Use equivalent test tags to iOS and add `place-error`, `import-error`, `import-preview`. Repository failure fake must leave draft and no success navigation.
- [x] **Implement:** extract itinerary-related new UI into focused files, not expanding the existing 400-line TripPlotApp with all forms. Navigation arguments contain trip ID/section/item-key encoding only. ItemKey encodes as `s:<text>` or `n:<integer>` before URI escaping, so numeric/text IDs never collide. Use LazyColumn, horizontal section row, popup actions and deletion AlertDialog. Store editor draft in SavedStateHandle; rotation/tab restoration must preserve it. Name, time, memo values must match the latest edit when Save is pressed.
- [x] **File adapter:** use `ActivityResultContracts.OpenDocument` (JSON MIME + wildcard fallback only for selection; content must pass decoder) and `CreateDocument("application/json")`. Read `ContentResolver.openInputStream` bounded bytes on Dispatchers.IO; close streams via `use`. Cancellation null URI returns without changing state. For output, success only after flush/close, error remains actionable. Do not request all-files or storage runtime permission. No FileProvider needed when using CreateDocument to a caller-selected URI.

  Use the system document picker rather than broad storage access, following [Android shared-document guidance](https://developer.android.com/training/data-storage/shared/documents-files). Existing files are not silently overwritten by the create-document workflow.
- [x] **ViewModel:** draft/candidate/operation UUID state, progress, error and completion stored separately. Large source bytes stay in app-private temporary files or repository-owned objects, never SavedStateHandle Bundle. If process dies before import confirmation, reopen selection/preview; if after DB commit, receipt identifies success. Persisted receipt resolves retry, not an in-memory flag. Temporary files contain no externally accessible URI and are only cleaned when not referenced by an active operation.
- [x] **GREEN:** JVM and Room migration tests, UI create/edit/move/restore, document flow from a fixture using Android test DocumentsProvider, picker cancel, invalid/oversize read, write failure, no unwanted permissions. Rebuild/install nativepreview without uninstalling existing app or clearing data; keep :app build passing.

## Task 5: 실제 파일 왕복·원본 보존·인계

**Files:** `docs/native-itinerary-transfer-verification.md`, `README.md`, `기록-history.md`, this plan.

- [x] **Export cross-check:** native exports are plain single-trip JSON, readable by the existing web importer (`name` + `itinerary`). Feed iOS export into Android and Android export into iOS using selected files; compare all unedited JSON fields to the original fixture. Export excludes sharing credentials/receipt internals and includes unknown fields.
- [x] **Web limitation:** existing web import explicitly reconstructs a new trip and regenerates its root ID; it can omit unknown root keys (`src/App.jsx:3169`). Verify current supported fields survive actual web import, but do not claim its importer preserves arbitrary unknown keys. Native→native and native backup file round trips must preserve those keys. Changing web import behavior is a separate request, not silently included here.
- [x] **Restart:** create a test trip, add place, move/reorder, export, force-stop, relaunch, import the same file twice, then verify rows/receipts/counts. No real user travel input is required; use clearly named test fixtures and preview sandbox only. Do not delete test samples without documenting their exact targets.
- [x] **Regression commands:**

```bash
swift test --package-path ios/NativeCore
cd ios
xcodegen generate
xcodebuild -project TravelPlaner.xcodeproj -scheme TripPlotNativePreview \
  -destination 'platform=iOS Simulator,id=3081E2CF-3CDB-491E-9A45-6858DA1D606A' \
  -derivedDataPath DerivedData/NativePreviewStage2Final -parallel-testing-enabled NO \
  -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO COMPILATION_CACHE_ENABLE_CACHING=NO test
# From repository/android:
./gradlew :nativepreview:testDebugUnitTest :nativepreview:connectedDebugAndroidTest \
  :nativepreview:assembleDebug :nativepreview:lintDebug :app:assembleDebug
# From repository root:
npm test
npm run native:security
git diff --check
```

- [x] **Final review and docs:** record actual results, remaining warnings, schema migration behavior, original file retention, request ID, screenshots, installed app identifier, supported import limits and uncaptured platform configurations. A failed or unavailable independent reviewer must be disclosed, not counted as passed. Mark step 2 complete only when both platforms' schedule and file/storage flows are working; if only a subtask is done report partial progress.

## 계획 자체 점검 및 실행 인계

- 기존 단계 2의 일정·예비 목록·순서·시간·파일 이전을 Task 1–5로 연결했다. 지도·전역 즐겨찾기·계정 자동 이전·정산은 후속 단계로 남긴다.
- 공통 데이터 계약과 DB 실패 정책을 먼저 구현하고, iOS·Android UI를 이어서 연결한다. 두 플랫폼에 동일 fixture와 예상 결과를 사용한다.
- 기존 Core Data가 파일 기반 모델이 아니라 프로그램 생성 모델이라는 점을 반영해 원본 모델을 명시적으로 유지하도록 했다. DB 초기화로 마이그레이션을 대신하지 않는다.
- 새 구현과 무관한 웹 미커밋 수정·기존 앱 타깃은 보존했다. 기존 앱과 별도 식별자로 구현·검증했으며 커밋·푸시·배포는 하지 않았다.
- 같은 작업에서 주 작업자가 순서대로 구현하고 검증했다. 마지막 독립 검토는 사용량 제한으로 실행되지 않아 통과로 간주하지 않는다. 작성자의 직접 검토와 검증 결과는 별도 문서에 기록했다.
