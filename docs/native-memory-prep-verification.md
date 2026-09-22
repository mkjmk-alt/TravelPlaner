# 네이티브 여행 기록·준비 구현 검증

요청 ID: `R4nK8vP2Za`

## 이번 구현 범위

- Swift/Kotlin 공통 여행 기록·체크리스트·여행 상세 변경 reducer를 추가했다.
- `checked` 필드, 숫자/문자 ID, 누락 ID, 미지 필드, 오래된 행 비교를 보존한다.
- iOS Core Data와 Android Room 저장소에 항목별 원자 변경 API를 연결했다.
- iOS/Android 전용 사진 저장소를 추가했다. PNG/JPEG, 신규 사진 2,621,440 bytes 제한, trip별 opaque 파일명과 경로 검사를 적용한다.
- iOS PhotosPicker와 Android Photo Picker를 여행 기록 작성 화면에 연결했다.
- iOS/Android JSON 백업 내보내기에서 앱 전용 사진을 `imageDataUrl`로 변환한다. 공유 토큰은 제외하고, 20 MiB 제한을 유지한다.
- iOS/Android 더보기 화면에서 여행 기록·사진, 여행 준비, 항공·숙소 정보 하위 화면으로 진입할 수 있다.
- iOS 시뮬레이터 UI 스모크 테스트와 Android 계측 UI 스모크 테스트 소스를 추가했다.

## 확인 결과

| 검사 | 결과 |
| --- | --- |
| `npm test` | 85/85 통과 |
| `npm run build` | 통과. Vite chunk size warning만 있음 |
| `npm run native:security` | 통과 |
| `swift test --package-path ios/NativeCore` | 56/56 통과 |
| Android JVM unit tests | 통과 |
| Android debug APK + lint | 통과, lint 오류 0개 |
| iOS generic simulator build | 통과 |
| iOS `MemoryPrepUITests` | 1/1 통과, iPhone Duo `4AF03983-3DE4-45C3-8A35-4DCC2A8D88BB` |
| `git diff --check` | 통과 |

## 아직 완료로 표시하지 않은 항목

- Android 실기기/에뮬레이터에서 Photo Picker와 `MemoryPrepUiTest`를 실제 실행하지 않았다. 현재 `adb devices`에 연결된 Android 기기가 없었다.
- Android의 사진 포함 백업은 연결했지만, 사진이 있는 여행을 생성한 뒤 export/import하여 실제 바이트를 검증하는 기기 시나리오는 다음 단계다.
- iOS 기록 화면은 현재 추가·삭제와 사진 선택까지 연결했고, 상세 편집·사진 교체/삭제·초안 파일 복구 UI는 다음 단계다.
- 두 플랫폼 모두 초안 파일 저장소의 실제 편집기 연결, 시작 시 정리, Room/재실행/실패 주입 계측 시나리오는 다음 단계다.
- Google Maps/Places 제한 키가 없어 실제 지도 타일·검색·현재 위치·저장 장소 마커 검증은 보류 게이트를 유지한다.
- 커밋·푸시·배포·지도 키·결제·사용자 데이터 초기화는 수행하지 않았다.

## 2026-09-22 후속 구현 — 사진 포함 백업 교차 플랫폼 검증

