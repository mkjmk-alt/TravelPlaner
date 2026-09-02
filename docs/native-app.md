# TravelPlaner 네이티브 앱 개발 및 출시 가이드

## 확정된 기본값

| 항목 | 값 |
| --- | --- |
| 앱 이름 | TravelPlaner |
| iOS Bundle ID | `com.travelplaner.app` |
| Android Application ID | `com.travelplaner.app` |
| 운영 URL | `https://travelplaner-545.pages.dev/` |
| 딥 링크 | `travelplaner://` |
| 최소 iOS | iOS 16 |
| 최소 Android | Android 8.0 (API 26) |
| Android Target SDK | API 36 |

스토어 등록 전에 Bundle ID가 Apple Developer/Google Play Console에서 사용 가능한지 확인해야 합니다. 이미 사용 중이면 `ios/project.yml`과 `android/app/build.gradle.kts`의 값을 함께 변경합니다.

## 로그인 없는 데이터 저장

웹앱은 여행 일정, 지출, 즐겨찾기와 통화 설정을 `localStorage`에 기록합니다. iOS는 `WKWebsiteDataStore.default()`, Android는 `domStorageEnabled = true`를 사용하며 앱 종료 때 WebView 저장소를 지우지 않습니다.

- 앱 종료, 재부팅, 일반 앱 업데이트: 유지
- 앱 삭제 또는 운영체제 설정의 앱 데이터 삭제: 삭제
- 다른 기기: 자동 이전되지 않음
- 로그인: 기존 로컬 일정과 Supabase 클라우드 데이터를 병합

사용자는 JSON 백업 내보내기로 로그인 없이도 복구 파일을 만들 수 있습니다. 민감한 여행 데이터가 사용자 동의 없이 OS 클라우드 백업에 포함되지 않도록 Android 자동 백업은 비활성화했습니다.

## iOS 설정

1. `ios/TravelPlaner.xcodeproj`를 Xcode에서 엽니다.
2. TravelPlaner 타깃의 Signing & Capabilities에서 Apple Developer Team을 선택합니다.
3. 실제 Bundle ID를 확인합니다.
4. 현재 위치 버튼을 위한 위치 권한 문구를 검토합니다.
5. 실기기에서 위치, Google 로그인, JSON/ICS/PNG 저장을 점검합니다.
6. Archive 후 TestFlight 내부 테스트에 업로드합니다.

`ios/project.yml`을 수정했다면 `xcodegen generate`를 다시 실행합니다.

## Supabase 인증 리디렉션

Google OAuth, 이메일 확인과 비밀번호 재설정이 네이티브 앱으로 돌아오려면 Supabase Dashboard의 Authentication → URL Configuration → Redirect URLs에 다음 주소를 추가해야 합니다.

```text
travelplaner://auth/callback
```

iOS는 `ASWebAuthenticationSession`, Android는 기본 브라우저를 사용합니다. 콜백이 앱에 도착하면 같은 WebView 원본 주소로 변환해 Supabase 세션 교환을 완료합니다. 운영 웹의 기존 로그인 리디렉션은 변경되지 않습니다.

네이티브 인증 브리지는 운영 Supabase 프로젝트의 HTTPS 호스트(`eiktqxrgsjrtmoyzuupn.supabase.co`)와 정확한 콜백(`travelplaner://auth/callback`)만 허용합니다. 다른 HTTPS 주소나 같은 스킴의 임의 경로는 인증 세션 또는 WebView 콜백으로 처리하지 않습니다.

2026년 9월 2일 기준 Supabase 운영 프로젝트의 Redirect URLs에 `travelplaner://auth/callback` 등록을 완료했고, 기존 웹 리디렉션과 함께 총 2개가 유지되는 것을 확인했습니다.

## 계정 삭제 활성화

로그인한 사용자는 앱 헤더의 **계정 삭제**에서 `삭제`를 직접 입력한 뒤 인증 계정과 클라우드 데이터를 영구 삭제할 수 있습니다. Google Play의 외부 삭제 URL은 다음과 같습니다.

```text
https://travelplaner-545.pages.dev/delete-account.html
```

운영 활성화에는 다음 두 가지가 모두 필요합니다.

