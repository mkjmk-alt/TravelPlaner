# TripPlot 네이티브·웹 동기화 및 데이터 이전 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement task-by-task in this session; do not use subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹과 SwiftUI 앱이 여행·저장 장소를 같은 Supabase 계정에서 안전하게 양방향 동기화하고 기존 데이터를 복구 가능한 방식으로 이전한다.

**Architecture:** 로컬 Core Data 저장과 계정별 outbox를 먼저 기록하고, Supabase의 revision·operation receipt·tombstone 계약으로 재시도와 동시 편집을 조정한다. 웹은 기존 v1 `user_state`를 보존한 채 v2로 이전하고, 네이티브는 같은 Auth 프로젝트를 사용하되 토큰은 Keychain에 보관한다. 이 계획에서는 현재 WKWebView 출시 화면을 SwiftUI 화면으로 교체하지 않는다.

**Tech Stack:** React, Supabase JS v2, Supabase Postgres/RLS/RPC, SwiftUI, Swift Concurrency, Core Data, Supabase Swift SDK, XCTest, Node `node:test`, SQL/pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-13-tripplot-native-sync-migration-design.md`

## Global Constraints

- “iOS는 기존 `NativeCore` 저장소를 기반으로 로컬에 먼저 저장한다.”
- “iOS는 웹과 같은 Supabase Auth 프로젝트와 사용자 ID를 사용하되, 인증 토큰은 Keychain에 보관하고 WebView 쿠키와 공유하지 않는다.”
- “삭제는 tombstone으로 전파한다. 초기 버전은 tombstone을 자동 정리하지 않는다.”
- “revision이 오래된 쓰기는 서버에서 거절하고 현재 서버 문서를 반환한다.”
- “v1 `user_state` 행과 웹 로컬 원본은 전환 검증이 끝나도 롤백·복구 기간 동안 읽기 전용으로 유지한다.”
- “기존 운영 앱은 네이티브 동기화와 데이터 이전 검증이 끝날 때까지 교체하지 않는다.”
- 요청 ID `f4Q8mL1sZ6`를 기록에 사용한다. 기존 iOS·Android의 미커밋 변경을 수정·스테이징하지 않고, 구현 시 서브에이전트를 사용하지 않는다.
- Supabase service-role 키는 브라우저·앱·저장소에 넣지 않는다. 프로덕션 DB 적용, v1 쓰기 차단, 앱 배포는 이 계획의 자동 실행 범위가 아니며 별도 승인 후 수행한다.
- 기존 변경이 있는 파일은 편집 전에 기존 diff를 확인한다. 커밋 단계에서는 새로 만든 hunks만 선택적으로 stage하고, 분리가 불가능하면 그 파일을 포함한 커밋을 보류한다.

## Review Focus

- 같은 `operation_id` 재전송과 같은 revision의 동시 쓰기: Task 2 SQL 테스트에서 중복 1회 적용 및 나머지 충돌 응답을 확인한다.
- 오래된 revision으로 수정된 레코드: Task 1·4 테스트에서 양쪽 payload가 보존되고 사용자 선택 전 삭제되지 않는지 확인한다.
- 계정 전환 중 오프라인 대기 작업: Task 1·4 테스트에서 이전 계정 작업이 새 계정 토큰으로 전송되지 않는지 확인한다.
- 삭제 tombstone과 오래된 기기의 재연결: Task 2·4 테스트에서 삭제 레코드가 일반 동기화로 되살아나지 않는지 확인한다.
- 손상·부분 실패가 있는 v1/사진 이전: Task 3·5 테스트에서 원본 유지, 실패 항목 분리, 재실행 시 중복 방지를 확인한다.

---

### Task 1: 동기화 문서와 계정별 로컬 outbox

**Files:**
- Create: `contracts/sync/v2/record-v2.example.json`
- Create: `ios/NativeCore/Sources/NativeCore/SyncContract.swift`
- Create: `ios/NativeCore/Sources/NativeCore/SyncOutbox.swift`
- Modify: `ios/NativeCore/Sources/NativeCore/TripStoreModel.swift`
- Modify: `ios/NativeCore/Sources/NativeCore/TripRepository.swift`
- Modify: `ios/NativePreview/NativeTripStore.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/SyncContractTests.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/SyncOutboxTests.swift`

**Interfaces:**
- `SyncRecord`: `userID: String`, `recordType: SyncRecordType`, `recordID: String`, `payload: [String: Any]?`, `revision: Int64`, `updatedAt: Date`, `deletedAt: Date?`.
- `SyncOperation`: 영속 `operationID: UUID`, `userID`, `recordType`, `recordID`, `expectedRevision: Int64`, `payload`, `deletedAt`를 가진다. 같은 operation의 재시도에서 ID와 본문은 바뀌지 않는다.
- `SyncConflictChoice`는 `.keepLocal`과 `.acceptServer`를 제공한다. `SyncOutboxRepository`의 `enqueue(_:)`, `pending(userID:limit:)`, `markApplied(operationID:revision:)`, `saveConflict(operationID:serverRecord:)`, `conflicts(userID:)`, `resolveConflict(id:choice:)`는 이 저장소를 사용한다.
- `SyncRecordStateStore.applyRemote(_:)`는 마지막 서버 revision·payload·tombstone을 계정별로 영속한다. 서버 tombstone을 받아 로컬 객체를 제거한 뒤에도 삭제 revision은 남겨 오래된 페이지나 오프라인 기기에서 재생성되지 않게 한다.
- `SyncWriteContext(userID: String?)`를 기존 `TripRepository`의 모든 변경 진입점에 전달한다. 로그인된 변경은 해당 사용자 outbox에 저장하고, 비로그인 변경은 계정 없는 기기 초안으로 둔다. 원격 적용 메서드는 outbox에 재등록하지 않는다.
- Core Data 여행·저장 장소 행은 `ownerUserID == nil`인 기존 기기 데이터와 특정 계정에 연결된 원격 캐시를 구분한다. 새 계정 로그인 시 nil 행을 자동 업로드하지 않고 가져오기 미리보기 대상으로만 제시한다.

- [x] **Step 1: 계약 fixture와 저장소 테스트를 먼저 작성한다.** `SyncContractTests`는 payload의 미지원 필드와 문자열 ID를 왕복 보존하고 revision 0 및 tombstone을 해석하는지 검증한다. `SyncOutboxTests`는 한 계정의 대기열 조회, 동일 operation 재조회, 다른 계정 격리, 서버 적용 결과의 재등록 방지를 검증한다. 기존 Core Data 저장소 테스트에는 기존 여행·저장 장소·import receipt가 모델 업그레이드 후 바이트 단위로 보존되는 사례를 추가한다.
- [x] **Step 2: 실패를 확인한다.** `swift test --package-path ios/NativeCore`를 실행하고 새 테스트가 아직 구현되지 않은 계약/저장소 동작에서 실패하는지 확인한다.
- [x] **Step 3: 계약 타입과 영속 모델을 구현한다.** Core Data 모델에는 outbox, 계정별 `SyncRecordState`, 충돌 문서를 추가한다. 기존 `original`, `stage2`, `current` 모델을 삭제·재정의하지 말고 다음 단계 모델을 추가해 자동 마이그레이션을 검증한다. `TripRepository.save`, `delete`, `applySchedule`, expense/budget/participants/memory 변경, `savePlace`와 `deleteSavedPlace`에 `SyncWriteContext`를 전달하고 operation을 같은 DB 트랜잭션에 기록한다.
- [x] **Step 4: 동기화 테스트를 통과시킨다.** `swift test --package-path ios/NativeCore`를 다시 실행한다. 새 저장소에서 이전 모델 버전으로 만든 DB 재열기, 쓰기 롤백, 동일 ID 재시도, 사용자 간 outbox 격리가 모두 통과해야 한다.
- [x] **Step 5: Task 1 변경만 검토하고 커밋한다.** `git diff --check`를 실행한 뒤 Task 1에 나열된 파일만 stage하고 `feat: add account-scoped native sync outbox`로 커밋한다. 다른 기존 변경은 stage하지 않는다. `NativeTripStore.swift`는 기존 미커밋 JSON import 변경과 겹치므로 수정·스테이징하지 않았고, 아직 인증 사용자가 연결되지 않아 기본 `.device` 문맥을 사용한다.

### Task 2: Supabase v2 레코드·RPC 보안 계약

**Files:**
- Create: `supabase/migrations/202610130001_tripplot_sync_v2.sql`
- Create: `supabase/migrations/202610130002_tripplot_media_storage.sql`
- Create: `supabase/tests/tripplot_sync_v2.test.sql`
- Create: `tests/sync-migration-contract.test.mjs`
- Create: `tests/sync-rpc-concurrency.test.mjs`
- Modify: `functions/api/account.js`
- Modify: `tests/account-function.test.mjs`
- Modify: `functions/api/shared-trips.js`
- Modify: `tests/shared-trips-function.test.mjs`
- Modify: `src/App.jsx` (forward existing share-owner credentials to the revisioned API)

**Interfaces:**
- 테이블 `public.user_sync_records`: `(user_id, record_type, record_id)` 고유 키와 `payload`, `revision`, `updated_at`, `deleted_at`을 둔다. `record_type`은 `trip` 또는 `savedPlace`다.
- 테이블 `public.sync_operation_receipts`: `(user_id, operation_id)` 고유 키로 최종 처리 결과를 보존한다. 같은 ID가 다른 본문으로 재사용되면 거절한다.
- RPC `public.apply_user_sync_operation(p_record_type text, p_record_id text, p_expected_revision bigint, p_operation_id uuid, p_payload jsonb, p_deleted_at timestamptz)`: 인증 소유자만 쓰고 `applied`, `replayed`, `conflict`와 현재 revision/문서를 반환한다. 직접 테이블 쓰기는 허용하지 않는다.
- 공유 여행은 개인 `user_sync_records`에 섞지 않는다. 기존 `shared_trips`에 revision·deleted timestamp를 두고 `shared_trip_operation_receipts(trip_id, operation_id)`로 owner 관리 수정·삭제 재전송을 멱등 처리한다. `functions/api/shared-trips.js`의 기존 권한 검사를 유지한다.
- Storage는 비공개 bucket으로 두고 사용자 경로에 본인 소유 정책만 허용한다. 계정 삭제 API는 새 레코드/영수증과 사용자 prefix의 사진을 Auth 계정 제거 전에 정리한다.

- [x] **Step 1: DB와 API의 실패 테스트를 작성한다.** pgTAP으로 본인 레코드 읽기, 타인 읽기 거부, 직접 insert/update 거부, operation 재전송, 동일 expected revision 경쟁 쓰기, tombstone, Storage 경로를 검증한다. Node 테스트는 공유 여행의 권한 거부/권한 보유, stale revision, 삭제·중복 operation과 계정 삭제 시 본인 데이터·media만 정리하는지 고정한다.
- [ ] **Step 2: RPC 계약 테스트를 실행해 실패를 확인한다.** Supabase CLI가 설치된 검증 환경에서 `supabase test db`를 실행한다. CLI 또는 로컬 Supabase DB가 없는 경우 설치·프로덕션 적용을 임의로 시도하지 말고 이 DB 검증 항목을 미완료 외부 검증으로 남긴다.
- [x] **Step 3: migration과 RPC를 구현한다.** RPC는 `auth.uid()`를 확인하고, 레코드별 트랜잭션 잠금으로 revision 검증과 변경을 직렬화한다. 작업 영수증을 먼저 확인해 중복 요청은 이전의 동일 결과를 반환한다. 일반 역할의 직접 쓰기 권한을 회수하고 RLS는 소유자 조회만 허용한다. 삭제는 tombstone으로 남기며 일반 클라이언트가 영수증을 수정할 수 없게 한다.
- [x] **Step 4: 공유 여행·Storage·계정 삭제 호환성을 구현한다.** 기존 share/owner/관리자 권한 검사를 통과해야 공유 여행을 수정·삭제하게 하고 stale revision은 현재 값과 함께 conflict로 돌려준다. Storage 정책은 인증 사용자 ID가 객체 경로의 첫 구성요소와 일치할 때만 접근을 허용한다. `functions/api/account.js`는 본인 소유 media prefix와 동기화 데이터를 Auth 계정 제거 전에 정리하고 타 사용자 데이터는 건드리지 않는다. 서비스 역할 키는 서버에만 둔다.
- [ ] **Step 5: DB와 API 검증을 통과시킨다.** `supabase test db`에서 RLS, tombstone, Storage 경로 및 공유 여행 권한 테스트가 통과해야 한다. `supabase start`의 로컬 URL·anon key를 `TRIPPLOT_SYNC_TEST_URL`, `TRIPPLOT_SYNC_TEST_ANON_KEY` 환경 변수로 제공한 뒤 `node --test tests/sync-rpc-concurrency.test.mjs`를 실행해 같은 revision의 동시 요청 중 정확히 하나만 적용되는지 확인한다. `node --test tests/sync-migration-contract.test.mjs tests/shared-trips-function.test.mjs tests/account-function.test.mjs`는 RPC 계약, service-role 키 비노출, 공유 권한·legacy 응답, 계정 데이터 정리를 보조 검증한다. 정적 테스트는 DB/동시성 테스트를 대체하지 않는다.
- [ ] **Step 6: Task 2 변경만 검토하고 커밋한다.** `git diff --check`를 실행한 뒤 Task 2에 나열된 파일만 stage하고 `feat: add secure sync v2 database contract`로 커밋한다. migration은 원격 Supabase에 적용하지 않는다.

> Task 2의 Step 2·5는 2026-10-14 기준 실행 환경에 Supabase CLI, Docker, PostgreSQL이 없어 미완료다. `supabase test db`는 `command not found`로 종료됐다. migration을 원격에 적용하지 않았고, DB 실제 검증 전에는 Task 2를 커밋하지 않는다.

### Task 3: 웹 v2 어댑터와 v1 사용자 데이터 가져오기

**Files:**
- Create: `src/sync/syncV2Repository.js`
- Create: `src/sync/legacyUserStateImporter.js`
- Create: `src/sync/indexedDBQueueStore.js`
- Create: `src/sync/localSyncStorage.js`
- Create: `src/components/SyncMigrationDialog.jsx`
- Create: `tests/sync-v2-repository.test.mjs`
- Create: `tests/legacy-user-import.test.mjs`
- Modify: `src/App.jsx`

**Interfaces:**
- `createSyncV2Repository({ supabase, queueStore, makeOperationID })`는 `listRecords(userID, cursor)`, `applyOperation(operation)`, `importLegacyRows(userID, rows, { conflictChoices })`를 제공한다.
- 웹 outbox는 `IndexedDBQueueStore.put(operation)`, `list(userID)`, `remove(operationID, userID)`로 operation을 브라우저 종료 뒤에도 유지한다. repository 생성 시 queue store를 주입해 Node 테스트에서 결정적으로 대체할 수 있다.
- `applyOperation(operation)`은 레코드 한 건만 처리하고 `{ status: "applied" | "replayed" | "conflict", record }`를 반환한다. `listRecords`는 `{ records, nextCursor }`를 반환한다.
- `importLegacyRows`는 `world_pro_trips_v1`을 `trip`, `world_pro_fav_v1`을 `savedPlace` 레코드로 변환한다. 기존 안정 ID를 유지하고 ID가 없는 저장 장소는 사용자 ID와 정규화된 원본을 사용한 결정적 ID를 부여한다.
- 웹에서 새로 저장하는 operation은 UUID를 한 번 생성해 결과가 확정될 때까지 보존한다. v1 원본은 가져오기·검증·롤백 기간 동안 읽기 전용으로 남기며, 예전 클라이언트가 나중에 v1을 바꿨는지는 SHA-256 fingerprint로 다음 로그인 시 감지한다.

- [x] **Step 1: 웹 저장소 어댑터 테스트를 작성한다.** `node:test`와 기존 Supabase fetch mock 패턴으로 page cursor, RPC conflict 응답, operation 재전송, 두 레거시 키 변환, 잘못된 항목 격리, 반복 가져오기 중복 방지를 검증한다.
- [x] **Step 2: 테스트 실패를 확인한다.** `node --test tests/sync-v2-repository.test.mjs tests/legacy-user-import.test.mjs`를 실행한다.
- [x] **Step 3: v2 저장소와 importer를 구현한다.** 현재 `App.jsx`의 로그인 시 배열 전체 upsert 및 여행/즐겨찾기 전체배열 동기화를 새 어댑터 호출로 교체한다. `SyncMigrationDialog`는 v1·v2·기기 로컬 개수와 ID 충돌을 보여주고 사용자의 확정 전에는 로컬 또는 서버 데이터를 덮지 않는다. 기존 UI 동작과 `localOnly` 여행 제외 규칙을 보존한다.
- [x] **Step 4: 웹 회귀 검증을 통과시킨다.** 두 타깃 테스트, `npm test`, `npm run lint`, `npm run build`를 실행한다. 신규 앱은 v1에 쓰지 않고 원본을 삭제하지 않는다. 구버전이 남아 있는 동안 늦게 발생한 v1 쓰기는 다음 로그인 scan에서 payload hash를 포함한 새 operation으로 감지하고, 기존 v2 자료와 충돌하면 양쪽을 보존한다.
- [ ] **Step 5: Task 3 변경만 검토하고 커밋한다.** `git diff --check`를 실행한 뒤 Task 3에 나열된 파일만 stage하고 `feat: sync web records through v2 adapter`로 커밋한다.

### Task 4: SwiftUI 인증·동기화·충돌 복구

**Files:**
- Modify: `ios/project.yml`
- Create: `ios/NativePreview/Sync/NativeSync.local.xcconfig.example`
- Create: `ios/NativePreview/Sync/NativeAuthStore.swift`
- Create: `ios/NativePreview/Sync/SupabaseSyncTransport.swift`
- Create: `ios/NativePreview/Sync/NativeSyncCoordinator.swift`
- Create: `ios/NativePreview/Sync/SyncConflictView.swift`
- Create: `ios/NativeCore/Sources/NativeCore/SyncEngine.swift`
- Create: `ios/NativeCore/Sources/NativeCore/SyncV2WireCodec.swift`
- Modify: `ios/NativePreview/TripPlotNativePreviewApp.swift`
- Modify: `ios/NativePreview/NativeRootView.swift`
- Modify: `ios/NativePreview/NativeTripStore.swift`
- Create: `ios/NativePreviewUITests/NativeSyncAccountUITests.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/SyncEngineTests.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/SyncV2WireCodecTests.swift`
- Modify: `ios/NativePreview/Map/NativeMaps.xcconfig`
- Modify: `.gitignore`

**Interfaces:**
- `NativeCore.SyncTransport`: `fetchRecords(userID:cursor:) async throws -> SyncPage`, `apply(_ operation: SyncOperation) async throws -> SyncApplyResult`. `NativeCore.SyncEngine` uses the transport plus `SyncOutboxRepository`; `NativeSyncCoordinator` connects the engine to auth and app lifecycle.
- `NativeSyncCoordinator`: `sync(userID:) async -> SyncRunResult`, `resumePendingOperations(userID:) async`, `acceptRemote(_:userID:)`, `keepLocal(conflictID:)`를 제공한다.
- `SyncPage`는 `records: [SyncRecord]`와 불투명 `nextCursor: String?`를, `SyncApplyResult`는 `status: applied|replayed|conflict`와 서버 `record`를 가진다.
- Supabase SDK Auth 세션은 Keychain에 보관한다. 클라이언트 설정은 무시 규칙에 추가한 `NativeSync.local.xcconfig`에서 공개 Supabase URL/anon key만 읽고, Google OAuth는 기존 `travelplaner://auth/callback` 스킴을 사용한다. `TripPlotNativePreviewApp`의 `.onOpenURL`이 OAuth callback을 처리한다.

