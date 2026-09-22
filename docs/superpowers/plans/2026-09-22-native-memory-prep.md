# TripPlot 네이티브 여행 기록·준비 구현 계획

> **For agentic workers:** 이 계획은 사용자가 지정한 서브에이전트 없는 직접 실행 방식으로 구현한다. 실행 시 `superpowers:executing-plans`의 진행 기록·검증 지침을 적용한다.

**Goal:** 더보기에서 여행 기록·사진·체크리스트·항공/숙소 정보를 저장하고, 재실행 및 사진 포함 JSON 백업 복원까지 검증한다.

**Architecture:** 기존 여행 원본 JSON에 항목별 명령을 적용한다. 파일은 새 UUID에 저장한 후 DB 참조를 커밋하며, JSON 내보내기에서만 사진을 웹 호환 `imageDataUrl`로 변환한다. SwiftUI/Compose 화면과 진입 경로를 같은 작업에서 연결한다.

**Tech Stack:** Swift 5/SwiftUI/iOS 16, NativeCore/Core Data, Kotlin/Compose/Room/Android API 26+, 기존 JSON·파일 선택기 인프라.

**Spec:** [여행 기록·준비 설계](../specs/2026-09-22-native-memory-prep-design.md)

**검토 요청 ID:** `ecJrE3CiUC`

**상태:** 실제 코드 대조 후 계획 수정 완료. 아래 체크박스는 구현 완료가 아니며 모두 미실행이다.

## 검토에서 발견한 수정 사항

| 중요도 | 기존 계획의 문제 | 실제 근거와 수정 방향 |
| --- | --- | --- |
| 높음 | 체크리스트에 `completed` 사용 | 웹 `src/App.jsx:3808`, 기본값 JSON은 `checked`. 이름·타입을 그대로 맞춘다. |
| 높음 | 로컬 사진 파일명만 JSON 백업 | 웹 `getJournalEntries`/사진 렌더러는 `imageDataUrl`만 읽는다. 5-A에서 사진 포함 백업을 완료한다. |
| 높음 | 같은 파일 교체 후 DB 저장 실패 시 원본 손상 | 새 불변 파일 → DB 참조 커밋 → 참조 확인 후 정리로 변경한다. |
| 높음 | 체크 배열 전체 교체와 인덱스 식별 | 항목 명령·기존 값 비교로 변경한다. ID 없는 행은 배열 스냅샷을 검증한다. |
| 높음 | iOS UI 테스트보다 뒤에 메뉴 연결 | iOS 화면·NativeRootView 목적지·Xcode 소스 등록을 한 작업에서 완료한다. |
| 중간 | 존재하지 않는 함수/속성으로 예시 테스트 | `normalizeMemory`, JS `normalizeChecklist`, `TripDocument.journalEntries`를 현재 API로 가정하지 않는다. 실제 웹 helper와 명시된 새 API로 검증한다. |
| 중간 | 루트에 없는 `./gradlew`, 기기 검사에 `--tests`, Room을 JVM에서 검사 | `android/gradlew -p android`, runner class 인자, 실제 DB는 androidTest로 수정한다. |
| 중간 | 직접 만든 작은 상태 객체만으로 강제 종료 복원 보장 | 여행·초안별 로컬 초안 파일과 사진 임시 참조를 보존한다. 저장된 기록과 미저장 초안을 각각 검사한다. |
| 중간 | 기존 파일 선택기로 생성한 fixture 덮어쓰기 | 기존 증거 파일은 유지하고 memory 전용 fixture를 추가한다. |
| 중간 | 실패 원인을 미리 환경 문제로 분류 | 로그·콜백·재현 결과로 원인을 확인하고, 확인 전에는 미검증/실패로 보고한다. |

## Global Constraints

