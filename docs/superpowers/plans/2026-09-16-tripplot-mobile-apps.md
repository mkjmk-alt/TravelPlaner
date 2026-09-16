# TripPlot iPhone·Android 앱 출시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 TripPlot 웹 서비스를 재사용하여, 비로그인 여행 저장과 기존 기능을 유지하는 iPhone·Android 앱을 안정적으로 출시한다.

**Architecture:** iOS는 SwiftUI + WKWebView, Android는 Kotlin + Android WebView인 기존 하이브리드 구조를 유지한다. 지도·일정·즐겨찾기·경비·정산 화면은 공통 웹 코드가 담당하고, 운영체제 권한·인증 화면·파일 공유·앱 복귀는 각 네이티브 앱이 담당한다. 기능 전체를 Swift/Kotlin으로 다시 작성하거나 Expo로 전환하지 않는다.

**Tech Stack:** React/Vite, Cloudflare Pages/Functions, Supabase, SwiftUI/WebKit/AuthenticationServices, Kotlin/AndroidX WebKit, IndexedDB 도입 제안.

**Spec:** 이 문서의 ‘요청 범위와 기본 결정’ 및 2026-09-16 사용자 요청을 기준으로 한다. 기존 구현 기준은 [네이티브 앱 안내](../../native-app.md), [출시 준비](../../store-submission.md), [Android 테스트 계획](../../google-play-testing-plan.md)이다. 기존 문서의 과거 테스트 기록은 현재 바이너리의 검증 결과가 아니다.

## Global Constraints

- 요청 ID: `16aGh0I6dU`. 이번 작업은 조사·계획 문서 작성만 수행한다. 앱 기능 수정·배포·스토어 제출은 하지 않는다.
- 표시명은 `TripPlot`. 번들 ID와 Android applicationId `com.travelplaner.app`, 기존 저장 키, 인증 스킴 `travelplaner://auth/callback`은 유지한다.
- 운영 원점은 `https://travelplaner-545.pages.dev`. 표시명 변경을 이유로 원점이나 패키지 식별자를 바꾸지 않는다.
- 현재 최소 실행 환경은 iOS `16.0`, Android `26`(Android 8). Android compileSdk/targetSdk는 `36`. 실제 의존성 호환성을 검증하고 지원 범위를 임의로 축소하지 않는다.
- 데스크톱의 기존 사이드바 UI와 모바일·태블릿 세로의 독립 스플릿 뷰를 유지한다. 제거한 1·2번 선택 버튼을 되살리지 않는다.
- 로그인은 선택 사항이다. 기본 여행·일정·즐겨찾기·지출 입력에 회원가입을 강제하지 않는다.
- 개발자 계정 결제·본인 확인·스토어 업로드는 사용자가 계정을 준비하는 단계까지 보류한다. 결제하지 않고 가능한 개발·시뮬레이터 검증은 별도로 진행할 수 있다.
- 이전에 보류한 방문 국가 색칠·음성 메모·예약 링크, 신규 광고·유료 구독·백그라운드 위치 추적은 이번 기본 출시 범위에 추가하지 않는다.
- 실제 여행 데이터·실사용자 계정으로 파괴적 테스트를 하지 않는다. 계정 삭제, 데이터 초기화, 충돌·복원 테스트는 격리된 테스트 데이터만 사용한다.
- 구현 시 각 작업마다 실패 재현 → 최소 변경 → 검증 → 범위별 커밋 순서로 진행한다. 관련 없는 기존 변경을 덮어쓰지 않는다.

---

## 1. 요청 범위와 기본 결정

### 어떤 앱을 만드는가

사용자는 App Store/Google Play에서 설치하고 홈 화면의 TripPlot 아이콘으로 실행한다. 주소창 없이 지도를 보고 여행을 만들며, 종료 후 다시 열어도 같은 기기의 여행을 이어서 편집한다. 로그인하면 선택적으로 계정 동기화를 사용한다.

이 방식의 정확한 명칭은 **네이티브 셸을 가진 WebView 기반 하이브리드 앱**이다. 앱 바깥 구조가 Swift/Kotlin이라는 뜻이지, 모든 화면을 SwiftUI/Compose로 다시 만드는 ‘완전 네이티브 재개발’은 아니다.

| 구분 | 이번 기본 방향 | 이유 |
| --- | --- | --- |
| 웹 화면 | 기존 React 화면 재사용 | 이미 만든 지도·분할·정산 기능 유지 |
| iPhone 앱 | 기존 SwiftUI + WKWebView 보강 | iOS 권한·공유·인증을 시스템 방식으로 처리 |
| Android 앱 | 기존 Kotlin + WebView 보강 | 파일 저장·뒤로 가기·권한을 플랫폼에 맞게 처리 |
| 서버 | 현재 Cloudflare/Supabase 유지 | 웹·앱이 동일한 데이터와 API 사용 |
| 지도 | 기존 Google Maps 웹 지도 유지 | 첫 출시에서 지도 SDK까지 교체하지 않음 |
| 오래된 Expo 프로젝트 | 참고용으로 보존 | 배포 경로를 둘로 늘리지 않음 |
| 앱 종료 시 데이터 | 같은 설치·원점의 저장소 유지 | 새 앱을 열 때마다 초기화하지 않음 |
| 앱 삭제·기기 교체 | 백업 파일 또는 선택적 계정 동기화로 복원 | 로그인 없는 데이터의 자동 복구를 보장하지 않음 |

### 데이터 유지와 오프라인은 다른 문제

