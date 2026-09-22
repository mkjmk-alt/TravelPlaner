# TripPlot 네이티브 기반 Implementation Plan

> **For agentic workers:** Use the approved spec and implement the disjoint platform tasks with superpowers:dispatching-parallel-agents. Steps use checkboxes for tracking.

**Goal:** iOS·Android에서 웹 본문 없이 네이티브 5개 탭과 여행 생성·조회·편집·로컬 영구 저장이 실제 동작하는 미리보기 앱을 제공한다.

**Architecture:** 기존 출시 타깃과 별도로 `com.travelplaner.app.nativepreview` 미리보기 앱을 추가한다. 웹과 호환되는 원본 JSON을 보존하고 네이티브 저장소(Core Data/Room)에 기록한다. 화면은 DB 저장 성공 후 갱신하고 실패를 사용자에게 표시한다.

**Tech Stack:** SwiftUI, Foundation/Core Data, XCTest; Kotlin, Compose, Room, JVM/instrumentation tests.

**Spec:** `docs/superpowers/specs/2026-09-20-tripplot-native-ui-design.md`의 단계 1. 사용자가 설계를 승인하고 첫 단계 구현에 동의함.

## Global Constraints

- iOS 16.0 / Android minSdk 26 유지. 운영 식별자 `com.travelplaner.app`와 서명키를 변경하지 않는다.
- 내 여행·지도·저장·지출·더보기 5개 탭. 첫 단계 미구현 기능은 미리보기 안내로 명시한다.
- 기존 React 오류 수정 및 모든 사용자 변경을 보존한다. 서버·계정 데이터 접근/푸시/출시는 이번 범위가 아니다.
- 여행은 `itinerary: [{ day, items }]` 형식. 알 수 없는 JSON 필드·일정·예산·지출을 편집 과정에서 보존한다.
- 로그인·네트워크 없이 생성/저장/재실행. 기존 웹/앱 데이터의 실제 자동 이전은 다음 단계다.
- ID `Afv7A5tR7d`로 요청·답변·수정·검증을 `기록-history.md`에 누적한다.

## Review Focus

- 공백 이름·잘못된 날짜·역전 날짜·100일 초과는 저장하지 않음: 플랫폼 도메인 테스트.
- 이름·날짜 편집이 알 수 없는 필드·기존 일정 내용을 삭제하지 않음: 공통 fixture 왕복 및 일정 축소 거절 테스트.
- 앱 프로세스 재시작 후 SQLite 내용 유지: 저장소 재열기 및 UI 재실행 테스트.
- 저장소 쓰기/읽기 실패가 성공 표시나 기존 자료 초기화로 이어지지 않음: 실패 저장소와 손상 데이터 테스트/복구 UI 검토.
- 탭 전환·회전·키보드·큰 글자에서 작성 내용/저장 버튼 유지: 미리보기 UI 테스트와 시뮬레이터 확인.

## Task 1: 공통 계약과 iOS 미리보기 앱

**Files:** `contracts/native/fixtures/trip.json`, `ios/NativeCore/Package.swift`, `ios/NativeCore/Sources/NativeCore/TripDocument.swift`, `ios/NativeCore/Sources/NativeCore/TripRepository.swift`, `ios/NativeCore/Tests/NativeCoreTests/`, `ios/NativePreview/`, `ios/NativePreviewUITests/`, `ios/project.yml` 및 생성 Xcode project.

**Interfaces:** `TripDraft(name, country, startDate, endDate)`로 유효한 여행을 만들거나 편집한다. 저장소는 `list()`, `save(trip)`, `delete(id)`를 제공하며 실패하면 throw한다. 원본 JSON과 ID는 재읽기 후 유지한다.

- [x] 공통 fixture는 이름·날짜·2개 일차·예비 목록·지출·참여자·알 수 없는 필드를 포함한다.
- [x] `swift test --package-path ios/NativeCore`: `XCTAssertThrowsError(try TripDocument.create(draft: invalidDraft))` 및 fixture 편집 후 확장 필드 비교, SQLite 재열기 테스트를 먼저 작성한다.
- [x] 날짜를 Gregorian date-only로 검사하고 최대 100일까지 허용한다. 축소 범위의 일정이 비어 있지 않으면 거절하며 무음 삭제하지 않는다.
- [x] Core Data 트랜잭션 저장 및 실패 롤백을 구현한다. JSON 해석 실패를 빈 여행 목록으로 치환하지 않는다.
- [x] SwiftUI TabView·여행 목록·생성/편집 폼·상세·미리보기 상태 화면을 구현한다. 입력 오류는 폼에 남고 DB 성공 시에만 닫는다.
- [x] `xcodegen generate` 후 `TripPlotNativePreview` 시뮬레이터 빌드. XCUI 테스트에서 여행 생성→종료→재실행→이름 편집→재실행을 검증한다.

