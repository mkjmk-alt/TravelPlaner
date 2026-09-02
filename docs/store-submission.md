# TravelPlaner 스토어 제출 준비서

이 문서는 소스와 빌드가 끝난 뒤 Apple Developer 및 Google Play Console 계정 소유자가 입력할 내용을 정리한 제출용 원본입니다. 비밀번호, 인증서, 업로드 키는 이 문서나 Git에 기록하지 않습니다.

콘솔에 복사할 한국어 메타데이터와 개인정보 설문 원본은 [`store-metadata/`](../store-metadata/)에 있으며 `npm run store:validate`로 현재 글자 수 제한과 HTTPS URL을 검증합니다.

## 현재 제출 준비 상태

| 항목 | 상태 |
| --- | --- |
| iOS Bundle ID | `com.travelplaner.app` |
| Android Application ID | `com.travelplaner.app` |
| 앱 버전 | `1.0.0` (빌드/버전 코드 `1`) |
| iOS 최소 버전 | iOS 16 |
| Android 최소 버전 | Android 8.0, API 26 |
| Android Target SDK | API 36 |
| 앱 아이콘 | iOS 및 Android 적응형·원형·단색 아이콘 적용 완료 |
| 개인정보처리방침 | <https://travelplaner-545.pages.dev/privacy.html> |
| 이용약관 | <https://travelplaner-545.pages.dev/terms.html> |
| 지원 URL | <https://travelplaner-545.pages.dev/support.html> |
| 계정 삭제 URL | <https://travelplaner-545.pages.dev/delete-account.html> |
| 운영 웹앱 | <https://travelplaner-545.pages.dev/> |
| iOS 시뮬레이터 Release 빌드 | 통과 |
| iOS 실기기용 Release Archive | 개발 서명으로 통과 |
| Android Store Release AAB | 업로드 키 서명, Release Lint·JAR 서명·bundletool 검증 통과 |
| iPhone 17 Pro Max 스크린샷 원본 | 3장, 1320×2868 |
| iPad Pro 13-inch 스크린샷 원본 | 1장, 2064×2752 |
| Android 스크린샷 원본 | 3장, 1344×2992 |
| Google Play 앱 아이콘 | 512×512 준비 완료 |
| Google Play 기능 그래픽 | 1024×500 준비 완료 |
| 로그인 없는 로컬 데이터 보존 | 강제 종료 및 앱 업데이트 후 유지 확인 |
| iOS Privacy Manifest | 계정·사용자 콘텐츠·지출·위치·검색 처리 선언 완료 |
| iOS Required Reason API | 앱 소스 직접 사용 없음 확인, `NSPrivacyAccessedAPITypes` 빈 배열 유지 |

2026년 8월 31일부터 Google Play의 신규 앱과 업데이트는 Android 16(API 36) 이상을 대상으로 해야 하며, 현재 설정은 이 기준을 충족합니다.

## 스토어 기본 정보

### 공통

- 앱 이름: `TravelPlaner`
- 기본 언어: 한국어
- 카테고리: 여행
- 가격: 무료
- 광고: 없음
- 인앱 구매: 없음
- 타깃 연령: 일반 사용자, 아동 대상 아님
- 저작권 예시: `2026 TravelPlaner`

### Apple App Store

- 부제: `지도와 예산까지 한 번에`
- 홍보 문구: `여행 일정, 장소, 예약, 체크리스트와 지출을 한 화면에서 관리하고 JSON·iCalendar·CSV로 간편하게 백업하세요.`
- 키워드: `여행,일정,플래너,지도,예약,예산,지출,체크리스트,환율`
- 지원 URL: <https://travelplaner-545.pages.dev/support.html>
- 마케팅 URL: <https://travelplaner-545.pages.dev/>
- 개인정보처리방침 URL: <https://travelplaner-545.pages.dev/privacy.html>
- 이용약관 URL: <https://travelplaner-545.pages.dev/terms.html>

### Google Play

- 짧은 설명: `여행 일정, 지도, 예약, 체크리스트와 지출을 한곳에서 관리하세요.`
- 앱 카테고리: 여행 및 지역정보
- 개발자 연락처: Play Console 계정 소유자의 공개 지원 이메일을 입력
- 개인정보처리방침: <https://travelplaner-545.pages.dev/privacy.html>
- 이용약관: <https://travelplaner-545.pages.dev/terms.html>