- **데이터 유지:** 정상 저장이 끝난 일정이 강제 종료·재부팅·동일 앱 업데이트 후 남는 것.
- **오프라인 실행:** 인터넷이 없을 때 앱 화면 자체도 열리고 저장된 일정을 읽을 수 있는 것.
- 현재 기본 저장 설정은 있지만, 이것만으로 오프라인 실행과 사진 대량 보관까지 보장되지는 않는다.
- Safari/Chrome에 저장한 비로그인 여행과 앱 WebView의 저장소는 별개다. 기존 웹 사용자는 JSON 내보내기/가져오기 또는 계정 동기화로 옮기도록 안내한다.
- 앱 제거, 기기 초기화, 사용자의 저장공간 삭제는 별도다. 로그인 없이 다른 기기에 자동으로 여행이 생기는 기능으로 설명하지 않는다.

## 2. 현재 코드에서 확인한 상태

2026-09-16 소스·설정·문서를 읽어 확인했다. 이번 조사에서 앱을 새로 빌드하거나 실기기에서 실행하지 않았다. 아래 ‘있음’은 구현 존재를 뜻하며 최신 배포본의 완전한 동작 보증이 아니다.

| 항목 | 확인된 구현 | 출시 전 확인/보강 |
| --- | --- | --- |
| iOS 앱 | `ios/TravelPlaner/`에 SwiftUI/WKWebView 존재 | 최신 코드로 재빌드, 작은 화면·실기기 확인 |
| Android 앱 | `android/app/`에 Kotlin WebView 존재 | JDK/SDK 설정 고정 후 재빌드 |
| 비로그인 저장 | localStorage, iOS 기본 영구 데이터 저장소, Android DOM 저장 활성화 | 저장 실패·업데이트·사진 포함 복원 테스트 |
| 로그인 | 이메일/Google, 외부 인증 창, 커스텀 콜백 처리 | PKCE·콜드 스타트 복귀·Apple 로그인 검토 |
| 계정 삭제 | 웹 UI·서버 API·안내 페이지 존재 | 테스트 계정으로 종단간 삭제 확인, 사진 저장 추가 시 삭제 범위 확장 |
| 공유/파일 | iOS 공유 시트, Android 문서 저장 및 파일 선택 처리 | 파일 형식·취소·대용량·사진 포함 백업 |
| 위치/외부 링크 | 시스템 권한과 외부 브라우저 분기 | 거절·대략적 위치·재허용·앱 복귀 |
| 오프라인 | Service Worker 및 네이티브 오류 안내 존재 | JS 캐시·오류 응답·통신 복구 처리 보강 |
| 자동 테스트 | 웹 테스트와 iOS 비로그인 재실행 UI 테스트 존재 | Android 실제 UI 테스트 및 현재 기능 회귀 검사 보강 |
| 출시 자료 | 스토어 문구·개인정보·아이콘 등 존재 | 현재 기능/브랜드가 반영된 실제 앱 화면으로 갱신 |

### 우선순위가 높은 구체적 차이

1. **사진과 공유 용량:** `src/TravelMemoryPanel.jsx`는 최대 2.5MB 사진을 Data URL로 여행에 넣는다. `functions/api/shared-trips.js`는 요청 본문을 1MB로 제한한다. 사진이 포함되면 제한에 걸릴 수 있고, 문자열 인코딩으로 용량도 증가한다. 단순히 서버 제한만 늘리는 방식으로 끝내지 않는다.
2. **오프라인 캐시:** `public/sw.js`의 사전 저장 목록에 빌드 JS/CSS 전체가 없다. 요청 실패 시 JS나 이미지 요청에도 HTML을 반환할 수 있다. 저장된 여행이 있어도 화면이 부팅하지 못할 위험을 확인해야 한다.
3. **초기 오류:** `src/main.jsx`는 설정 요청 이후 동적 import로 화면을 연다. 설정 요청 지연과 앱 모듈 로드 실패를 React 오류 화면 이전 단계에서도 처리해야 한다. 네이티브 오류 화면도 ‘인터넷 연결은 있지만 서버/페이지 오류’인 경우를 포함해야 한다.
4. **iOS 브랜드 설정:** `ios/project.yml`과 Info.plist는 TripPlot이지만 `.xcodeproj/project.pbxproj`에는 TravelPlaner 표시 설정이 남아 있다. 프로젝트 재생성 후 최종 빌드 산출물의 이름을 확인한다. 현재 설치 앱 이름이 틀렸다고 단정하지는 않는다.
5. **인증과 브리지:** iOS 인증 복귀 시 WebView가 아직 없으면 처리 유실 가능성이 있다. iOS 메시지 처리에는 허용 원점 검사와 함께 메인 프레임 검사도 추가한다. Android에는 메인 프레임 검사가 있다.
6. **알림:** 현재 웹 `Notification` 방식은 앱 종료 후 일정 알림의 보장이 아니다. 시스템 예약 알림을 원하면 별도 네이티브 작업이 필요하다.
7. **빌드 도구:** 현재 Mac에서 Xcode 27.0과 XcodeGen을 확인했다. 기본 Java 검색에서는 런타임을 찾지 못했으며 Android Studio 내장 JBR은 25다. 프로젝트는 JVM toolchain 17을 지정하므로, 내장 JBR만 믿지 말고 Gradle 실행용 JDK와 컴파일용 17을 호환되게 고정한다.

## 3. 구현 경계와 데이터 흐름

```text
iPhone: SwiftUI + WKWebView ─┐
                           ├─ 공통 TripPlot 웹 화면 ─ 여행 저장소 ─ 로컬 일정/사진
Android: Kotlin + WebView ──┘             │
       │                                └─ 선택적 로그인 ─ Cloudflare/Supabase
       └─ 권한 / 외부 인증 / 파일 / 공유 / 앱 복귀
```

### 공통 웹이 담당할 것

- 지도·마커·장소 검색·일차별 일정·즐겨찾기·준비물·여행 기록.
- 지도/일정 자유 크기 조절과 화면별 레이아웃.
- 통화·지출자·공동 지출 참여자·1/n 정산과 금액 계산.
- 저장 완료 상태, 동기화 충돌 안내, 백업/복원 데이터 형식.

