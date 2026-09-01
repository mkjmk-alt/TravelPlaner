# TravelPlaner 스토어 자산

스토어 제출 전에 실제 네이티브 Release 빌드에서 촬영한 원본을 보관합니다. 로그인 정보, 이메일, 예약번호 등 실제 개인정보는 포함하지 않습니다.

## iOS 원본

| 기기 | 크기 | 파일 |
| --- | --- | --- |
| iPhone 17 Pro Max | 1320×2868 | `screenshots/ios/iphone-17-pro-max/01-home.png` |
| iPhone 17 Pro Max | 1320×2868 | `screenshots/ios/iphone-17-pro-max/02-itinerary.png` |
| iPhone 17 Pro Max | 1320×2868 | `screenshots/ios/iphone-17-pro-max/03-budget.png` |
| iPad Pro 13-inch (M5) | 2064×2752 | `screenshots/ios/ipad-pro-13/01-home.png` |

2026년 9월 2일 기준 운영 URL을 로드한 iOS 26.5 Release 시뮬레이터 빌드에서 상태 표시줄 시간을 9:41로 고정해 촬영했습니다.

## Android 원본

| 기기 | 크기 | 파일 |
| --- | --- | --- |
| Pixel 10 Pro XL, Android API 36 | 1344×2992 | `screenshots/android/pixel-10-pro-xl/01-home.png` |
| Pixel 10 Pro XL, Android API 36 | 1344×2992 | `screenshots/android/pixel-10-pro-xl/02-itinerary.png` |
| Pixel 10 Pro XL, Android API 36 | 1344×2992 | `screenshots/android/pixel-10-pro-xl/03-budget.png` |

Android 원본은 API 36 Google APIs ARM64 가상기기에 최신 디버그 APK를 설치하고 상태 표시줄 시간을 9:41로 고정해 촬영했습니다. 일정·예산 화면에는 제출용 샘플 여행만 사용했습니다.

## Google Play 그래픽

| 자산 | 크기 | 파일 |
| --- | --- | --- |
| 앱 아이콘 | 512×512 | `google-play/app-icon-512.png` |
| 기능 그래픽 | 1024×500 | `google-play/feature-graphic.png` |
| 기능 그래픽 편집 원본 | 1024×500 | `google-play/feature-graphic.svg` |

기능 그래픽은 TravelPlaner의 파란색·보라색 테마와 위치 핀·경로 아이콘을 사용하며 개인정보나 기기 화면을 포함하지 않습니다.

## 바로 업로드할 파일

알파 채널이 포함된 원본 PNG는 보관용이며, 스토어 업로드에는 알파 채널이 없는 고품질 JPEG 사본을 우선 사용합니다.

- App Store iPhone: `uploads/apple/iphone-17-pro-max/`
- App Store iPad: `uploads/apple/ipad-pro-13/`
- Google Play 휴대전화: `uploads/google-play/screenshots/`
- Google Play 기능 그래픽: `uploads/google-play/feature-graphic.jpg`
- Google Play 앱 아이콘: `google-play/app-icon-512.png`

## 제출 전 확인

- 스토어 레코드의 실제 지원 기기와 요구 크기에 맞는지 업로드 화면에서 최종 확인
- 테스트용 여행 이름과 금액만 사용하고 실제 개인정보가 없는지 확인
- 앱 버전 또는 주요 UI가 바뀌면 같은 경로의 원본을 다시 촬영
- Android와 iOS 화면에서 글자 잘림, 키보드, 권한 팝업 또는 개발 도구 표시가 없는지 확인