1. Cloudflare Pages의 Settings → Variables and Secrets에 `SUPABASE_SECRET_KEY`를 **Secret**으로 추가하고 Production을 다시 배포합니다. 새 `sb_secret_...` 키를 권장하며 기존 `SUPABASE_SERVICE_ROLE_KEY`도 서버 전용 하위 호환됩니다.
2. `/api/shared-trips`가 운영 배포에서 정상 동작하는지 확인한 다음 Supabase SQL Editor에서 `supabase/migrations/202609010001_account_deletion.sql`을 실행합니다. 이 마이그레이션은 공유 일정에 `owner_id`를 추가하고, 공유 테이블의 직접 접근을 차단하며, 사용자 상태를 본인 계정에만 허용합니다.

비밀키는 계정 삭제 서버 함수에서만 사용하며 `VITE_` 접두사를 붙이거나 Git, 브라우저 코드, 로그에 기록하면 안 됩니다. 로컬 Pages Functions 테스트가 필요하면 `.dev.vars.example`을 `.dev.vars`로 복사하고 실제 값은 커밋하지 않습니다.

삭제 API는 Supabase access token으로 본인을 확인한 뒤 `shared_trips.owner_id`, `user_state.user_id`, Auth 사용자 순서로 삭제합니다. 기기의 로그인 없는 로컬 일정은 계정과 분리해 유지됩니다.

## 공유 일정 API와 RLS

공유 일정의 생성·조회·수정·해제는 Cloudflare Pages Function인 `/api/shared-trips`를 거칩니다. Supabase 관리자 비밀키는 서버 런타임에서만 사용하고 브라우저 번들에는 포함하지 않습니다.

- `GET`: 정확한 UUID 공유 코드 한 건만 조회
- `POST`: 공유 일정 생성. 로그인 토큰이 있으면 검증 후 `owner_id`를 기록하고, 생성 기기에만 공유 해제용 관리 토큰을 한 번 반환
- `PATCH`: 정확한 UUID 공유 일정의 `trip_data`만 수정
- `DELETE`: 로그인한 소유자 또는 생성 기기의 관리 토큰을 확인한 뒤 공유 사본 삭제
- 공유 링크는 추측하기 어려운 UUID 자체가 접근 권한인 capability link입니다.
- 관리 토큰은 서버에 원문을 저장하지 않고 SHA-256 해시만 저장합니다.
- 공동 편집은 직접 Realtime 구독 대신 15초 간격 API 동기화를 사용합니다.
- `shared_trips`는 `anon`, `authenticated`의 직접 권한을 회수하고 서버 함수만 접근합니다.
- `user_state`는 RLS로 로그인한 본인의 `user_id` 행만 조회·저장할 수 있습니다.

`202609010001_account_deletion.sql` 마이그레이션은 운영에 적용 완료되었습니다. 공유 해제를 추가할 때는 새 컬럼을 먼저 준비해야 하므로 아래 순서를 지킵니다.

1. `supabase/migrations/202609020001_shared_trip_management.sql`을 실행해 nullable 관리 토큰 해시 컬럼을 추가합니다.
2. Pages Function과 새 프런트 버전을 배포합니다.
3. Cloudflare Production에 `SUPABASE_SECRET_KEY`가 연결됐는지 확인합니다.
4. 기존 공유 UUID의 조회·수정과 새 공유 UUID의 생성·해제를 확인합니다.
5. 같은 공유 링크와 로그인 동기화를 다시 확인합니다.

새 컬럼은 nullable이므로 마이그레이션을 먼저 적용해도 기존 공유 링크가 중단되지 않습니다. 기존 익명 공유에는 관리 토큰이 없으므로 생성 기기 토큰으로 해제할 수 없지만, 로그인 소유자가 기록된 공유는 소유자 인증으로 해제할 수 있습니다.

## Android 설정

1. Android Studio에서 `android/` 폴더를 엽니다.
2. JDK 17과 Android SDK 36을 선택합니다.
3. `./gradlew assembleDebug lint`로 검증합니다.
4. 로컬에서 준비된 업로드 키와 인증서 지문을 `android/UPLOAD_KEY.md`에서 확인합니다.
5. 비밀 키는 Git에 추가하지 말고 로컬 `keystore.properties` 또는 `TRAVELPLANER_ANDROID_*` CI Secret으로 관리합니다.
6. `./gradlew bundleStoreRelease lintRelease`로 서명 설정을 검증하면서 AAB를 만들고 내부 테스트 트랙에 업로드합니다.