### 네이티브 앱이 담당할 것

- 앱 실행·백그라운드 복귀·안전 영역·키보드·네트워크 오류 화면.
- 시스템 인증 창, 외부 링크 열기, 허용된 링크의 앱 복귀.
- 위치 권한, 파일 선택·저장·공유, 뒤로 가기 동작.
- 운영 빌드의 디버그 기능 차단과 허용 원점 검증.

### 저장 설계 제안

여행·장소·지출·기록의 읽기/쓰기를 `TripRepository`로 모으고, 큰 사진은 JSON 문자열과 분리한 IndexedDB Blob으로 저장한다. 설정처럼 작은 값은 기존 localStorage에 남겨도 된다. 처음부터 SwiftData와 Room에 동일한 여행을 각각 다시 구현하지 않는다.

- 저장 완료를 확인한 뒤에만 ‘저장됨’ 표시.
- 기존 저장 키를 즉시 지우지 않고, 원본 보존 → 새 저장소 트랜잭션 → 재읽기 검증 → 전환 완료 표시 순으로 이동.
- 전환에 실패하면 원래 데이터로 다시 시작하고 복원 가능한 안내 표시. 빈 데이터로 덮어쓰지 않음.
- 공용 여행에는 로컬 Blob ID만 보내지 않음. 별도 미디어 업로드와 접근 가능한 참조가 준비되기 전에는 해당 사진을 ‘공유되지 않음’으로 명확히 표시하고 텍스트 여행 공유는 유지.
- 미디어 업로드를 추가할 때는 공유 링크의 권한, 링크 해제, 계정 삭제, 고아 파일 정리를 함께 구현. 로그인하지 않은 로컬 사진을 자동 업로드하지 않음.
- JSON 백업은 기존 형식을 읽을 수 있게 유지하고, 사진을 포함한 내보내기에는 크기 제한·진행 상태·복원 검증을 제공. 이미지가 빠지면 백업이 완전하다고 표시하지 않음.
- 구조화 데이터의 원본은 하나로 유지. 복구용 네이티브 사본을 추후 추가하더라도 독립 편집 가능한 두 번째 데이터베이스로 만들지 않음.

## 4. 작업 순서와 산출물

8단계로 진행한다. 각 단계의 확인 항목이 통과해야 다음 배포 후보에 포함한다. 저장·인증·운영체제 통합은 별도 작업 묶음으로 나누고, 실행 시 변경 범위를 작은 테스트 가능한 단위로 분할한다.

### 단계 1. 두 앱의 현재 빌드 기준 확정

**파일:** `ios/project.yml`, `ios/TravelPlaner.xcodeproj/project.pbxproj`, `ios/TravelPlaner/Info.plist`, `ios/TravelPlaner/AppConfiguration.swift`, `android/app/build.gradle.kts`, `android/app/src/main/java/com/travelplaner/app/AppConfig.kt`, `docs/native-app.md`.

**산출물:** 같은 웹 코드를 여는 두 개발용 앱, 재현 가능한 빌드 절차, 테스트 전용 실행 설정.

- [x] 현재 커밋과 변경 파일을 기록하고 정상 기준 웹 테스트를 먼저 실행한다.
- [x] XcodeGen 설정을 기준으로 프로젝트를 다시 생성하고, 표시명 TripPlot·기존 bundle ID가 빌드 결과에 반영됐는지 확인한다.
- [x] Gradle 8.13/AGP 설정과 호환되는 JDK 17 환경을 확정한다. 사용자 전체 Java 설정을 임의로 바꾸지 않고 프로젝트 실행 환경에 지정한다.
- [ ] 개발/테스트/운영 URL을 빌드 설정으로 분리한다. 운영 앱의 HTTPS 허용 목록을 유지하며 디버그에서 허용한 로컬 URL이 운영에 섞이지 않게 한다.
- [x] 두 앱을 시뮬레이터/에뮬레이터에 설치해 비로그인 첫 화면까지 실행한다. 테스트 환경은 별도 저장소·테스트 계정으로 격리한다.

현재 확인: iPhone 17 Pro Simulator에는 `com.travelplaner.app` Debug 빌드를 설치하고 실행했다. Android API 36 `TravelPlaner_API_36` 휴대폰 AVD와 `MarketBrief_Tablet_API_36` 태블릿 AVD를 확인하고, 두 환경에 `com.travelplaner.app` Debug APK를 설치해 실행했다. 태블릿 AVD는 가로 방향으로 실행되어 데스크톱형 레이아웃을 확인했으며, 세로 태블릿 조건은 별도 검증으로 남긴다.

```sh
# 저장소 루트에서 웹 기준 검증
npm test
npm run lint
npm run build
npm run native:security
npm run store:validate

# 저장소 루트에서 iOS 프로젝트 생성 및 시뮬레이터 빌드
xcodegen generate --spec ios/project.yml
xcodebuild -project ios/TravelPlaner.xcodeproj -scheme TravelPlaner -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO

# android 디렉터리에서, JDK 17 환경 확인 후
./gradlew --version
./gradlew assembleDebug lint
```

**완료 기준:** 웹 검사 통과, 두 앱 설치·실행, 최신 표시명 확인, 운영 설정에 개발 URL/비밀키 없음. 이 단계에서 스토어 제출 가능까지 주장하지 않는다.

### 단계 2. 모바일 화면·스크롤·앱 조작 안정화

**파일:** `src/App.jsx`, `src/App.css`, `src/index.css`, `src/mobileSidebar.js`, `src/splitView.js`, `ios/TravelPlaner/TravelWebView.swift`, `ios/TravelPlaner/ContentView.swift`, `android/app/src/main/java/com/travelplaner/app/MainActivity.kt`.