- [x] **Step 1: transport mock 기반 테스트를 먼저 작성한다.** `SyncEngineTests`에서 offline 저장→재연결 성공, RPC timeout 후 동일 operation 재시도, conflict 시 두 payload 유지, tombstone pull, 계정 변경 중 이전 계정 outbox 미전송, 선택 전 로컬 데이터 비삭제를 검증한다. 적용 응답의 서버 정규화 문서를 기준 상태로 저장하고, 반복 페이지 커서에서 중단하는 회귀 테스트도 추가했다.
- [x] **Step 2: 실패를 확인한다.** 구현 전 새 테스트가 `SyncTransport`·응답 타입 부재로 실패했고, 서버 정규화 회귀 테스트도 먼저 실패해 로컬 전송본을 기준 상태로 잘못 저장하는 동작을 재현했다. 구현 후 전체 NativeCore 테스트가 통과했다.
- [x] **Step 3: Supabase Swift SDK와 인증 상태를 연결한다.** `ios/project.yml`에 공식 Supabase Swift 패키지를 추가하고 SwiftUI 미리보기 타깃에만 연결한다. `ios/NativePreview/Map/NativeMaps.xcconfig`에서 `../Sync/NativeSync.local.xcconfig`를 optional include하고 `.gitignore`에 local 파일을 추가한다. 이메일 로그인과 기존 Google OAuth callback을 제공하고 세션/갱신 토큰을 Keychain에 저장한다. 미리보기 타깃에도 기존 `travelplaner://auth/callback` URL scheme을 선언한다. 로그아웃은 로컬 outbox나 원격 레코드를 삭제하지 않는다. 설정 누락 UI 테스트는 통과했으며 실제 계정 로그인은 공개 Supabase URL/key가 없어 아직 검증하지 않았다.
- [x] **Step 4: 전송·재시도·충돌 복구를 구현한다.** 페이지 단위 pull 후 계정별 outbox를 보내며, RPC의 `conflict`는 서버 문서와 로컬 문서를 모두 Core Data에 보존한다. 충돌 UI는 양쪽 버전을 비교해 서버 버전 수락 또는 로컬 버전 재적용을 명시적으로 선택하게 한다. `NWPathMonitor`의 오프라인→온라인 전환과 앱 foreground에서 재시도하고 로컬 저장 성공과 서버 동기화 성공 상태를 구분한다. 동기화 중 재연결은 현재 로그인 계정의 후속 실행 하나로 합친다.
- [ ] **Step 5: 네이티브 검증을 통과시킨다.** 먼저 `xcrun simctl list devices available`로 대상을 확인하고 현재 수정된 `ios/project.yml`·`ios/TravelPlaner.xcodeproj/project.pbxproj` diff를 보존한다. 그 뒤 `swift test --package-path ios/NativeCore`, `xcodegen generate --spec ios/project.yml`, `xcodebuild test -project ios/TravelPlaner.xcodeproj -scheme TripPlotNativePreview -destination 'platform=iOS Simulator,id=<available-device-id>'`를 실행한다. 생성 프로젝트가 기존 사용자 설정을 보존하는지 비교한다. UI 테스트는 목 인증 상태의 계정 전환/동기화 상태를 검증하고 service-role 키가 앱 번들에 없는지 확인한다.
- [ ] **Step 6: Task 4 변경만 검토하고 커밋한다.** `git diff --check`를 실행한 뒤 Task 4에 나열된 파일만 stage하고 `feat: sync native trips with supabase`로 커밋한다. 설정 예시에는 공개 endpoint/anon key 변수명만 기록하고 실제 키를 stage하지 않는다.