업로드 키는 `android/travelplaner-upload.jks`에 로컬로 생성했고 비밀번호는 macOS 로그인 키체인의 `TravelPlaner Android Upload Key` 항목에만 저장했습니다. JKS와 비밀번호는 Git에 포함되지 않습니다. 현재 서명된 AAB는 `android/app/build/outputs/bundle/release/app-release.aab`이며 Gradle Release Lint, JAR 서명과 bundletool 구조 검증을 통과했습니다. 키 없이 실행한 일반 `bundleRelease` 결과는 구조 검증용 미서명 AAB일 수 있으므로 Play Console에는 반드시 `bundleStoreRelease` 결과만 업로드합니다.

Android 런처 아이콘은 적응형 아이콘과 원형 아이콘을 함께 제공하며 Android 13 이상의 테마 아이콘을 위한 단색 레이어도 포함합니다. API 36 Pixel 가상기기에서 원형 마스크 표시와 잘림 여부를 확인했습니다.

서명된 `1.0.0 (1)` Release APK도 API 36 가상기기에 새로 설치해 콜드 스타트, 운영 WebView 온보딩 렌더링과 크래시 로그 부재를 확인했습니다. 완성 Manifest에는 카메라·마이크·사진 권한이 없고 위치, 네트워크 및 Android 8~9 다운로드용 저장 권한만 있습니다.

웹 다운로드는 Android 10 이상에서 추가 저장 공간 권한 없이 시스템 다운로드 관리자로 저장합니다. 공개 다운로드 폴더 쓰기 권한이 필요한 Android 8~9에서만 `WRITE_EXTERNAL_STORAGE`를 실행 중 요청하며, Manifest 권한도 API 28까지만 적용합니다. Android 12 이상은 `dataExtractionRules`로 클라우드 백업과 기기 간 자동 이전에서 앱 데이터를 제외합니다.

## 필수 실기기 확인표

- [ ] 첫 실행과 온보딩
- [ ] 로그인하지 않고 일정 생성 → 앱 강제 종료 → 재실행 후 일정 유지
- [ ] 앱 업데이트 설치 후 로컬 일정 유지
- [ ] 이메일 로그인과 Google OAuth
- [ ] 로그인 후 로컬/클라우드 일정 병합
- [ ] 계정 삭제 → 재로그인 불가 및 클라우드 데이터 제거 확인
- [ ] 새 공유 생성 → 다른 브라우저에서 조회·수정 → 생성 기기에서 공유 해제 → 기존 링크 404 확인
- [ ] 현재 위치 권한 허용/거절/설정에서 재허용
- [ ] Google 지도 경로 링크가 외부 지도 앱에서 열림
- [ ] 예약 링크와 새 창 링크
- [ ] JSON 백업 저장 및 가져오기
- [ ] iCalendar/CSV/지출 통계 PNG 저장
- [ ] Android 시스템 뒤로가기와 iOS 화면 가장자리 뒤로가기
- [ ] 오프라인 실행 안내와 네트워크 복구 후 다시 시도
- [ ] 작은 iPhone, 큰 iPhone, iPad, 작은 Android, 태블릿 레이아웃

## 스토어 제출 전 필요한 외부 정보

- Apple Developer Program 및 Google Play Console 계정
- 최종 Bundle/Application ID 승인
- 배포 인증서, 프로비저닝 프로파일, Android 업로드 키의 외부 보안 백업과 Play App Signing 등록
- 앱 소개 문구, 카테고리, 연령 등급
- iPhone/iPad/Android 스토어 스크린샷
- 개인정보처리방침: `https://travelplaner-545.pages.dev/privacy.html`
- 지원 페이지: `https://travelplaner-545.pages.dev/support.html`
- 계정 삭제: `https://travelplaner-545.pages.dev/delete-account.html`

스토어 소개 문구, 심사 메모, 개인정보 설문 초안, 스크린샷 목록과 업로드 절차는 [`docs/store-submission.md`](store-submission.md)에 정리했습니다.

선택적 회원가입, 계정 삭제 UI·서버 함수·공개 삭제 페이지, 공유 일정 API가 구현되어 있습니다. 2026년 9월 1일 기준 Cloudflare Production Secret과 Supabase RLS 마이그레이션을 운영에 적용했고, 기존 공유 링크의 API 조회와 화면 로드를 재검증했습니다.

Android 업로드 키와 서명된 AAB까지 로컬 준비가 완료됐습니다. 실제 TestFlight/Play 업로드는 계정 소유자의 개발자 등록, 신원·결제 확인과 스토어 콘솔 접근이 필요합니다.
