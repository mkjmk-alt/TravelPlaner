# TravelPlaner

여행 일정, 지도, 예약 정보, 체크리스트, 예산과 지출을 한곳에서 관리하는 여행 플래너입니다.

## 프로젝트 구성

- `src/`: React + Vite 웹앱
- `functions/`: Cloudflare Pages Functions 런타임 설정 API
- `ios/`: SwiftUI + `WKWebView` iOS 네이티브 앱
- `android/`: Kotlin + Android `WebView` 네이티브 앱
- `apps/mobile/`: 기존 Expo 실험 프로젝트(참고용, 네이티브 앱과 별도)

운영 웹 주소는 <https://travelplaner-545.pages.dev/>입니다. 네이티브 앱은 동일한 주소를 영구 WebView 저장소로 열기 때문에 로그인하지 않은 일정도 앱 종료 후 유지됩니다.

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

요구 사항: Xcode 16 이상, XcodeGen.

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

## 네이티브 기능

- 로그인 없는 여행 일정과 지출의 기기 내 영구 저장
- 로그인 시 기존 Supabase 동기화 유지
- 위치 권한과 현재 위치 표시
- JSON 백업, iCalendar, CSV, 통계 이미지 저장
- 파일 선택과 외부 지도·전화·메일 링크 처리
- iOS 뒤로가기 제스처와 Android 예측형 뒤로가기
- 오프라인 안내와 재시도
- `travelplaner://` 딥 링크

세부 설정과 출시 절차는 [네이티브 앱 개발 및 출시 가이드](docs/native-app.md)를 참고하세요.