## 전체 설명 초안

TravelPlaner는 여행 계획부터 현지 지출 정리까지 한곳에서 관리하는 여행 일정 플래너입니다.

여행별 날짜와 목적지를 정하고, 일차별 방문 장소와 시간을 지도에서 확인하세요. 항공권·숙소 등 예약 정보와 준비 체크리스트를 함께 관리할 수 있습니다. 현지 통화와 원화 환산, 카테고리 예산, 결제 수단별 지출, 현금 정산 기능으로 여행 경비도 한눈에 파악할 수 있습니다.

주요 기능:

- 여행별 일차 일정과 지도 동선 관리
- 현재 위치 확인과 외부 지도 경로 연결
- 항공·숙소 등 예약 정보 정리
- 여행 준비 체크리스트
- 다중 통화, 환율, 카테고리 예산과 지출 통계
- JSON 백업, iCalendar, CSV와 통계 이미지 저장
- 로그인 없이 기기에 저장하여 바로 사용
- 선택적 계정 동기화와 공유 일정
- 오프라인 상태 안내와 네트워크 복구 후 재시도

로그인하지 않은 여행 정보는 사용 중인 기기의 앱 저장소에 보관됩니다. 앱을 삭제하거나 운영체제에서 앱 데이터를 지우면 로컬 데이터도 삭제되므로 중요한 일정은 JSON 백업으로 보관하세요.

## 심사 메모 초안

앱은 계정 없이 모든 핵심 여행 계획 기능을 사용할 수 있습니다. 첫 화면에서 여행을 생성한 뒤 일정·예약·체크리스트·예산 탭을 확인할 수 있습니다. 위치 권한은 사용자가 지도 오른쪽의 현재 위치 버튼을 누를 때만 요청합니다. 지도 경로 버튼은 외부 지도 앱 또는 브라우저를 엽니다.

WebView를 사용하지만 다음 네이티브 기능을 제공합니다.

- iOS `WKWebsiteDataStore.default()` 및 Android DOM Storage를 통한 앱 데이터 영구 보존
- 플랫폼 위치 권한 처리
- 네이티브 파일 선택, 다운로드와 공유 시트
- iOS 인증 세션 및 Android 외부 브라우저 인증 복귀
- 운영 Supabase 호스트와 정확한 딥 링크 콜백만 허용하는 인증 브리지
- 딥 링크, 시스템 뒤로가기, 오프라인 복구 UI와 안전 영역 처리

심사 계정은 선택적 로그인 기능을 유지하는 경우에만 별도로 준비합니다. 핵심 기능 검토에는 로그인이 필요하지 않습니다.

## 개인정보 및 데이터 안전 입력 초안

실제 앱 동작과 Supabase/Google 설정을 계정 소유자가 최종 확인한 뒤 제출합니다.

| 데이터 | 처리 목적 | 사용자 연결 | 추적 |
| --- | --- | --- | --- |
| 이메일 주소·인증 식별자 | 선택적 로그인과 동기화 | 예 | 아니요 |
| 여행 일정·예약·체크리스트·예산·지출 | 앱 기능 및 선택적 동기화 | 로그인 시 예 | 아니요 |
| 정확한 위치 | 사용자가 요청한 현재 위치 지도 표시 | 아니요 | 아니요 |
| 로컬 파일 | 백업 가져오기·내보내기 | 아니요 | 아니요 |

- 전송 구간: HTTPS 사용
- 광고 및 광고 추적: 없음
- 위치: 백그라운드 접근 없음
- Android 자동 백업과 기기 간 자동 이전: 비활성화
- 계정 삭제 UI·서버 함수·공개 삭제 페이지 구현, Supabase 마이그레이션과 Cloudflare Secret 운영 적용 완료. 스토어 제출 전 실계정 삭제 흐름 최종 확인 필요
- App Store Connect와 Play Console의 답변에는 앱 자체뿐 아니라 Google Maps 및 Supabase 처리도 포함

## 스크린샷 촬영 목록

각 플랫폼에서 실제 앱 빌드로 촬영하고 실제 개인정보·예약번호는 사용하지 않습니다.

1. 여행 목록과 새 여행 만들기
2. 일차별 일정과 지도 마커
3. 장소 검색 및 일정 추가
4. 예약 정보와 준비 체크리스트
5. 예산·통화·지출 입력
6. 지출 통계 및 이미지 저장