> Task 4 Step 3의 Supabase 인증 UI/Keychain SDK 연결과 Step 4의 Core 전송 엔진, v2 transport/codec, NativeTripStore 도메인 hydration, 보존 경고·계정별 대기 건수, 명시적 충돌 해결 UI, 로그인·foreground·네트워크 복구 재시도가 구현됐다. NativeCore와 시뮬레이터 UI 검증은 통과했지만 목 계정 전환/동기화 상태 검증 일부가 남아 Step 5는 미완료다. 실제 Auth/RPC 검증에는 공개 URL/anon key와 Supabase DB가 필요하고, Supabase CLI/Docker/PostgreSQL 부재로 SQL/RLS/RPC 통합 검증도 남아 있다.

> 2026-10-14 추가 검증: iOS 27 iPhone 17에서 탭 이동/안전 영역, 더보기 탭 종료 후 복원, 구형 `expenses` route의 `budget` 호환 및 로그아웃 상태 계정 UI 테스트가 통과했다. `NativeRootView`는 기본 탭을 먼저 렌더한 뒤 저장 탭을 복원해 재실행 직후 빈 콘텐츠가 되지 않도록 한다. 전체 UI suite는 아직 실행하지 않았다.

> 2026-10-14 네트워크 복구 검증: `SyncReachabilityGate`가 최초 온라인 알림/반복 알림을 재시도로 처리하지 않고 오프라인→온라인 전환만 감지하도록 테스트했다. `NativeSyncCoordinator`는 로그인 사용자만 재연결 동기화하고 실행 중 재연결은 후속 실행으로 큐잉한다. NativeCore 95/95, iPhone 17 시뮬레이터 UI 테스트 2/2, 빌드, `npm run native:security`, `git diff --check` 통과. 시뮬레이터와 현재 웹을 비교한 결과 홈/빈 여행 목록/상단 액션/5개 하단 메뉴 구조는 유사하나, 웹은 Google 지도 타일 및 지도 하단 저장 상태·손잡이를 보이고 네이티브는 지도 키 대기 안내와 다른 지도 컨트롤을 표시한다. 지도 키는 사용자 요청에 따라 추후 검증할 항목이다. 캡처: `/tmp/tripplot-web-K4sR8m2Vq7.png`, `/tmp/tripplot-native-K4sR8m2Vq7.png`. 실 Supabase Auth/RPC와 DB 검증은 설정 및 CLI/Docker/PostgreSQL 부재로 미실행이다.