**테스트:** 기존 `tests/mobile-sidebar.test.mjs`, `tests/split-view.test.mjs` 보강, 새 `tests/e2e/mobile-layout.spec.mjs` 및 브라우저 테스트 실행 설정 추가.

**진행 기록:** `src/splitView.js`의 `getViewportSize`로 실제 보이는 viewport를 기준으로 분할 높이를 재계산하는 공통 함수와 회귀 테스트를 먼저 반영했다. 주소창·키보드가 열려 viewport가 줄어드는 경우까지 테스트했으며, 아래 화면 조작 항목은 실제 기기 검증 전까지 미완료로 유지한다.

**2026-09-16 에뮬레이터 확인:** Android API 36 휴대폰 AVD에서 지도·검색창·현재 위치/경로 버튼·TripPlot 영역이 정상 표시되었고, 일정 영역을 위로 스크롤해 하단의 AI 일정 만들기·참여하기·빈 일정 안내·푸터까지 접근되는 것을 확인했다. 여행 생성 모달과 여행 이름 입력칸도 열리는 것을 확인했다. 태블릿 AVD에서는 가로 화면의 기존 데스크톱형 레이아웃과 여행 생성 모달을 확인했다. 실제 세로 태블릿, 키보드가 열린 상태, 핸들 드래그의 최종 검증은 계속 미완료로 둔다.

- [ ] 작은 iPhone·Android와 태블릿 세로 화면에서 하단 버튼 가림, 저장 상태 영역, 상하 스크롤, 분할 핸들 충돌을 먼저 재현한다.
- [ ] 크기 조절은 가운데 핸들만 처리하고 일정 목록의 세로 터치는 스크롤에 맡긴다. 문서 전체와 내부 목록이 이중으로 세로 스크롤되지 않게 한다.
- [ ] 안전 영역 여백은 웹/앱 중 한 곳이 각 경계를 책임지게 한다. Android edge-to-edge와 키보드 inset, iOS 홈 인디케이터를 실측한다.
- [ ] 이름·금액·메모 입력 시 키보드 위로 입력칸과 저장 버튼을 볼 수 있게 한다. 입력 중 화면 높이 변경이 지도/일정 비율을 영구히 덮어쓰지 않게 한다.
- [ ] iOS의 무조건적인 당겨서 새로고침은 분할 화면/입력 중에는 작동시키지 않는다. 재시도는 명시적인 버튼으로도 제공한다.
- [ ] Android 뒤로 가기는 모달 닫기 → 내부 화면 이동 → 앱 종료 순으로 동작한다. iOS 뒤로 가기 제스처가 일정 편집을 임의로 유실시키지 않게 한다.
- [ ] 검색·현재 위치·경로 버튼은 지도 영역 내부에만 배치하고 일정 전체 화면에서는 가린다. 큰 글자/VoiceOver/TalkBack에서 라벨·터치 영역도 확인한다.

**완료 기준:** 키보드가 열린 작은 화면에서도 추가/저장 버튼에 도달 가능, 모든 목록 스크롤 가능, 분할 조절 시 데이터·선택 일차 유지, 세로↔가로 전환 후 빈 공간·중첩 없음.

### 단계 3. 비로그인 저장·사진·백업 안정화

**파일:** 새 `src/storage/tripRepository.js`, `src/storage/mediaStore.js`, `src/storage/migrateLegacyStorage.js`; 수정 `src/App.jsx`, `src/TravelMemoryPanel.jsx`, `src/travelMemory.js`, `functions/api/shared-trips.js`; 미디어 서버가 필요한 경우 별도 인증된 `functions/api/media.js`와 Supabase 권한 migration 추가.

**테스트:** 새 `tests/trip-repository.test.mjs`, `tests/e2e/storage-persistence.spec.mjs`; 기존 iOS `ios/TravelPlanerUITests/PersistenceUITests.swift` 보강; 새 Android `android/app/src/androidTest/java/com/travelplaner/app/PersistenceTest.kt`.

**공통 인터페이스:** `TripRepository.load(): Promise<Trip[]>`, `save(trips): Promise<{savedAt: string}>`, `MediaStore.put(blob): Promise<{id: string, bytes: number}>`, `get(id): Promise<Blob>`. `Trip`은 현재 여행 객체를 유지하며 사진 참조만 확장한다. 저장 실패는 reject하고 ‘저장됨’으로 처리하지 않는다.

- [ ] 테스트 저장소에 여행·즐겨찾기·지출자·분담자·사진을 가진 기존 데이터를 만든다. 먼저 저장 실패와 마이그레이션 중단 테스트를 작성한다.
- [ ] 저장 접근을 Repository로 모은 뒤 기존 localStorage 데이터를 원본 보존 상태에서 옮긴다. 기존 기기와 이전 앱이 쓰는 데이터 형식의 하위 호환을 검사한다.
- [ ] 사진은 방향을 보정하고 크기를 제한해 Blob으로 저장한다. 최초 권장값은 긴 변 최대 1600px·결과 파일 최대 1MB로 잡고 실제 화질/메모리 검사로 확정한다. 지원하지 않는 이미지·변환 실패는 사진만 거절하고 여행은 보존한다.
- [ ] 여행 JSON에서 사진 본문을 분리한다. 사진 포함 공유는 별도 미디어 경로와 권한이 준비된 경우에만 완료 처리한다. 계정/공유 해제 후 접근 차단도 검증한다.
- [ ] 용량 부족·쓰기 실패·불완전한 백업에는 원본을 유지하고 재시도/백업 안내를 표시한다. 백업 가져오기는 검증과 미리보기 후 병합/교체를 사용자가 선택하게 한다.
- [ ] 강제 종료, 기기 재시작, 같은 앱 업데이트, 로그아웃/재로그인, 계정 삭제 뒤 로컬 데이터 선택 처리까지 분리해 검증한다. 계정 데이터와 게스트 데이터를 무조건 합치지 않는다.