- 요청 ID: `R5kN2vX8Qa`
- iOS·Android 각각에 동일한 실제 1×1 PNG가 포함된 합성 portable export fixture를 추가했다. Node parity 테스트는 `imageDataUrl`을 실제 바이트로 decode하고 68 bytes 및 SHA-256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`을 검증한다. 웹 `getJournalEntries`가 해당 data URL을 그대로 노출하며 `imageFileName`은 남지 않는 것도 확인한다.
- iOS·Android `MemoryBackup` 테스트에 로컬 사진의 data URL 변환, 정확한 바이트·해시 보존, 기존 embedded 사진 유지, 20 MiB 바로 아래/초과 경계를 추가했다.
- 가져오기 시 다른 기기에서 무효인 `imageFileName`은 iOS·Android `TripBackup.decode`가 제거하고 `외부 사진 참조는 가져오지 않음` 경고를 추가한다. 이미 포함된 `imageDataUrl`은 보존하며, 원본 파일 바이트는 `ImportCandidate.sourceBytes`에 유지한다.
- TDD: 외부 사진 참조 제거 테스트가 먼저 실패한 뒤 decoder 수정 후 통과했다.
- 검증: Swift `MemoryBackupTests` 4/4, `TripBackupTests` 7/7, Android `MemoryBackupTest`·`TripBackupTest` 통과, Node parity 3/3. 네이티브 import도 두 portable fixture를 decode하고 PNG 해시를 확인한다.

## 남은 검증 게이트

- 실제 iOS PhotosPicker/Android Photo Picker 선택 → 프로세스 강제 종료 → 재실행 후 사진 바이트 복구는 실기기/에뮬레이터 시나리오로 남겼다.
- Android API 26 fallback과 제한 Google Maps/Places 키를 사용한 실제 지도·검색·현재 위치 smoke는 지도 키 입력 후 진행한다.

## 2026-09-22 후속 상태 — 외부 의존 검증 보류

- 요청 ID: `T8mQ4vX2La`
- 사용자가 사진 선택 후 강제 종료·재실행 바이트 복구 검증을 나중으로 보류하도록 요청했다. iOS PhotosPicker·Android Photo Picker의 실제 프로세스 종료 시나리오는 실행하지 않았다.
- 지도 키 입력이 필요한 Google Maps/Places provider 검증도 함께 보류했다. 지도 타일·검색·현재 위치·저장 장소 마커 안정성은 아직 미검증이다.
- 재개 조건: 사용자가 제한된 네이티브 지도 키를 제공하고 재개를 요청하면 두 보류 게이트를 같은 검증 묶음으로 실행한다. API 26 fallback도 함께 확인한다.
- 이번 요청에서는 제품 코드, 사용자 데이터, 키 설정을 변경하지 않았다.

## 2026-09-22 후속 구현 — Android 사진 선택 입력 제한

- 요청 ID: `B7nQ4xL2Za`
- Android 시스템 사진 선택 결과가 백업 JSON용 20MiB reader를 사용하지 않도록 `BackupFileAccess.readImage`를 분리했다. `limit+1` bounded read로 2.5MiB 초과 입력을 조기에 거절하고, PNG/JPEG 파일 시그니처를 확인한 뒤 관리 미디어 저장소로 넘긴다.
- `TravelMemoryScreen`은 사진 선택 시 새 전용 경로를 사용하며, 기존 JSON 백업 import 경로는 변경하지 않았다. iOS는 기존 `TravelMediaStore.write`에서 선택 데이터의 크기·PNG/JPEG 형식을 저장 전에 검사한다.
- 테스트 우선 검증: 새 Android 입력 테스트는 API 부재로 먼저 실패한 뒤 구현 후 통과했다. 최종 검증은 Swift NativeCore 60/60, Android JVM unit/Debug APK/lint 통과, Android API 36 `MemoryPrepUiTest` 3/3, iOS `MemoryPrepUITests` 3/3, 웹 테스트 85/85, Vite build, native security, `git diff --check` 통과다.

## 계속 남은 검증 게이트

- 실제 iOS PhotosPicker/Android Photo Picker에서 사진을 선택한 뒤 운영 프로세스를 강제 종료하고 재실행하는 end-to-end 바이트 복구, 실제 사진 교체·백업 import/export는 별도 기기 시나리오로 남겼다.
- Android API 26 fallback과 제한 Google Maps/Places 키를 사용한 실제 지도·검색·현재 위치 검증은 지도 키 입력 후 진행한다.
- 커밋·푸시·배포·지도 키·결제·사용자 데이터 초기화는 수행하지 않았다.

## 2026-09-22 후속 자체 리뷰 보완

- Android 사진 provider 읽기 실패 시 기존 staged 사진과 미리보기를 지우지 않고 오류만 표시하도록 보완했다. 취소·읽기 실패가 기존 입력을 보존한다는 편집기 수명주기 규칙을 맞춘다.
- 보완 후 Android 전체 unit/Debug APK/lint와 API 36 `MemoryPrepUiTest` 3/3을 다시 통과했다. 자체 리뷰는 Critical/Important 이슈 없이 마쳤다.

## 2026-09-22 후속 구현 — 기록 편집·사진 교체/삭제

- 요청 ID: `K7mP2xQ9La`
- iOS 기록 화면에 기록 편집, 기존 사진 제거, 새 사진 선택에 의한 교체, 삭제 확인 다이얼로그를 연결했다. 편집 시 최신 행을 비교하고, 장소 스냅샷과 알 수 없는 필드를 유지한다.
- Android 기록 화면에 동일한 편집·사진 교체/삭제·삭제 확인 흐름을 연결했다. Room reducer가 `JsonNull`을 명시적 키 삭제로 처리하며, 기존 사진 참조와 새 사진 참조를 구분한다.
- 추가 검증: Swift NativeCore 57/57, iOS `MemoryPrepUITests` 2/2, Android JVM unit tests 통과, Android API 36 에뮬레이터 `MemoryPrepUiTest` 2/2, Android debug APK/lint 통과, 웹 테스트 85/85, Vite build, native security, `git diff --check` 통과.

## 계속 남은 검증 게이트

- Android Photo Picker의 실제 사진 바이트 교체/백업 복원, iOS PhotosPicker의 실제 사진 선택·재실행 복원, 미저장 초안 파일 복구/정리, 양 플랫폼 기기 간 사진 export/import는 별도 후속 단계다.
- 연결된 에뮬레이터는 API 36이며 API 26 fallback, 제한된 Google Maps/Places 키를 사용한 실제 지도·검색·현재 위치 검증은 아직 보류한다.

## 2026-09-22 후속 구현 — 편집 초안 자동 저장·복구

- 요청 ID: `N4rX8mQ2Lp`
- iOS와 Android에 여행 ID·편집 대상 ID·편집 모드·날짜·제목·본문·사진 제거 의도를 담는 `JournalEditorDraft` 모델을 추가했다. 공통 파일 저장소의 해시 경로를 사용해 여행별 초안이 서로 섞이지 않도록 했다.
- iOS `NativeTripStore`와 `TravelMemoryView`는 입력 변경을 임시 파일에 저장하고, 기록 화면 재진입 시 활성 초안을 복구한다. 기록 저장 성공 또는 편집 취소·기록 삭제를 확인한 뒤에만 초안 파일을 정리한다. 편집 초안은 활성 포인터 파일도 함께 저장해 화면을 다시 열 때 편집 대상까지 복구한다.
- Android `NativePreviewApplication`, `TripViewModel`, `TravelMemoryScreen`도 동일한 흐름으로 연결했다. 저장 콜백이 성공한 경우에만 초안을 삭제하고, 저장 실패 시 입력을 유지한다. API 36 에뮬레이터에서 화면 이탈 후 재진입 복구를 확인했다.
- 검증: Swift NativeCore 58/58, iOS `MemoryPrepUITests` 3/3, Android JVM unit/Debug APK/lint 통과, Android API 36 `MemoryPrepUiTest` 3/3, `git diff --check` 통과.

## 계속 남은 검증 게이트

- 사진 선택 직후 앱이 종료된 경우의 사진 바이트 자체 복구, 실제 PhotosPicker/Photo Picker 사진 교체·백업 복원, 양 플랫폼 기기 간 media export/import는 다음 미디어 단계다. 현재 초안은 텍스트와 사진 제거 의도를 복구하며, 선택 중인 원본 바이트는 아직 초안 파일에 복제하지 않는다.
- 오래된 초안의 TTL 정리, API 26 fallback, 제한 Google Maps/Places 키를 사용한 실제 지도·검색·현재 위치 검증은 아직 보류한다.

## 2026-09-22 후속 구현 — 사진 미디어 초안 영속화·명시적 정리

- 요청 ID: `P7kM3xQ9Ra`
- iOS와 Android의 `JournalEditorDraft`에 앱 전용 `stagedPhotoFileName`을 추가했다. 사진 선택이 완료되면 먼저 여행별 관리 미디어 저장소에 PNG/JPEG 바이트를 기록하고, 초안에는 파일명만 저장한다. 따라서 앱이 저장 버튼을 누르기 전에 종료되어도 다음 기록 화면 진입 시 초안 텍스트와 선택 사진을 함께 복구할 수 있는 기반을 마련했다.
- iOS `TravelMemoryView`와 Android `TravelMemoryScreen`은 복구한 staged 사진을 미리보기로 표시하고, 저장 성공 시 기존 staged 파일을 최종 기록이 그대로 참조하도록 보존한다. 명시적 취소·초기화·삭제에서는 초안에 연결된 staged 파일만 제거하고, 저장 실패 시에는 재시도를 위해 staged 파일을 보존한다. 기존에 저장된 기록 사진은 건드리지 않는다.
- Android 초안 JSON 저장은 임시 파일 작성 후 atomic move를 우선 사용하도록 바꿔 프로세스 종료 중 부분 JSON이 남을 가능성을 줄였다. iOS는 기존 atomic write를 유지하고, 양 플랫폼에 관리 루트 내부 참조 검증을 추가했다.
- 검증: Swift NativeCore 59/59, iOS `MemoryPrepUITests` 3/3, Android JVM unit/Debug APK/lint, Android API 36 `MemoryPrepUiTest` 3/3, 웹 테스트 85/85, Vite build, native security, `git diff --check` 통과.

## 계속 남은 검증 게이트

- 실제 iOS PhotosPicker/Android Photo Picker에서 사진을 선택한 뒤 운영 프로세스를 강제 종료하고 재실행하는 end-to-end 바이트 복구, 실제 사진 교체·백업 import/export는 별도 기기 시나리오로 남겼다. 현재는 미디어 저장소·초안 모델·화면 연결과 기존 화면 smoke까지 검증했다.
- 오래된 초안 TTL 자동 정리, API 26 fallback, 제한 Google Maps/Places 키를 사용한 실제 지도·검색·현재 위치 검증은 아직 보류한다.

## 2026-09-22 후속 구현 — 오래된 초안 자동 정리·재실행 안전성

- 요청 ID: `K6pR2mX8Qa`
- iOS `MemoryDraftStore.removeStaleJournals`와 Android `MemoryDraftStore.removeStaleJournals`를 추가했다. 기본 보관 기간은 임의의 짧은 시간이 아닌 30일이며, 유효한 초안 JSON 중 마지막 수정 시각이 기준을 넘은 항목만 삭제한다. 빈 ID·손상 파일·최근 초안은 건드리지 않는다.
- iOS `NativeTripStore.open()`과 Android `NativePreviewApplication.onCreate()`에서 앱 시작 시 정리를 best-effort로 실행한다. 정리 대상 초안이 staged 사진을 참조하면 해당 앱 전용 미디어도 함께 제거하며, 정리 실패가 앱 시작 자체를 막지 않도록 했다.
- 검증: Swift NativeCore 60/60, iOS `MemoryPrepUITests` 3/3, Android JVM unit/Debug APK/lint 통과, Android API 36 `MemoryPrepUiTest` 3/3, 웹 테스트 85/85, Vite build, native security, `git diff --check` 통과.

## 계속 남은 검증 게이트

- 실제 iOS PhotosPicker/Android Photo Picker에서 사진을 선택한 뒤 운영 프로세스를 강제 종료하고 재실행하는 end-to-end 바이트 복구, 실제 사진 교체·백업 import/export는 별도 기기 시나리오로 남겼다.
- API 26 fallback과 제한 Google Maps/Places 키를 사용한 실제 지도·검색·현재 위치 검증은 지도 키 입력 후 진행한다.
- 커밋·푸시·배포·지도 키·결제·사용자 데이터 초기화는 수행하지 않았다.
