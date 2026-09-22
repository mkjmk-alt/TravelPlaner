# TripPlot 네이티브 기반 구현·검증 기록

요청 ID: `Afv7A5tR7d`, 후속 진행 ID: `4KU7O4EC0R` · 2026-09-20

## 구현 범위

이번 작업은 [전환 설계](superpowers/specs/2026-09-20-tripplot-native-ui-design.md)의 **단계 1**이다. 전체 웹 기능의 네이티브 이식 완료나 스토어 출시를 의미하지 않는다.

| 구분 | iOS | Android |
| --- | --- | --- |
| 진입점 | SwiftUI `TripPlotNativePreview` 스킴 | Compose `:nativepreview` 모듈 |
| 앱 식별자 | `com.travelplaner.app.nativepreview` | `com.travelplaner.app.nativepreview` |
| 표시 이름 | TripPlot Native | TripPlot Native |
| 저장소 | Core Data의 SQLite | Room의 SQLite |
| 지원 하한 | iOS 16 | Android 8/API 26 |
| 화면 | 네이티브 5개 탭, 여행 생성·목록·상세·편집 | 네이티브 5개 탭, 여행 생성·목록·상세·편집 |

기존 앱 식별자 `com.travelplaner.app`, 웹 소스의 미커밋 오류 수정, 운영 서버·계정 데이터는 유지했다. 두 미리보기는 기존 파스텔 아이콘 자산을 재사용한다. 앱 이름으로 기존 앱과 구분한다. 새 본문에는 WebView가 없다.

## 데이터 정책

- 저장 버튼을 눌러 로컬 DB 기록에 성공한 여행을 화면에 반영한다. 로그인·서버 응답을 요구하지 않는다.
- 날짜는 시간대와 무관한 `YYYY-MM-DD` 값이다. 공백 이름, 실제로 없는 날짜, 종료일 역전, 시작일 포함 100일 초과를 거절한다.
- `contracts/native/fixtures/trip.json`을 두 플랫폼 테스트에서 직접 사용한다. 일정, 예비 목록, 지출, 정산 인원 및 아직 해석하지 않는 확장 필드를 편집 시 보존한다.
- 기간 축소로 제외되는 일차에 장소 또는 알 수 없는 메타데이터가 있으면 축소를 거절한다.
- 읽기 오류를 빈 목록으로 바꾸거나 DB를 삭제해 재생성하지 않는다. 실패 시 재시도 안내를 표시한다.
- 마지막 탭/여행 상세는 별도 로컬 환경설정으로 복원한다. Android 작성 중 폼은 탭 이동 및 Activity 재생성 시 유지한다. iOS 폼의 취소는 작성 내용을 버리는 동작이며, 저장하지 않은 폼의 프로세스 종료 후 복원은 아직 제공하지 않는다.
- 웹 브라우저와 기존 WebView 앱의 데이터는 자동 이전하지 않는다. 이번 DB는 서버와 동기화하지 않으며 백업 UI도 아직 없다.

## 검증 방법

### iOS

```bash
swift test --package-path ios/NativeCore
cd ios
xcodegen generate
xcodebuild -project TravelPlaner.xcodeproj -scheme TripPlotNativePreview \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=427E8A95-1677-4442-98D4-17A1041396E5' \
  -derivedDataPath DerivedData/NativePreview -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test -quiet
```

실행 기기: iPhone 18 Pro Max / iOS 27 Simulator. 앱의 최소 지원은 iOS 16을 유지하며, Xcode 27 XCTest 런타임 제약으로 UI 테스트 타깃만 iOS 17 이상이다.

### Android

```bash
cd android
./gradlew :nativepreview:testDebugUnitTest :nativepreview:assembleDebug \
  :nativepreview:lintDebug :nativepreview:connectedDebugAndroidTest :app:assembleDebug
```

실행 기기: `TravelPlaner_API_36`, Android 16/API 36 ARM64 emulator. 테스트는 미리보기 앱과 UUID로 만든 테스트 DB만 사용한다. 기존 앱 데이터 초기화·삭제는 하지 않는다.

## 검증 결과