저장 계약 테스트는 예를 들어 다음처럼 작성한다. 테스트용 어댑터를 주입할 수 있도록 `createTripRepository`를 정의한다.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTripRepository } from '../src/storage/tripRepository.js';

test('쓰기에 실패하면 저장 성공을 반환하지 않는다', async () => {
  const storage = {
    read: async () => [],
    write: async () => { throw new Error('QUOTA_EXCEEDED'); }
  };
  const repo = createTripRepository({ storage });
  await assert.rejects(repo.save([{ id: 'test-trip', name: '저장 검사' }]), /QUOTA_EXCEEDED/);
});
```

**완료 기준:** 여행·사진·정산 데이터의 재실행/업데이트 전후 일치, 저장 실패 거짓 성공 없음, 기존 백업 읽기, 사진 포함 공유의 크기·권한 테스트 통과. 데이터 양을 늘린 저용량 기기 테스트 결과를 남긴다.

### 단계 4. 오프라인 실행과 오류 복구

**파일:** `src/main.jsx`, `public/sw.js`, `vite.config.js`, `ios/TravelPlaner/ContentView.swift`, `ios/TravelPlaner/BrowserModel.swift`, `android/app/src/main/java/com/travelplaner/app/MainActivity.kt`; 새 `tests/e2e/offline-startup.spec.mjs`.

- [ ] 한 번 정상 실행한 앱을 비행기 모드에서 완전히 종료 후 다시 열고, 저장된 여행을 읽을 수 있는지 실패부터 확인한다.
- [ ] Vite가 만든 해시 기반 JS/CSS와 필수 화면 파일 목록을 빌드 시 생성해 사전 캐시한다. 응답 성공 여부를 확인하고 인증/개인 API 응답은 공용 캐시에 넣지 않는다.
- [ ] HTML fallback은 화면 이동 요청에만 사용한다. JS/CSS/사진 요청에는 해당 형식의 캐시 또는 명확한 실패를 반환한다. 캐시 삭제도 이 앱이 소유한 접두사에만 한정한다.
- [ ] 설정 로딩에는 제한 시간과 취소를 두고, 앱 모듈 import 실패도 잡는 초기 복구 화면을 React 바깥에 준비한다. 재시도·연결 확인은 가능하되 자동 데이터 삭제 버튼으로 처리하지 않는다.
- [ ] ‘지도/장소 검색은 온라인 필요’와 ‘일정은 기기에 저장됨’을 구분한다. 지도 API 키 오류가 앱 전체 사용을 막지 않게 한다.
- [ ] 새 웹 배포는 사용자가 편집하는 도중 강제 교체하지 않는다. 새 캐시 준비 후 저장 완료 상태에서 새로고침을 안내하며 이전 셸과 호환되는 데이터를 유지한다.
- [ ] iOS 콘텐츠 프로세스 종료·Android 렌더러 오류는 제한된 횟수로 복구하고, 반복 실패 시 명시적인 재시도 화면을 보인다. 서버 500/인증서/파일 로드 오류를 단순 오프라인과 구분한다.

**완료 기준:** 정상 방문 후 오프라인 콜드 스타트에서 저장 여행 열람, 처음 설치 후 한 번도 접속하지 못한 경우에는 빈 화면 대신 안내, 네트워크 복구 후 재동기화. Google 지도 타일의 임의 다운로드·오프라인 지도 제공은 범위에서 제외한다.

**실행 시 결정 게이트:** 실제 WKWebView/Android에서 캐시 기반 부팅이 수용 기준을 만족하지 못하면 ‘완전 오프라인 지원’으로 출시 문구를 쓰지 않는다. 같은 원점을 유지하는 네이티브 읽기 전용 여행 사본 화면을 별도 소규모 설계로 추가할지 결정한다. `file://`로 바꾸어 저장 원점을 깨뜨리는 해결책은 쓰지 않는다.

### 단계 5. 로그인·앱 복귀·계정 삭제 마무리

**파일:** `src/supabaseClient.js`, `src/App.jsx`, 새 `src/native/authSession.js`, `ios/TravelPlaner/BrowserModel.swift`, `ios/TravelPlaner/TravelPlanerApp.swift`, `android/app/src/main/java/com/travelplaner/app/MainActivity.kt`, `functions/api/account.js`; 테스트 `tests/account-function.test.mjs`, 새 `tests/native-auth.test.mjs` 및 플랫폼 UI 테스트.

- [ ] Google 로그인은 WebView 내부 로그인 폼이 아니라 시스템 인증 창/외부 브라우저로 이어지게 유지한다.
- [ ] Supabase 인증은 PKCE 사용을 명시하고 검증자·세션의 저장 위치를 단일화한다. 콜백은 허용된 scheme/host/path와 진행 중인 인증 요청에 대해서만 처리한다. 토큰·코드·이메일을 로그에 남기지 않는다.
- [ ] 로그인 중 취소, 동일 콜백 재전달, 앱이 종료된 뒤 콜백으로 실행, 인증창을 여는 동안 WebView 재생성을 테스트한다. 아직 WebView가 없으면 콜백을 보관하고 준비 후 한 번 처리한다.
- [ ] Google 로그인을 유지하는 iOS 출시안에는 Sign in with Apple을 포함하는 방향으로 준비한다. 네이티브 Apple 인증의 nonce 및 Supabase 토큰 교환을 검증하고, WebView와 별도 계정 세션이 생기지 않게 한다. 계정 기능 설정·실제 연동은 Apple 개발자 계정 준비에 의존한다.
- [ ] 로그인 시 기존 게스트 여행을 ‘계정에 옮기기/기기에만 두기’로 명시한다. 이메일이 같다는 이유만으로 별개의 계정을 자동 병합하지 않는다.
- [ ] 테스트 계정 삭제로 서버 데이터·공유 소유권·추가한 미디어·로그인 세션을 확인한다. Apple 연결을 추가하면 연결 해제/토큰 폐기 절차도 포함한다. 로컬 여행 삭제 선택은 별도로 명시한다.
- [ ] 초기 출시에서는 기존 인증 스킴을 유지하되, 인증코드 가로채기 완화는 PKCE로 처리한다. HTTPS Universal Links/App Links는 도메인 연결 파일·팀 식별자·서명 지문 확인 후 별도 확장한다.