## Task 2: Android 미리보기 앱

**Files:** `android/nativepreview/build.gradle.kts`, `android/nativepreview/src/main/AndroidManifest.xml`, `android/nativepreview/src/main/java/com/travelplaner/nativepreview/`, 해당 모듈의 `src/test`/`src/androidTest`, `android/settings.gradle.kts` 및 필요한 root plugin 선언.

**Interfaces:** 공통 fixture와 같은 JSON 보존 계약. Kotlin `TripDraft` 및 `TripDocument`, Room에 `(id, json, updatedAt)` 저장. UI는 ViewModel을 통해 변경하고 저장 오류를 표시한다.

- [x] 도메인 테스트에서 공백·역전 날짜·100일 경계, fixture 편집 보존을 검증한다. `assertEquals(original["futureField"], edited["futureField"])`를 포함한다.
- [x] 별도 `:nativepreview` 모듈에 Compose·Room을 구성하고 기존 `:app`의 실행/배포 설정을 보존한다.
- [x] 5개 하단 탭·여행 목록·생성/편집·상세와 미리보기 상태를 구현한다. 뒤로 가기 및 저장 실패 시 폼 보존을 처리한다.
- [x] 실제 SQLite Room DB 닫기→다시 열기 테스트 및 Compose UI 생성/편집 테스트를 추가한다.
- [x] `./gradlew :nativepreview:testDebugUnitTest :nativepreview:assembleDebug :nativepreview:lintDebug`를 실행하고 에뮬레이터에서 저장·재실행을 검증한다.

## Task 3: 통합 검증·인계

**Files:** `docs/native-foundation-verification.md`, `README.md`, `기록-history.md`.

- [x] 두 앱의 공통 fixture 결과와 오류 정책을 직접 비교하고 저장·탭 복귀·기존 데이터 보호를 검토했다. 독립 검토는 보조 작업 사용량 제한으로 완료하지 못했으며 자체 검토로 대체했다.
- [x] 시뮬레이터/에뮬레이터에 실제 빌드를 설치해 실행한다. 아이콘 자산은 기존 것을 재사용하며 `TripPlot Native` 이름과 별도 식별자로 구분한다. iOS 실행은 확인했으나 로컬 Xcode 설치에 Simulator GUI 앱이 없어 실행 화면 캡처로 제공한다.
- [x] 기존 웹 `npm test` 및 native-security 검사로 기존 타깃의 회귀를 확인한다. 변경 파일에 `git diff --check` 실행.
- [x] 실제 빌드·테스트 결과와 앱 실행 방법, 미구현 지도·정산·동기화·이전 범위를 기록한다. 첫 단계 완료와 전체 전환 완료를 구분해 사용자에게 안내한다.

## Execution ledger

- 2026-09-20: 사용자 승인에 따라 계획 작성과 구현을 연속 수행한다. 즉시 필요한 공통 계약과 iOS는 주 작업자가 담당하고, 파일이 분리된 Android 모듈은 병렬 작업자로 구현한다. 추가 설계 승인 요청을 반복하지 않는다.
- 현재 체크아웃의 기존 사용자 변경은 그대로 두고 별도 설치 가능한 preview 타깃/모듈로 구현을 격리한다. 새로운 git 커밋·푸시는 요청 시 수행한다.
- 2026-09-20 후속 요청 `4KU7O4EC0R`: 보조 작업 사용량 제한 이후 주 작업자가 Android 검증·수정·최종 인계를 이어받음. iOS 도메인/저장 11개+UI 1개, Android 단위 13개+기기 6개, 기존 웹 81개 및 native-security 통과. 초기 iOS 화면 복원 테스트 실패와 Android lint/테스트 컴파일 실패를 수정 후 재검증함.