- iOS 16.0, Android API 26 최소 지원과 기존 preview 앱 ID를 유지한다.
- 웹 모델은 `checklist: [{id, label, checked}]`, `travelDetails` 다섯 문자열, `journalEntries` 원본 객체다.
- 지도 키와 서버 연결 없이 이 단계의 로컬 기능이 동작한다.
- 원본 미지 필드·숫자/문자 ID·생성 시각을 보존한다. 읽기용 정규화 결과를 원본 전체로 다시 저장하지 않는다.
- 항목 추가는 초안 operation ID를 재사용하고, 수정/삭제는 최신 행과 편집 시작 시 원본을 비교한다.
- 사진은 앱 전용 파일에 보관한다. 새 파일 저장/DB 저장 실패 시 기존 사진·기록은 보존한다.
- 2,621,440 bytes 신규 사진 제한, 최종 20 MiB JSON 백업 제한을 실제 바이트로 검증한다.
- 날짜는 시간대 없는 문자열. 제목 80/본문 2000은 UTF-16 길이 기준이며 기존 초과 값은 그대로 두면 보존한다.
- iCalendar·CSV·통계 이미지 공유는 5-B, 서버·계정은 6단계다. 사진 포함 JSON 복원은 5-A에 포함한다.
- 현 작업 트리의 이전 네이티브 변경을 보존한다. 커밋·푸시·배포는 별도 요청 시 진행한다.
- 각 작업 결과는 `.superpowers/sdd/2026-09-22-native-memory-prep/progress.md`에 남긴다. 구현 때의 요청 ID로 이력을 추가한다.

## Review Focus

1. 체크/기록 원본 확장 필드와 숫자/문자/누락/중복 ID: Task 1·2.
2. 사진 저장 직후 DB 실패, 중간 종료, 다른 초안에서 참조 중인 파일: Task 2·3.
3. 웹·iOS·Android 간 사진 바이트 복원 및 백업 크기 초과: Task 3·6.
4. 여행 변경/삭제 후 늦게 도착하는 사진 응답과 초안 혼입: Task 4·5.
5. 같은 이름의 여행·기록·체크 항목, 빈 목록/읽기 실패, 탭 복귀: Task 4·5·6.

## 명령 실행 기준

모든 명령은 저장소 루트에서 실행한다. 현재 셸은 기본 Java Runtime을 찾지 못하지만 아래 JDK 17 디렉터리가 존재함을 확인했다.

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
android/gradlew -p android help --task :nativepreview:connectedDebugAndroidTest --offline --console=plain
```

위 help는 이번 검토에서 성공했다. 기기 task에는 `--tests`가 없고 `--serial`이 있다. JVM 테스트만 `--tests`를 사용한다. 기기 클래스 선택:

```sh
android/gradlew -p android :nativepreview:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.travelplaner.nativepreview.MemoryPersistenceTest
```

단일 기기를 선택할 때는 현재 연결된 기기를 먼저 확인하고 `--serial`을 붙인다. 새 테스트는 아직 없으므로 위 기기 테스트 명령은 구현 후 실행한다.

iOS 대상은 실행 시 `xcrun simctl list devices available`로 확인한다. 검토 시 booted iPhone Duo ID는 `4AF03983-3DE4-45C3-8A35-4DCC2A8D88BB`다. 새 SwiftUI 파일 추가 뒤:

```sh
xcodegen generate --spec ios/project.yml --project ios
xcodebuild test -project ios/TravelPlaner.xcodeproj -scheme TripPlotNativePreview \
  -destination 'platform=iOS Simulator,id=4AF03983-3DE4-45C3-8A35-4DCC2A8D88BB' \
  CODE_SIGNING_ALLOWED=NO -only-testing:TripPlotNativePreviewUITests/MemoryPrepUITests
```

실제 실행 전 대상 존재 여부를 다시 확인한다. 구현이 없는 함수의 단순 컴파일 실패를 RED 완료 증거로 기록하지 않는다. API를 컴파일 가능한 최소 형태로 연결한 뒤 동작 assertion 실패를 확인한다. 이미 동작하는 웹 helper에 대한 계약 검사는 처음부터 통과해도 정상이며 억지로 실패시키지 않는다.

## Task 1: 실제 웹 계약에 맞춘 순수 모델과 변경 명령

**Files**
- Create: `contracts/native/fixtures/memory-prep.json`
- Create: `tests/native-memory-prep-parity.test.mjs`
- Create: `ios/NativeCore/Sources/NativeCore/TravelMemory.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/TravelMemoryTests.swift`
- Create: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/domain/TravelMemory.kt`
- Create: `android/nativepreview/src/test/java/com/travelplaner/nativepreview/TravelMemoryTest.kt`