**완료 기준:** 로그인 없이 사용 가능, 두 플랫폼 로그인 성공/취소/콜드 복귀, 타 계정 데이터 노출 없음, 테스트 계정 삭제 종단간 통과.

Apple 로그인 판단은 [App Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)의 동등한 개인정보 보호 로그인 요건과 예외를 확인해 적용한다. 모든 앱에 일률적으로 Apple 로그인이 의무라는 뜻은 아니다. 구현 근거는 [Supabase Apple 로그인 안내](https://supabase.com/docs/guides/auth/social-login/auth-apple)를 따른다.

### 단계 6. 네이티브 기능과 보안 경계 정리

**파일:** 새 `src/native/bridge.js`; 기존 `ios/TravelPlaner/TravelWebView.swift`, `ios/TravelPlaner/AppConfiguration.swift`, `android/app/src/main/java/com/travelplaner/app/MainActivity.kt`, `android/app/src/main/java/com/travelplaner/app/AppConfig.kt`, `android/app/src/main/AndroidManifest.xml`; `scripts/validate-native-security.mjs` 보강, 새 `tests/native-bridge.test.mjs`.

**새 브리지 계약:** `getCapabilities()`로 지원 기능을 탐지한다. 요청은 `{ requestId, action, payload }`, 응답은 `{ requestId, ok, result, error }`. action은 허용된 동작만 지원하며 알 수 없는 동작은 거절한다. 기존 다운로드/인증 브리지는 구형 설치 앱과의 호환을 위해 바로 제거하지 않는다.

- [ ] iOS/Android 공통으로 HTTPS 허용 원점·포트·메인 프레임을 검사한다. iframe·외부 링크·임의 JavaScript에서 네이티브 기능을 실행할 수 없는 실패 테스트를 만든다.
- [ ] 요청 크기·파일명·MIME·동작 횟수·타임아웃을 검사한다. 큰 사진/백업 파일을 제한 없는 Base64 한 번 전송으로 처리하지 않는다.
- [ ] 위치는 사용자가 현재 위치 버튼을 누를 때 요청한다. 거절/대략적 위치만 허용해도 일정과 수동 검색은 가능해야 한다. 백그라운드 위치 권한을 추가하지 않는다.
- [ ] 사진 선택은 시스템 선택기를 사용하고 취소를 오류로 표시하지 않는다. 전체 사진 보관함/카메라 접근은 필요 기능이 없는 한 요청하지 않는다. 기존 HTML 파일 입력으로 요구사항을 충족하면 별도 사진 브리지를 만들지 않는다.
- [ ] JSON·ICS·CSV·PNG의 파일명/내용/취소/빈 데이터/용량 제한을 확인한다. iOS는 공유 시트, Android는 시스템 문서 저장을 유지한다. 다른 앱으로 공유하는 동작과 기기에 저장하는 동작을 혼동하지 않게 한다.
- [ ] 운영 앱의 WebView 디버깅, 혼합 콘텐츠, 불필요한 파일 접근이 꺼져 있는지 빌드 결과로 확인한다. 서버 관리자 키·서명키는 웹 번들이나 앱 자원에 넣지 않는다.

**완료 기준:** 권한 거절에도 핵심 기능 사용 가능, 허용되지 않은 원점의 브리지 호출 차단, 파일 왕복 검증, 구형 네이티브 앱에서도 새 웹 기본 기능 동작.

**선택 확장 — 앱이 닫혀 있어도 일정 알림:** 이번 기본 앱 전환과 분리한다. 구현할 경우 iOS `UNUserNotificationCenter`, Android 알림 채널·예약 API로 일정 ID별 등록/수정/취소를 만들고, 권한 거절·재부팅·시간대 변경·여행 삭제를 테스트한다. Android 강제 중지와 절전 정책 등으로 전달 시각을 무조건 보장하지 않는다. 기존 웹 Notification만으로 지원한다고 안내하지 않는다. 푸시 서버·광고 알림은 추가하지 않는다.

### 단계 7. 두 플랫폼 통합 테스트와 출시 자료 검증

**파일:** `ios/TravelPlanerUITests/PersistenceUITests.swift`, 단계별 웹/Android UI 테스트, `ios/TravelPlaner/PrivacyInfo.xcprivacy`, `store-metadata/privacy-declarations.json`, `store-metadata/app-store-ko.json`, `store-metadata/google-play-ko.json`, `docs/store-submission.md`, 새 `docs/mobile-release-verification.md`.

- [ ] 테스트 데이터/계정은 별도 준비하고 iOS 기존 고정 테스트 여행명을 실행별 고유 이름으로 바꾼다. 운영 여행을 삭제하거나 동기화하지 않는 실행 설정을 사용한다.
- [ ] 웹 전체 테스트·lint·build·스토어 문구·네이티브 보안 검사를 실행한다. 소스 문자열 검사만 통과한 상태를 실기기 성공으로 기록하지 않는다.
- [ ] 아래 기기/시나리오 표를 수행해 기기·OS·앱 빌드·웹 커밋·결과·실패 재현을 기록한다.
- [ ] 정산은 지출자/참여자 변경, 미참여 지출자, 환율, 소수점/원 단위 반올림 후 총액 일치, 삭제/수정 후 재계산을 재검증한다.
- [ ] 앱 재시작 후에도 최근 배포의 지도 마커 튐·지도 미표시·하단 가림·스크롤 불가가 재발하지 않는지 확인한다.
- [ ] 개인정보 신고는 실제 네트워크 데이터 흐름으로 대조한다. 특히 새 사진·일기·동행자 이름·금액의 수집/공유/삭제 범위를 반영한다. iOS Privacy Manifest와 App Store 개인정보 응답, Google Data safety는 서로 다른 항목으로 각각 검증한다.
- [ ] 작은 iPhone/큰 iPhone/iPad/Android의 실제 최종 빌드에서 스크린샷을 만든다. 과거 TravelPlaner/Tribly 이미지나 브라우저 주소창 캡처를 스토어 앱 화면으로 쓰지 않는다.

| 검증 축 | 필수 시나리오 | 통과 기준 |
| --- | --- | --- |
| 기기 | 지원 최소 OS 및 제출 시점 최신 정식 OS, 작은/큰 iPhone, iPad 세로·가로, Android 휴대전화·태블릿 | 화면 가림/조작 불가 없음; 대표 실기기 포함 |
| 앱 수명 | 새 설치, 종료, 프로세스 회수, 재부팅, 기존 설치 위 업데이트 | 정상 저장 완료 데이터 유지 |
| 저장 | 사진 다수, 저장공간 부족, 실패 후 재시도, 백업 왕복, 이전 데이터 이동 | 원본 손실·거짓 저장 성공 없음 |
| 연결 | 오프라인 콜드 시작, 연결 복구, 느린 설정 요청, 서버 500, 지도 키 오류 | 안내/재시도 가능; 일정 기능 독립 유지 |
| 인증 | 비로그인, 이메일, Google, Apple 적용 시 해당 로그인, 취소·콜드 복귀, 삭제 | 세션 혼선/개인 데이터 유출 없음 |
| 입력 | 키보드, 긴 한글명, 숫자, 큰 글자, 화면 회전, 드래그 중 스크롤 | 추가/수정/삭제 버튼 접근 가능 |
| 공동 여행 | 여러 기기 수정, 사진 공유, 링크 해제, 권한 없는 삭제 | 명시된 권한과 충돌 규칙 준수 |
| 파일/권한 | 위치 거절·재허용, 사진 취소·지원불가 형식, CSV/ICS/PNG/JSON | 크래시 없이 성공 또는 이해 가능한 안내 |

**완료 기준:** 데이터 손실·크래시·로그인 불가·핵심 UI 조작 불가 없음. 알려진 제한은 스토어 문구/도움말과 일치. 새 iOS archive/Android AAB를 만들고 실제 검증한 산출물의 체크섬을 기록한다.

### 단계 8. 계정 준비 후 테스트 배포·스토어 출시

**파일:** `docs/store-submission.md`, `docs/google-play-testing-plan.md`, `docs/mobile-release-verification.md`, 기존 iOS/Android 서명·배포 설정. 비밀번호/비밀키는 기록 문서에 저장하지 않는다.

- [ ] 사용자가 Apple Developer/Google Play 개발자 계정 결제·신원 확인을 완료하면 실제 접근 권한과 앱 식별자 등록 상태를 확인한다. 소스에 팀 ID가 있다는 이유로 가입 완료로 판단하지 않는다.
- [ ] iOS는 적합한 배포 서명으로 archive → App Store Connect 업로드 → TestFlight 내부/필요한 외부 테스트 → 심사 순으로 진행한다. 시뮬레이터 실행은 이 절차를 대신하지 않는다.
- [ ] Android는 업로드 키의 안전한 백업을 확인하고 `bundleStoreRelease`로 서명 AAB 생성 → Play App Signing 설정 확인 → 내부 테스트 → 필요 시 비공개 테스트 → 프로덕션 접근 신청 순으로 진행한다.
- [ ] 심사자가 비로그인으로 여행을 만들 수 있는 절차와, 계정 기능 검증에 필요한 테스트 계정을 비공개 심사 정보에 제공한다. 실제 사용자 계정/개인 여행을 제공하지 않는다.
- [ ] 개인정보/지원/계정 삭제 URL, 앱 접근성, 콘텐츠/연령 등급, 필요한 수출 관련 질문, 제출 지역 설정을 실제 기능 기준으로 작성한다.
- [ ] 제출 시점의 OS SDK·계정별 테스트 조건을 다시 확인한다. 심사 승인과 완료 날짜는 보장하지 않는다.
- [ ] 첫 공개는 가능한 제한된 범위에서 확인 후 확대한다. 업그레이드할 때 앱 식별자·서명키·저장 원점을 유지하며 각 스토어가 요구하는 새 빌드 번호를 사용한다.

**완료 기준:** 사용자가 지정한 배포 범위에서 스토어 설치가 가능하고, 실제 스토어 설치/업데이트 후 데이터 유지와 핵심 흐름을 검증한다. 계정 결제가 미완료라면 ‘앱 준비 완료 / 스토어 출시 대기’로 구분한다.

## 5. 제출 정책 확인 사항

정책은 2026-09-16 조회 기준이며 실제 제출 전에 다시 확인한다.

- Apple은 2026-04-28부터 iOS/iPadOS 업로드에 SDK 26 이상을 요구한다. 이는 앱의 최소 실행 OS를 26으로 올리라는 뜻이 아니다. 현재 README의 Xcode 16+ 안내는 새 제출 기준에 맞춰 수정해야 한다. [Apple SDK 공지](https://developer.apple.com/news/?id=ueeok6yw)
- Google Play 신규 앱/업데이트는 2026-08-31부터 Android 16(API 36) 이상 대상이 필요하다. 현재 앱 설정은 36이지만 대상 OS 행동 변화 테스트까지 끝난 상태라는 뜻은 아니다. [Android 공식 target API 안내](https://developer.android.com/google/play/requirements/target-sdk)
- 2023-11-13 이후 생성한 개인 Play 계정에는 최소 12명·연속 14일 비공개 테스트 후 프로덕션 접근 신청 조건이 적용된다. 계정 유형/생성일을 확인해야 하며 내부 테스트만으로 대체하지 않는다. [Google Play 테스트 조건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- WebView라는 이유만으로 금지되는 것은 아니지만, 웹사이트를 단순 포장한 수준을 넘는 충분한 유용성과 앱 사용 경험이 필요하다. TripPlot의 일정 작성·오프라인 열람·정산·파일 공유를 실제 동작으로 보여 주고 계정 생성 기능에는 삭제 경로를 제공한다. 네이티브 기능 몇 개를 넣었다고 심사가 보장되지는 않는다. [Apple 심사 기준 4.2·5.1.1](https://developer.apple.com/app-store/review/guidelines/)

## 6. 예상 일정과 선후 관계

아래는 기존 코드 재사용을 전제로 한 개발 작업량 추정이며 확정 납기가 아니다. 이번 조사에서 새 빌드를 돌리지 않았으므로 단계 1 결과로 조정한다.

| 순서 | 작업 | 예상 작업일 | 선행 조건 |
| --- | --- | --- | --- |
| 1 | 현재 빌드·개발 앱 실행 기준 확정 | 1~2일 | 기존 저장소·개발 도구 |
| 2 | 화면/스크롤/키보드/분할 조작 | 2~3일 | 1 |
| 3 | 저장·사진·마이그레이션·백업 | 3~5일 | 1 |
| 4 | 오프라인·캐시·초기 오류 복구 | 2~3일 | 1, 3 |
| 5 | 인증·복귀·Apple 로그인·삭제 | 2~4일 | 1, 3, 실제 연동은 계정 준비 |
| 6 | 파일·권한·보안 브리지 | 2~3일 | 1, 2, 3 |
| 7 | 통합 회귀·실기기·출시 자료 | 3~5일 | 2~6 |
| 8 | 서명·테스트 배포·심사 제출 준비 | 1~2일 + 외부 대기 | 7, 개발자 계정 |

합계는 약 16~27 작업일이다. 1인 순차 진행이면 대략 4~6주를 작업용 예산으로 잡는다. Google 조건부 14일 테스트, 계정 심사, Apple/Google 심사 대기는 별도이며 일부는 마지막 검증과 겹칠 수 있다. 사진 서버 권한 설계나 저장 마이그레이션에서 문제가 발견되면 늘어난다. 선택 확장인 시스템 일정 알림 작업은 포함하지 않았다.

초기 실행 시연은 전체 기간을 기다릴 필요 없이 단계 1에서 먼저 제공한다. 화면 점검은 iOS/Android 각각 진행하고, 사용자 데이터가 걸린 저장 작업은 검증 없이 운영 반영하지 않는다.

## 7. 웹과 앱의 업데이트 운영

- 웹 UI/계산 변경: 현재 웹 배포 방식으로 배포하되, 이미 설치된 iOS/Android 앱 모두에 영향을 준다. 두 앱에서 먼저 회귀 검증한다.
- 네이티브 권한/인증/새 브리지: 앱 바이너리 업데이트가 필요하다. 새 웹은 `getCapabilities()` 결과에 따라 없는 기능을 안전하게 비활성화한다.
- 배포 순서: 테스트 환경 → 구형/신형 앱 호환 검사 → 운영 웹/네이티브 배포 → 설치·복귀·저장 확인.
- 되돌리기: 직전 정상 웹 배포와 앱 산출물/커밋을 기록한다. 앱스토어 배포본을 모든 기기에서 즉시 되돌릴 수 있다고 가정하지 않는다. 데이터 포맷은 이전 화면이 읽을 수 있게 단계적으로 확장한다.
- 오류 기록: 앱 빌드 식별자·웹 커밋·OS·실패 단계만 기본 기록한다. 인증 토큰·예약 정보·개인 메모·사진 내용을 로그로 수집하지 않는다. 새 분석 서비스 도입은 별도 결정한다.

## 8. 사용자가 준비할 것 / 지금 가능한 것

| 지금 개발 측에서 가능한 일 | 사용자 준비가 필요한 일 |
| --- | --- |
| 기존 두 앱 정비·시뮬레이터 실행 | 개발자 계정 가입/결제/신원 확인 |
| 화면·저장·오프라인·권한 처리 보강 | 실제 iPhone/Android 테스트 협조 |
| 테스트 자동화·출시 자료 초안 | 앱 등록 계정 유형 및 배포 지역 결정 |
| 인증/서명 연동 코드·체크리스트 준비 | Apple 기능 설정 권한, Play 계정 조건 충족 |
| 별도 테스트 환경의 회귀 검증 | 조건에 해당하면 비공개 테스터 모집 |

권장 첫 실행 작업은 **단계 1: 기존 iOS·Android 앱을 최신 TripPlot 코드로 다시 빌드하고 같은 기능이 실행되는 기준 확보**다. 그 후 데이터 저장·사진·오프라인을 우선 안정화하고 출시 절차로 넘어간다.

## 9. 이번 계획 작성 검토

- 현재 플랫폼 코드의 존재와 출시 완료를 구분했다.
- 사용자 요청인 iPhone/Android 두 앱, Swift/Kotlin 방식, 비로그인 데이터 유지, 기존 기능 보존을 단계에 연결했다.
- 계정 결제 보류와 실제 계정/서명/스토어 검증 의존성을 구분했다.
- 위험한 데이터 삭제·기존 식별자 변경·불필요한 네이티브 전면 재개발을 범위에서 제외했다.
- 단계별 대상 파일·테스트·완료 기준과 공식 정책 출처를 포함했다.
- 앱 기능 코드는 이 문서 작성 과정에서 변경하지 않았다.