- iOS `swift test`: 도메인 9개 + 실제 Core Data 저장소 2개 = **11개 통과**.
- iOS 시뮬레이터 빌드 및 XCUI 테스트: **1개 통과**. 생성→앱 종료→재실행→편집→재실행과 5개 탭, WebView 부재를 확인했다. 결과 번들: `ios/DerivedData/NativePreview/Logs/Test/Test-TripPlotNativePreview-2026.09.20_07-40-03-+0900.xcresult`.
- Android JVM: 도메인 9개 + ViewModel 실패/복원 4개 = **13개 통과**.
- Android emulator instrumentation: Compose UI 2개 + 실제 Room 저장/롤백/손상/재시도 4개 = **6개 통과**, 실패·건너뜀 없음. Activity 재생성과 DB 재열기를 각각 검증했다.
- Android 미리보기 `assembleDebug`, `lintDebug`, `installDebug`, 기존 `:app:assembleDebug` 성공. 최종 lint는 **오류 0개, 경고 30개**다. 경고는 목표 SDK/라이브러리 업데이트 권고, 재사용한 기존 리소스의 미사용 및 KTX 권고 등이며 이번에 의존성을 일괄 업그레이드하지 않았다.
- `npm test`: **81개 통과**. `npm run native:security` 통과. 기존 웹 회귀 테스트와 운영 앱 보안 설정 검사이며, 새 네이티브 본문의 전체 보안 심사를 의미하지 않는다.
- 설치된 Android 미리보기의 요청 권한에 `INTERNET`이 없는 것을 확인했다. 네트워크 없이 로컬 데이터로 동작하며 웹 본문을 불러오지 않는다.
- Android 최종 설치 후 UI로 여행을 생성하고 `am force-stop`으로 앱 프로세스를 종료했다. 새 프로세스로 다시 실행했을 때 저장 직전과 같은 여행 제목의 상세 화면이 복원됨을 UI hierarchy로 확인했다. CLI 빠른 입력 후 키보드 닫기에서 테스트 이름 일부가 입력되지 않아 최초 전체 문자열 검사는 실패했다. 저장 직전 실제 폼/상세에 나타난 이름과 재실행 후 이름을 비교하는 저장 검증은 통과했다. 정식 Compose 생성/편집 테스트는 지정한 전체 이름을 검증한다.
- 실행 화면: `/tmp/tripplot-native-ios.png`, `/tmp/tripplot-native-android.png`. Android emulator는 창 모드로 실행 중이다. iOS CoreSimulator 안의 앱 실행·스크린샷은 정상이나 현재 Xcode 설치에 `Contents/Developer/Applications/Simulator.app`이 없어 `open -a Simulator`는 실패했다. GUI 창이 열렸다고 간주하지 않는다.

## 검증 중 발견해 수정한 사항

- iOS의 마지막 여행 복원에 `SceneStorage`만 사용했을 때 앱 프로세스 종료 후 상세 화면이 복원되지 않았다. UI 테스트 실패를 재현한 뒤 `AppStorage`로 변경했고 동일한 생성→종료→재실행→편집→재실행 테스트를 통과했다.
- Android API 26에서 사용할 수 없는 `windowLightNavigationBar` 테마 항목을 제거했다. 시스템 바 처리는 기존 `enableEdgeToEdge()` 경로를 사용한다.
- Android UI 테스트의 사용하지 않는 Espresso import로 인한 컴파일 실패를 제거했다.

## 남은 범위 및 제한

- 지도 SDK, 장소 검색·저장, 일차별 장소 편집, 지출·정산, 사진·여행 기록, 파일 공유, 계정·공유 여행·동기화는 다음 단계다. 해당 탭은 완료 기능으로 표시하지 않는다.
- 다음 단계는 일정·예비 목록 편집과 JSON 백업 가져오기/내보내기 및 기존 데이터 이전이다. 실제 이전 시 원본 보존·미리보기·트랜잭션·재읽기 비교·중복 방지를 검증해야 한다.
- 실물 iPhone/Android, 모든 지원 OS, 태블릿 전체 조합, 스토어 서명·업로드는 아직 검증하지 않았다. 유료 개발자 계정 결제는 진행하지 않았다.
- 키보드 사용·스크롤·Activity 재생성은 테스트에 포함했다. 실제 화면 회전 및 모든 접근성 글자 크기 조합은 추가 검증이 필요하다.
- 독립 검토용 보조 작업이 사용량 제한으로 중단돼 마지막 검토는 주 작업자가 직접 수행했다. 독립 검토가 완료됐다고 간주하지 않는다.
- 이번 요청에서는 커밋·깃 푸시·운영 배포를 진행하지 않는다.
