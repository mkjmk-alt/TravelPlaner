# TripPlot

여행 일정, 지도, 예약 정보, 체크리스트, 예산과 지출을 한곳에서 관리하는 여행 플래너입니다. 서비스 브랜드는 `TripPlot`입니다.

## 프로젝트 구성

- `src/`: React + Vite 웹앱
- `functions/`: Cloudflare Pages Functions 런타임 설정 API
- `ios/`: 기존 SwiftUI + `WKWebView` 앱과 별도 SwiftUI 네이티브 미리보기
- `android/`: 기존 Kotlin + `WebView` 앱과 별도 Compose 네이티브 미리보기
- `apps/mobile/`: 기존 Expo 실험 프로젝트(참고용, 네이티브 앱과 별도)

운영 웹 주소는 <https://travelplaner-545.pages.dev/>입니다. 기존 앱(`com.travelplaner.app`)은 동일한 주소를 영구 WebView 저장소로 엽니다. 아래의 새 네이티브 미리보기는 웹을 열지 않고 기기 내 SQLite에 저장하며, 기존 앱과 별도로 설치됩니다.

## 웹 본문 없는 네이티브 미리보기

- 앱 표시 이름: `TripPlot Native`; iOS·Android 식별자: `com.travelplaner.app.nativepreview`.
- iOS: `ios/NativePreview`의 SwiftUI 화면과 `ios/NativeCore`의 Core Data(SQLite).
- Android: `android/nativepreview`의 Compose 화면과 Room(SQLite).
- 현재 범위: 내 여행·지도·저장·지출·더보기 5개 네이티브 탭, 여행 생성·목록·상세·정보 편집, 로그인 없는 로컬 저장 및 재실행 복원. 여행 상세에서 일차·예비 목록의 장소 직접 입력, 시간·메모 편집, 순서/일차 이동, 시간순 정렬과 삭제 확인을 제공합니다.
- 더보기와 여행 상세에서 단일 여행 JSON 백업을 가져오고 내보낼 수 있습니다. 가져오기 전 미리보기·중복 방지·별도 복사 확인을 거치며 기존 여행을 자동 덮어쓰지 않습니다. 최대 20 MiB, 장소 10,000개, 여행 100일까지 지원합니다.
- 저장 탭에서 직접 장소 등록·검색·상세·일정 복사·삭제 확인을 제공합니다. 일정·지도는 손잡이로 자유롭게 나누고 전체 화면/분할 복원을 할 수 있습니다. Google 지도·검색에는 별도 제한된 네이티브 키가 필요하며, 실제 연동 검증은 아직 완료되지 않았습니다.
- 지출·정산, 계정 동기화와 기존 앱 데이터의 자동 이전은 후속 단계입니다. 사용자가 선택한 JSON 파일로만 여행을 이전합니다. 전역 저장 장소는 단일 여행 백업에 포함되지 않습니다.
- 기존 운영 앱/웹의 여행을 자동으로 읽거나 변경하지 않습니다. 미리보기 앱을 삭제하거나 앱 데이터를 지우면 미리보기 여행도 사라질 수 있으므로 실제 중요 여행의 유일한 보관본으로 사용하지 마세요.

iOS에서는 `ios/TravelPlaner.xcodeproj`의 **TripPlotNativePreview** 스킴을 선택합니다.

```bash
swift test --package-path ios/NativeCore
cd ios
xcodegen generate
xcodebuild -project TravelPlaner.xcodeproj -scheme TripPlotNativePreview \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData/NativePreview CODE_SIGNING_ALLOWED=NO build
```

Android에서는 **nativepreview** 모듈을 실행합니다.

```bash
cd android
./gradlew :nativepreview:testDebugUnitTest :nativepreview:assembleDebug :nativepreview:lintDebug
./gradlew :nativepreview:installDebug
```

APK: `android/nativepreview/build/outputs/apk/debug/nativepreview-debug.apk`.
환경별 실행 및 검증 범위는 [네이티브 기반 검증 기록](docs/native-foundation-verification.md)을 참고하세요.
일정·백업의 사용법과 검증 범위는 [2단계 검증 기록](docs/native-itinerary-transfer-verification.md)에 정리합니다.
지도·저장·자유 분할 및 로컬 키 설정과 미검증 항목은 [3단계 검증 기록](docs/native-maps-saved-split-verification.md)을 참고하세요. 새 Google 검색 장소는 직접 입력한 정보와 placeID만 백업하며, 현재 웹에서 그 참조의 위치 자동 복원은 지원하지 않습니다.

공유 일정은 브라우저에서 Supabase 테이블에 직접 접근하지 않고 같은 원본의 `/api/shared-trips` Pages Function을 사용합니다. 공유 URL의 UUID가 접근 권한 역할을 하며, 공동 편집 내용은 15초 간격으로 동기화됩니다. 서버 함수와 RLS 배포 순서는 [네이티브 앱 개발 및 출시 가이드](docs/native-app.md#공유-일정-api와-rls)에 정리되어 있습니다.

## 웹앱 실행

```bash
npm install
npm run dev
```

검증:

```bash
npm run lint
npm run build
```

## iOS 앱

요구 사항: Xcode 27 이상(iOS 26 SDK 포함), XcodeGen.

```bash
cd ios
xcodegen generate
open TravelPlaner.xcodeproj
```

시뮬레이터 빌드:

```bash
xcodebuild -project TravelPlaner.xcodeproj \
  -scheme TravelPlaner \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

## Android 앱

요구 사항: JDK 17, Android SDK 36.

```bash
cd android
./gradlew assembleDebug lint
```

생성 APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## 기존 WebView 앱의 네이티브 연동 기능

- 로그인 없는 여행 일정과 지출의 기기 내 영구 저장
- 로그인 시 기존 Supabase 동기화 유지
- 위치 권한과 현재 위치 표시
- JSON 백업, iCalendar, CSV, 통계 이미지 저장
- 파일 선택과 외부 지도·전화·메일 링크 처리
- iOS 뒤로가기 제스처와 Android 예측형 뒤로가기
- 오프라인 안내와 재시도
- `travelplaner://` 딥 링크

세부 설정은 [네이티브 앱 개발 및 출시 가이드](docs/native-app.md), 스토어 입력 자료와 업로드 절차는 [스토어 제출 준비서](docs/store-submission.md)를 참고하세요.