Apple은 기기 종류별로 최소 1장, 최대 10장을 허용합니다. iPad 지원을 유지하므로 iPad 스크린샷도 준비합니다. Google Play에는 휴대전화 스크린샷과 512×512 앱 아이콘, 1024×500 그래픽 이미지를 계정에서 등록합니다.

현재 촬영한 iOS 원본과 크기 정보는 [`store-assets/README.md`](../store-assets/README.md)에 정리했습니다. 스토어 레코드의 실제 업로드 화면에서 요구 크기를 다시 확인한 뒤 사용합니다.

## iOS Archive와 업로드

1. Xcode에서 TravelPlaner 타깃의 Team을 선택합니다.
2. Bundle ID가 계정에서 사용 가능한지 확인합니다.
3. Release용 실기기 테스트를 완료합니다.
4. Archive 후 Organizer에서 `Distribute App → App Store Connect → Upload`를 선택합니다.
5. 자동화가 필요하면 `ios/ExportOptions.plist.example`을 복사해 계정 설정에 맞게 사용합니다.

명령줄 Archive 예시:

```bash
xcodebuild -project ios/TravelPlaner.xcodeproj \
  -scheme TravelPlaner \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/TravelPlaner.xcarchive \
  archive
```

## Android 서명과 내부 테스트

1. Play Console에서 `com.travelplaner.app` 앱을 생성합니다.
2. Play App Signing을 활성화하고 업로드 키를 생성합니다.
3. `android/keystore.properties.example`을 `android/keystore.properties`로 복사해 로컬 값만 입력하거나 문서에 적힌 `TRAVELPLANER_ANDROID_*` CI Secret 네 개를 설정합니다.
4. `cd android && ./gradlew bundleStoreRelease lintRelease`를 실행합니다. 이 명령은 키 파일과 네 개의 서명 값을 먼저 검증하므로 미서명 AAB의 실수 업로드를 막습니다.
5. `android/app/build/outputs/bundle/release/app-release.aab`를 내부 테스트 트랙에 업로드합니다.

2023년 11월 13일 이후 생성된 개인 Play 개발자 계정은 프로덕션 접근 신청 전에 최소 12명의 테스터가 14일 연속 참여한 비공개 테스트를 완료해야 합니다. 내부 테스트로 설치·업데이트를 먼저 확인한 뒤 [`google-play-testing-plan.md`](google-play-testing-plan.md)의 명단과 시나리오를 사용해 비공개 테스트를 시작합니다.

## 계정 소유자가 완료해야 하는 항목

- [x] Xcode 프로젝트 Apple Developer Team 선택
- [ ] Bundle ID 등록과 App Store 배포 프로파일 확인
- [ ] App Store Connect 앱 레코드 생성
- [x] Android 업로드 키 생성과 서명된 AAB 검증
- [ ] Play App Signing 활성화와 업로드 인증서 등록
- [ ] Google Play 앱 레코드 생성
- [ ] Google 결제 프로필 연결, 개인 신원 인증과 개발자 등록비 결제
- [x] Supabase Redirect URLs에 `travelplaner://auth/callback` 추가
- [x] 선택적 로그인 유지 확정
- [x] 계정 삭제 UI·서버 함수·공개 삭제 페이지 소스 구현
- [x] Supabase 계정 삭제·공유 일정 RLS 마이그레이션 적용
- [x] Cloudflare `SUPABASE_SECRET_KEY` Production Secret 설정
- [ ] App Privacy 및 Data safety 설문 최종 제출
- [ ] 실기기 테스트와 스토어 스크린샷 촬영
- [ ] TestFlight 및 Play 내부 테스트 배포
- [ ] Play 비공개 테스트 12명 이상·14일 연속 참여 및 프로덕션 접근 신청

## 공식 기준 참고

- Apple App Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>
- Apple App Privacy: <https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy>
- Apple Required Reason API: <https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api>
- Apple 스크린샷: <https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots>
- Google Play Target API: <https://developer.android.com/google/play/requirements/target-sdk>
- Google Play Data safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Google Play 계정 삭제: <https://support.google.com/googleplay/android-developer/answer/13327111>
- Google Play 개인 계정 테스트 요구사항: <https://support.google.com/googleplay/android-developer/answer/14151465>
- Google Play 개발자 신원 인증: <https://support.google.com/android-developer-console/answer/16641416>
