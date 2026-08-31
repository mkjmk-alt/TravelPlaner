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
4. 위치, 사진, 카메라 권한 문구를 검토합니다.
5. 실기기에서 위치, Google 로그인, JSON/ICS/PNG 저장을 점검합니다.
6. Archive 후 TestFlight 내부 테스트에 업로드합니다.

`ios/project.yml`을 수정했다면 `xcodegen generate`를 다시 실행합니다.

## Supabase 인증 리디렉션

Google OAuth, 이메일 확인과 비밀번호 재설정이 네이티브 앱으로 돌아오려면 Supabase Dashboard의 Authentication → URL Configuration → Redirect URLs에 다음 주소를 추가해야 합니다.

```text
travelplaner://auth/callback
```

iOS는 `ASWebAuthenticationSession`, Android는 기본 브라우저를 사용합니다. 콜백이 앱에 도착하면 같은 WebView 원본 주소로 변환해 Supabase 세션 교환을 완료합니다. 운영 웹의 기존 로그인 리디렉션은 변경되지 않습니다.

## 계정 삭제 활성화

로그인한 사용자는 앱 헤더의 **계정 삭제**에서 `삭제`를 직접 입력한 뒤 인증 계정과 클라우드 데이터를 영구 삭제할 수 있습니다. Google Play의 외부 삭제 URL은 다음과 같습니다.

```text
https://travelplaner-545.pages.dev/delete-account.html
```

운영 활성화에는 다음 두 가지가 모두 필요합니다.

1. Supabase SQL Editor에서 `supabase/migrations/202609010001_account_deletion.sql`을 실행합니다. 이 마이그레이션은 공유 일정에 `owner_id`를 추가하고 다른 사용자의 공유 데이터를 삭제하지 못하도록 소유권을 고정합니다.
2. Cloudflare Pages의 Settings → Variables and Secrets에 `SUPABASE_SERVICE_ROLE_KEY`를 **Secret**으로 추가하고 Production을 다시 배포합니다.

서비스 역할 키는 계정 삭제 서버 함수에서만 사용하며 `VITE_` 접두사를 붙이거나 Git, 브라우저 코드, 로그에 기록하면 안 됩니다. 로컬 Pages Functions 테스트가 필요하면 `.dev.vars.example`을 `.dev.vars`로 복사하고 실제 값은 커밋하지 않습니다.

삭제 API는 Supabase access token으로 본인을 확인한 뒤 `shared_trips.owner_id`, `user_state.user_id`, Auth 사용자 순서로 삭제합니다. 기기의 로그인 없는 로컬 일정은 계정과 분리해 유지됩니다.

## Android 설정

1. Android Studio에서 `android/` 폴더를 엽니다.
2. JDK 17과 Android SDK 36을 선택합니다.
3. `./gradlew assembleDebug lint`로 검증합니다.
4. Play Console에서 앱을 만든 뒤 업로드 키를 생성합니다.
5. 비밀 키는 Git에 추가하지 말고 로컬 `keystore.properties` 또는 CI Secret으로 관리합니다.
6. `bundleRelease`로 AAB를 만들고 내부 테스트 트랙에 업로드합니다.

현재 저장소에는 공개 저장소에 올려도 안전한 디버그 서명 설정만 포함합니다. 출시 서명 키는 개발자 계정 소유자가 생성해야 합니다.

## 필수 실기기 확인표

- [ ] 첫 실행과 온보딩
- [ ] 로그인하지 않고 일정 생성 → 앱 강제 종료 → 재실행 후 일정 유지
- [ ] 앱 업데이트 설치 후 로컬 일정 유지
- [ ] 이메일 로그인과 Google OAuth
- [ ] 로그인 후 로컬/클라우드 일정 병합
- [ ] 계정 삭제 → 재로그인 불가 및 클라우드 데이터 제거 확인
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
- 배포 인증서, 프로비저닝 프로파일, Android 업로드 키
- 앱 소개 문구, 카테고리, 연령 등급
- iPhone/iPad/Android 스토어 스크린샷
- 개인정보처리방침: `https://travelplaner-545.pages.dev/privacy.html`
- 지원 페이지: `https://travelplaner-545.pages.dev/support.html`
- 계정 삭제: `https://travelplaner-545.pages.dev/delete-account.html`

스토어 소개 문구, 심사 메모, 개인정보 설문 초안, 스크린샷 목록과 업로드 절차는 [`docs/store-submission.md`](store-submission.md)에 정리했습니다.

선택적 회원가입과 계정 삭제 UI·서버 함수·공개 삭제 페이지는 구현되어 있습니다. 실제 운영에서는 위 Supabase 마이그레이션과 Cloudflare Secret 설정을 완료해야 합니다.

계정과 서명 키가 없는 상태에서도 소스 코드, 시뮬레이터 빌드, 디버그 APK와 내부 테스트 직전 단계까지는 완료할 수 있습니다. 실제 TestFlight/Play 업로드는 계정 소유자의 서명 승인이 필요합니다.