**Interfaces**

- Swift: `TripMemory.apply(_ change: MemoryChange, to trip: TripDocument, now: Double) throws -> TripDocument`.
- Kotlin: `TripMemory.apply(change: MemoryChange, trip: TripDocument, now: Long): TripDocument`.
- Swift enum/Kotlin sealed interface `MemoryChange`: `setTravelDetails`, `addChecklist`, `setChecklistChecked`, `removeChecklist`, `addJournal`, `editJournal`, `removeJournal`. Kotlin case names use PascalCase.
- Row selector: unique typed ID + expected original row; legacy/duplicate ID: index + expected original array. Existing `ItemKey` supports typed string/integer IDs.
- Add arguments: operation ID + validated draft. Set-checked carries the target boolean, not an instruction to toggle again.
- Details arguments: changed field values + expected previous values. Journal edit carries explicit keep/replace/remove photo and keep/set/remove place actions; absent fields are not removals.
- Read-only views keep original row/selector beside display values. No `journalEntries` accessor on `TripDocument` is assumed.

- [ ] Build fixture with checked=true, unknown root/row fields, missing/duplicate/numeric IDs, removed-place snapshot, date-less journal, identical timestamps, local image reference and embedded image cases. Existing ID types remain unchanged.
- [ ] Implement the Node contract test using existing helpers only:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getTravelDetails, getJournalEntries, sortJournalEntriesForTimeline } from '../src/travelMemory.js';