### Task 5: 기존 WebView·미디어 데이터의 확인 가능한 이전

**Files:**
- Modify: `ios/TravelPlaner/BrowserModel.swift`
- Modify: `ios/TravelPlaner/TravelWebView.swift`
- Modify: `ios/TravelPlaner/ContentView.swift`
- Create: `ios/NativeCore/Sources/NativeCore/SyncMigrationPackage.swift`
- Create: `ios/NativeCore/Tests/NativeCoreTests/SyncMigrationPackageTests.swift`
- Modify: `ios/NativePreview/TripBackupView.swift`
- Modify: `ios/NativePreview/NativeTripStore.swift`
- Modify: `ios/NativeCore/Sources/NativeCore/TripRepository.swift`
- Modify: `ios/NativeCore/Sources/NativeCore/TripStoreModel.swift`
- Modify: `ios/NativeCore/Sources/NativeCore/TravelMediaStore.swift`
- Modify: `src/App.jsx`
- Create: `ios/NativePreview/Sync/MediaSyncService.swift`
- Create: `tests/native-migration-bridge.test.mjs`
- Create: `ios/TravelPlanerUITests/LegacyWebExportUITests.swift`

**Interfaces:**
- `SyncMigrationPackage`는 schema version, 원본 계정 ID(인증된 경우), 여행·저장 장소 JSON, 미디어 메타데이터와 checksum을 포함한다. 비밀 공유 관리 토큰 및 만료 signed URL은 포함하지 않는다.
- 웹의 `내 데이터 내보내기` 동작은 현재 페이지에서 WebKit 전용 export message를 보낸다. `BrowserModel.exportLegacyWebData() async throws -> URL`은 현재 운영 origin의 기본 `WKWebsiteDataStore`에서 두 v1 localStorage 키만 읽기 전용으로 내보내고 공유 파일 URL을 반환한다. 사용자의 직접 요청으로만 시작하며 인증 토큰은 export하지 않고 웹 원본도 삭제하지 않는다. 비-WebKit 브라우저는 같은 migration package를 JSON으로 다운로드한다.
- `MediaSyncService.upload(data:mediaID:userID:) async throws -> SyncedMediaReference`는 비공개 Storage 객체를 올리고 byte count·MIME type·SHA-256이 재검증된 경우에만 동기화 가능한 참조를 반환한다.

- [ ] **Step 1: migration/import 테스트를 먼저 작성한다.** 오래된 키 누락, 손상 JSON, 같은 원본 재가져오기, ID 충돌 시 keep-both 미리보기, 사진 누락/해시 불일치, 업로드 timeout 후 재시도를 검증한다. 실패 항목이 있어도 성공 항목과 원본 백업을 유지해야 한다.
- [ ] **Step 2: 실패를 확인한다.** `swift test --package-path ios/NativeCore`와 `node --test tests/native-migration-bridge.test.mjs`를 실행한다.
- [ ] **Step 3: 읽기 전용 WebKit bridge와 package importer를 구현한다.** bridge는 앱이 내부 운영 origin을 표시할 때만 허용하며 JavaScript handler는 허용 키 두 개만 읽는다. `LegacyWebExportUITests`는 export 요청 전후 localStorage 값이 동일한지 검증한다. 파일 선택 후에는 schema·개수·충돌·사진 용량 미리보기를 보여주고 확인 전에는 로컬 DB나 원본을 바꾸지 않는다. bridge가 작동하지 않으면 같은 형식의 JSON 가져오기를 제공한다.
- [ ] **Step 4: 사진 업로드·검증을 구현한다.** 사진을 비공개 사용자 경로로 업로드하고 checksum 확인 뒤 payload 참조를 교체한다. 실패 시 기존 base64/파일 원본 참조와 미디어를 삭제하지 않는다. 공유 여행 미디어는 기존 공유 API 권한 경계를 그대로 사용하고 직접 버킷 쓰기를 추가하지 않는다.
- [ ] **Step 5: 이전 검증을 통과시킨다.** 타깃 테스트, `swift test --package-path ios/NativeCore`, `npm test`, `npm run lint`를 실행한다. 기존 WebView localStorage에서 export→파일→네이티브 preview import→재실행을 확인하고, 원본 개수/해시와 가져온 문서를 비교한다.
- [ ] **Step 6: Task 5 변경만 검토하고 커밋한다.** `git diff --check`를 실행한 뒤 Task 5에 나열된 파일만 stage하고 `feat: migrate webview data and media safely`로 커밋한다. 원본 데이터나 사용자 로컬 저장 파일은 커밋하지 않는다.