const f = JSON.parse(fs.readFileSync(new URL('../contracts/native/fixtures/memory-prep.json', import.meta.url), 'utf8'));
test('native fixture agrees with the existing web view of travel memory', () => {
  assert.deepEqual(getTravelDetails(f.trip), f.expected.travelDetails);
  assert.deepEqual(sortJournalEntriesForTimeline(getJournalEntries(f.trip)).map(e => e.id), f.expected.webJournalOrder);
  assert.deepEqual(f.trip.checklist.map(e => Boolean(e.checked)), f.expected.checked);
});
```

- [ ] Write Swift/Kotlin behavioral cases: set checked preserves other row fields; two stale edits cannot clobber each other; deleting a preceding legacy row invalidates old index; repeat same add is idempotent, different content with same operation ID fails; date/blank/title validation; preserve place snapshot and createdAt.
- [ ] Run `swift test --package-path ios/NativeCore --filter TravelMemoryTests` and `android/gradlew -p android :nativepreview:testDebugUnitTest --tests com.travelplaner.nativepreview.TravelMemoryTest`; confirm expected behavioral failures, implement minimal command application, rerun to PASS.
- [ ] Run `node --test tests/native-memory-prep-parity.test.mjs`. Unknown-field preservation is asserted against reducer output in Swift/Kotlin, not merely the unchanged input fixture.
- [ ] Record Unicode ID tie sorting behavior separately from ASCII/UUID web parity; stable original ordering for equal keys. Validate numeric ID 1 and string ID "1" remain distinct internal targets.

## Task 2: 원자적 DB 저장·불변 사진·초안 파일

**Files**
- Modify: `ios/NativeCore/Sources/NativeCore/TripRepository.swift`
- Create: `ios/NativeCore/Sources/NativeCore/TravelMediaStore.swift`, `MemoryDraftStore.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/MemoryRepositoryTests.swift`, `TravelMediaStoreTests.swift`, `MemoryDraftStoreTests.swift`
- Modify: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/data/TripRepository.kt`
- Create: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/data/TravelMediaStore.kt`, `MemoryDraftStore.kt`
- Create: `android/nativepreview/src/androidTest/java/com/travelplaner/nativepreview/MemoryPersistenceTest.kt`
- Modify: `android/nativepreview/src/test/java/com/travelplaner/nativepreview/TripViewModelTest.kt`, `TripBackupViewModelTest.kt` (repository test doubles)

**Interfaces**
- `TripRepository.applyMemoryChange(tripID:change:)` returns the persisted TripDocument, delegates to Task 1 inside the existing DB transaction.
- Media store accepts verified bytes + trip identity and generates a new opaque reference; read/delete only accepts references within its managed root. No caller-supplied record ID is a disk path.
- Draft store key is `(tripID, feature, draftID)`; payload has text, original row snapshot, operation ID and photo reference. Persisted JSON and media are separate files.

- [ ] Add repository tests for stale row conflict, unknown-field preservation, missing trip, malformed array refusal, SQLite/Room close→reopen, no timestamp change on replay.
- [ ] Put real Room tests in `src/androidTest`; JVM tests exercise pure reducer/ViewModel and file helpers only when Android APIs are not required.
- [ ] Implement the repository method and all existing test doubles together; Swift repository is a final class, not a protocol.
- [ ] Add file lifecycle tests: new file succeeds then DB fails → old file unchanged; crash before commit → old JSON still resolves; repeat save → no duplicate record; checked path traversal/symlink cannot escape media root.
- [ ] Write photos to a new UUID file under a SHA-256 trip directory, atomically publish the file, then update the DB reference. Serialize draft/media commits and cleanup. Retain failed draft's candidate photo for retry; discard only on explicit cancel or after reference-aware cleanup.
- [ ] Persist drafts during editing, not only on background; store bytes outside saved-state bundles. Recovery handles saved JSON with stale draft after a crash by comparing operation ID/payload before retrying.
- [ ] Cleanup runs after commits and on startup, only after successfully reading all trips, drafts and in-flight export references. Read failure skips cleanup. Unreferenced files only; original receipts and external files are never targets.
- [ ] Run focused Swift tests and Android instrumented `MemoryPersistenceTest` via the runner command above; failure injection must check actual persisted old JSON and old photo bytes.

## Task 3: 사진 포함 JSON 백업·가져오기 연결

**Files**
- Create: `ios/NativeCore/Sources/NativeCore/MemoryBackup.swift`
- Modify: `ios/NativeCore/Sources/NativeCore/TripBackup.swift` (explicit import-local-reference handling)
- Modify: `ios/NativePreview/NativeTripStore.swift`, `TripBackupView.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/MemoryBackupTests.swift`
- Create: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/domain/MemoryBackup.kt`
- Modify: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/domain/TripBackup.kt`
- Modify: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TripBackupViewModel.kt`
- Modify: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/MainActivity.kt` (only constructor wiring for media-aware backup)
- Create: `android/nativepreview/src/test/java/com/travelplaner/nativepreview/MemoryBackupTest.kt`
- Create: `contracts/native/fixtures/memory-ios-export.json`, `memory-android-export.json`
- Modify: `tests/native-memory-prep-parity.test.mjs`

**Interfaces**
- `MemoryBackup.encode` takes TripDocument + bounded local-image resolver, returns portable UTF-8 JSON bytes.
- Output includes photos as `imageDataUrl`, excludes recognized `imageFileName` and shared control fields. No DB write during export.
- Existing TripBackup decoding/import receipts remain responsible for original bytes, preview, conflict handling and idempotency.

- [ ] Create a small real decodable PNG fixture (generated binary fixture is acceptable); test decoded bytes/hash, not presence of a data-URL string alone.
- [ ] Write failing cases: local photo→portable JSON→fresh media directory import→photo bytes available; missing photo refuses export; total encoded JSON just below/above 20 MiB; cancellation keeps original DB/files.
- [ ] Implement transient-copy conversion with bounded reads and base64 byte accounting. Keep legacy `imageDataUrl` unchanged unless user replaced/removed the photo. Replacing with a local photo clears the stale embedded payload in the same DB command; removing a photo clears both recognized sources. Keep-source action preserves the original byte representation.
- [ ] Route actual iOS/Android backup buttons through MemoryBackup. Keep pure TripBackup for non-media payloads, but no photo-bearing UI export may bypass the resolver.
- [ ] On import, ignore/remove external local media references with preview warning and preserve source bytes. Embedded images remain in JSON for this stage; no file materialization transaction is needed on import.
- [ ] Preserve existing `ios-export.json`/`android-export.json` as earlier system-picker evidence. New fixtures are labeled synthetic until regenerated by actual new export flows.
- [ ] Test web helper sees exported `imageDataUrl` and source extension fields remain in raw JSON. Web's view helper intentionally projects only known fields; do not claim later web edits preserve every unknown native extension.
- [ ] Run `swift test --package-path ios/NativeCore --filter MemoryBackupTests`, Kotlin `MemoryBackupTest`, and Node parity test.

## Task 4: iOS 화면과 더보기 진입을 함께 구현

**Files**
- Modify: `ios/NativePreview/NativeRootView.swift`, `NativeTripStore.swift`
- Create: `ios/NativePreview/TravelMemoryView.swift`, `TravelPrepView.swift`, `TravelDetailsView.swift`
- Create: `ios/NativePreview/MemoryEditorModel.swift`, `MemoryPhotoLoader.swift`
- Create: `ios/NativePreviewUITests/MemoryPrepUITests.swift`
- Regenerate: `ios/TravelPlaner.xcodeproj/project.pbxproj` through existing `ios/project.yml`

**Interfaces**
- Screens receive fixed tripID; root owns shared activeTrip selection.
- Editor model uses Task 1 commands, Task 2 drafts/media, store success/failure. Photo callbacks include tripID/draftID/selectionID and ignore stale responses.
- Core Data/file work off main thread; SwiftUI state publication on MainActor.

- [ ] Add focused UI tests with separate journeys: choose trip→open record→save/edit/delete/cancel; return to More→checklist; return to More→details. Every route is installed before tests can pass.
- [ ] Use ID-based accessibility identifiers such as `memory-row-<id>`/`checklist-row-<id>`; names are display assertions only. Duplicate labels must be independently actionable.
- [ ] Implement root routes and active-trip picker in this task. No selected trip with existing list gets a picker; empty list gets create-trip action while import stays visible; read error gets retry.
- [ ] Implement journal date/title/body/place/form, chronological list, edit and delete confirmation. Removed itinerary place stays a readable snapshot. Clear action removes linkage explicitly.
- [ ] Use PhotosUI PhotosPicker with selected-image loading; bounded file transfer and actual format check before decode. Existing web imageDataUrl also renders offline. New JPEG/PNG remain portable; convertible HEIF uses platform decoder and outputs JPEG/PNG. Preserve orientation and use thumbnail decoding.
- [ ] Implement preparation add/check/remove confirmation and all five travel detail fields. Changed fields only are sent to repository to avoid clobbering another edit.
- [ ] Save drafts throughout editing, reload by exact trip/draft identity, and clear only after persisted success or explicit discard. Switching tabs/trips or cancelled photo selection must not erase another draft.
- [ ] Regenerate Xcode project and check its diff preserves existing targets/packages/settings. Run targeted UI command and Core tests. Record simulator failure causes from evidence; do not assume an automation failure is harmless.

## Task 5: Android 화면·더보기 하위 navigation graph

**Files**
- Modify: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TripPlotApp.kt`
- Modify: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TripViewModel.kt`
- Create: `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TravelMemoryScreen.kt`, `TravelPrepScreen.kt`, `TravelDetailsScreen.kt`, `MemoryEditorViewModel.kt`, `MemoryPhotoLoader.kt`
- Create: `android/nativepreview/src/test/java/com/travelplaner/nativepreview/MemoryEditorViewModelTest.kt`
- Create: `android/nativepreview/src/androidTest/java/com/travelplaner/nativepreview/MemoryPrepUiTest.kt`

**Interfaces**
- More becomes a graph with `more/list`, `more/memory/{id}`, `more/prep/{id}`, `more/details/{id}` under route `more`. Preserve existing backup route callers and More selection for its backup destination.
- Existing tab selection reads destination hierarchy; using a graph keeps More highlighted in child screens.
- Editor state keyed by trip/draft/operation ID, contains draft/busy/error/saved state. Existing TripViewModel handles trip refresh/mutation notifications; no unrelated global error booleans are required.

- [ ] Write ViewModel tests for failed persistence preserving draft, duplicate submit/retry, stale photo response after trip change, restore from disk draft, cancelled edit.
- [ ] Write UI tests with ID-based tags and explicit return to More between features. Verify child-route system back, tab switch/return, same-name rows and deleted trip.
- [ ] Implement graph and activation/restoration together. Keep route values serializable; encode/decode trip IDs including spaces and slashes.
- [ ] Use `ActivityResultContracts.PickVisualMedia` image-only contract; existing Activity 1.11 dependency is sufficient. Library fallback opens ACTION_OPEN_DOCUMENT when picker is unavailable. Do not request broad gallery permission or retain a URI as permanent photo storage.
- [ ] Copy selected content to controlled temporary storage with limit+1 bounded read on IO dispatcher; verify MIME/content dimensions, thumbnail decode and convert supported HEIF to portable JPEG/PNG. Error/cancel leaves prior photo and text. Provider URI is no longer needed after copy.
- [ ] Connect screens to repository result and draft files; keep image bytes out of SavedStateHandle. Internal dialogs use dialog back first, then route back. System picker owns its own back handling.
- [ ] Run JVM `MemoryEditorViewModelTest`, instrumented `MemoryPrepUiTest`, debug build/lint. Record API 26 fallback and current API behavior as separate checks; not having an API 26 device is an explicit unverified item, not a pass.

## Task 6: 기기 간 복원·재실행·회귀·검토

**Files**
- Modify: `ios/NativePreviewUITests/MemoryPrepUITests.swift`
- Modify: `android/nativepreview/src/androidTest/java/com/travelplaner/nativepreview/MemoryPrepUiTest.kt`
- Create: `docs/native-memory-prep-verification.md`
- Modify: `README.md`, `docs/native-app.md`, `기록-history.md`
- Track: `.superpowers/sdd/2026-09-22-native-memory-prep/progress.md`

- [ ] Save a uniquely named QA trip with record/photo, checked item and stayName. Relaunch the iOS app through XCTest and assert persisted data plus actual image decoding.
- [ ] Android: first finish the setup instrumentation, then external ADB force-stop/start the preview package, then separately verify persisted UI. Do not kill the runner inside its own instrumentation test or clear app storage.
- [ ] Repeat with an unsaved text/photo draft; restored draft must stay attached to its original trip even after choosing another trip.
- [ ] Export iOS→import Android in fresh media storage and Android→iOS; check title, checked state, details, exact image bytes, deleted-item absence. Web test/preview confirms embedded image displays. Preserve existing user records while creating QA data.
- [ ] Test picker cancel/provider read failure, slow image selection followed by trip switch, image 2.5 MiB boundary, final JSON 20 MiB boundary, failed DB write after photo staging, and cleanup with shared references.
- [ ] Check keyboard/large text/small screen/tablet layout and scrolling; no menu/footer covers save action.
- [ ] Run once after final implementation:

```sh
npm test
npm run build
npm run native:security
swift test --package-path ios/NativeCore
android/gradlew -p android :nativepreview:testDebugUnitTest :nativepreview:assembleDebug :nativepreview:lintDebug
xcodebuild build -project ios/TravelPlaner.xcodeproj -scheme TripPlotNativePreview \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
git diff --check
```

- [ ] Re-run targeted connected suites after relevant fixes. Record test counts and device IDs; an unavailable external dependency or unexplained failure stays unverified/failed.
- [ ] Independently re-read the final diff without a subagent. Compare every spec requirement with implemented path and evidence. Document remaining limits and 5-B/6 roadmap accurately; no completed checkbox based only on code inspection.
- [ ] Update history with the execution request ID, actual changes and actual outcomes. No additional design/plan approval loop is needed for previously authorized implementation; this review request itself changes only documents.

## 외부 API 확인 자료

- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker): 선택 사진 접근과 ACTION_OPEN_DOCUMENT fallback.
- [Android 명령행 테스트](https://developer.android.com/studio/test/command-line): JVM과 instrumented 검사 구분.
- [Apple PhotosPicker](https://developer.apple.com/documentation/photosui/photospicker): SwiftUI 사진 선택기 진입점.
- 현재 저장소 Gradle task help 출력은 이번 검토에서 직접 확인했다. 기능 테스트·빌드 통과는 아직 주장하지 않는다.