### Task 6: 통합 회귀 및 안전한 전환 준비

**Files:**
- Create: `docs/native-sync-migration-verification.md`
- Modify: `기록-history.md`

- [ ] 웹 및 Swift 단위 테스트, SQL/pgTAP, `npm run build`, `npm run lint`, `npm run native:security`, Xcode 시뮬레이터 테스트를 실행하고 각 결과를 기록한다.
- [ ] 웹→iOS 및 iOS→웹 양방향 편집, 네트워크 차단 후 재연결, 두 클라이언트 동시 stale write, 삭제 후 오래된 기기 복귀, 계정 전환, 기존 iOS 설치의 WebView export와 JSON fallback을 체크리스트로 검증한다.
- [ ] staging이 제공되지 않거나 Supabase CLI/실계정 자격 증명이 없으면 해당 검증을 미완료로 표시한다. 프로덕션 migration 적용·v1 쓰기 차단·기본 앱 전환·배포는 진행하지 않는다.
- [ ] v1 원본과 사진 참조를 유지한 채 복구·롤백 경로가 작동함을 확인하고, 동기화·데이터 이전 완료와 화면별 네이티브 전환 완료를 구분해 보고한다.
- [ ] **Task 6 변경만 검토하고 커밋한다.** 검증 결과 문서와 기록 파일만 stage하고 `docs: record native sync migration verification`으로 커밋한다. 다른 기존 변경은 포함하지 않는다.

## Execution notes

- 이 계획은 사용자가 설계 문서에 동의한 뒤 작성한 첫 하위 작업의 계획이다. **구현은 이 계획 자체에 대한 사용자 검토·확인 이후에만 시작한다.**
- 실행 방식은 주 작업자가 직접 수행한다. 서브에이전트를 사용하지 않는다.
- 현재 체크아웃에는 기존 iOS·Android UI 변경이 다수 있으므로 해당 변경을 덮어쓰거나 광범위하게 stage하지 않는다. 작업 파일만 별도로 검토하고 테스트한다.
- 기존 출시 타깃 `com.travelplaner.app`은 WKWebView로 유지한다. 구현·검증은 우선 `TripPlotNativePreview`와 웹 클라이언트에 연결하고, 운영 배포·DB 반영은 별도 승인과 staging 통과 뒤에 한다.
