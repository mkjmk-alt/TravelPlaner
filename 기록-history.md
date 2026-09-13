# 작업 기록

## 2026-09-13

- ID: `K7m2Q9xR4a`
- 요청: 첨부된 모바일 화면에서 글씨가 커진 것처럼 보이는 원인을 확인하고 필요한 경우 조정.
- 확인 내용: 최근 커밋과 화면 관련 CSS/JS를 확인한 결과 최근 글꼴 확대 커밋은 없었으며, 일정 요약·예비 목록·장소 카드의 글꼴은 각각 코드에 지정된 크기로 렌더링되고 있음. 고해상도 모바일 캡처 배율과 모바일 텍스트 자동 조정 가능성을 함께 고려함.
- 제안: 전역 글꼴은 건드리지 않고 일정 화면의 요약/예비 목록/장소 카드 typography만 소폭 축소해 compact하게 조정한 뒤 빌드와 모바일 검증을 수행. 사용자 승인 대기.
- 답변: 원인 확인 결과와 안전한 수정 범위를 안내하고 적용 방향 승인을 요청함.

## 2026-09-13

- ID: `n4T8cQ2mZ7`
- 요청: 카드 안쪽의 `일차로 이동` 글자 크기를 조금 줄임.
- 수정 내용: 예비 장소 카드의 `일차로 이동` 선택 박스 글꼴 크기를 `11px`에서 `10px`로 변경함. 카드 크기와 다른 글꼴에는 영향을 주지 않음.
- 검증: `npm run build`, `npm run lint` 통과. 빌드 청크 크기 경고는 기존 번들 경고임.
- 답변: 수정 및 검증 결과를 안내함.

## 2026-09-13

- ID: `P6v3N8kQ1z`
- 요청: 최신 수정사항을 GitHub에 푸시하고 Cloudflare Pages에 배포.
- 수정 내용: 직전 글꼴 크기 조정과 작업 기록을 배포 대상에 포함하고, 기존 iOS 프로젝트 변경사항은 제외함.
- 답변: 빌드 후 GitHub 푸시 및 Cloudflare Pages 배포를 진행함.

## 2026-09-13

- ID: `H4p9L2sX7c`
- 요청: 일정 화면에서 위로 스크롤해도 내용이 올라가지 않는 현상 확인.
- 확인 내용: `.sidebar-list-content`는 `overflow-y: auto`이며 실제 콘텐츠 높이도 뷰포트보다 크고 Chromium 모바일 조건에서는 스크롤됨. 모바일 시트가 flex 컨테이너인 반면 해당 스크롤 자식에 `min-height: 0`과 명시적인 세로 `touch-action`이 없어 iOS Safari에서 스크롤 제스처가 막힐 가능성이 확인됨. 같은 저장소의 내부 스크롤 패널에는 `min-height: 0` 패턴이 적용되어 있음.
- 제안: `.sidebar-list-content`에 `min-height: 0`, `touch-action: pan-y`, `-webkit-overflow-scrolling: touch`, 세로 overscroll 격리를 추가하고, 시트 드래그용 핸들과 헤더 동작은 유지함. 사용자 승인 대기.
- 답변: 재현 결과와 원인 후보, 수정 방향을 안내하고 적용 승인을 요청할 예정.

## 2026-09-13

- ID: `R8z3M6pQ1v`
- 요청: 일정 화면의 스크롤 문제 수정.
- 수정 내용: `.sidebar-list-content`에 flex 자식 축소를 위한 `min-height: 0`, iOS 관성 스크롤, 세로 overscroll 격리, `touch-action: pan-y`를 추가함. 시트 드래그 핸들과 헤더 이벤트는 변경하지 않음.
- 검증: `npm run build`, `npm run lint`, `npm test -- --runInBand` 통과. 모바일 조건 운영 화면에서 `scrollHeight 4473px`, `overflow-y: auto`, `min-height: 0px`, `touch-action: pan-y`와 실제 터치 스크롤을 확인함. 로컬 프리뷰는 지도 API 키가 없어 앱 안내 화면까지만 렌더링됨.
- 답변: 승인된 방향으로 코드를 수정하고 검증 결과를 안내함.

## 2026-09-13

- ID: `T5q8L1zM6r`
- 요청: 현재 수정된 코드를 로컬에서 열어 확인.
- 수정 내용: 없음. 기존 로컬 미리보기 서버를 재사용해 최신 로컬 빌드를 열음.
- 답변: `http://127.0.0.1:4173/` 로컬 주소를 열고, 로컬 환경에 Google Maps API 키가 없어 지도 대신 설정 안내 화면이 표시될 수 있음을 안내함.

## 2026-09-13

- ID: `J8n4Vq2L6c`
- 요청: Google Maps API 키 오류가 있어도 지도 영역만 표시하지 않고 사이드바는 계속 표시할 수 있는지 확인.
- 확인 내용: `loadError` 또는 API 키 없음 상태에서 `App` 전체가 조기 반환되어 지도와 사이드바가 함께 사라지는 구조임.
- 제안: 앱 셸과 사이드바는 항상 렌더링하고, 지도 영역만 오류 안내 상태로 대체하며 지도 의존 버튼과 검색 기능은 오류 상태를 안내하도록 분리함. 사용자 승인 대기.
- 답변: 원인과 bounded 수정 방향을 안내하고 적용 승인을 요청함.

## 2026-09-13

- ID: `J8n4Vq2L6c`
- 요청: 승인된 지도 API 오류 격리 수정 구현.
- 수정 내용: `getMapAvailability` 순수 상태 판별 함수와 회귀 테스트를 추가하고, `App`의 지도 관련 조기 반환을 제거함. API 키 없음·지도 로딩 실패·로딩 중에는 지도 영역만 테마에 맞는 안내 화면으로 표시하고, 사이드바·일정·즐겨찾기·예산 UI는 유지함. 지도 컨트롤과 GoogleMap은 정상 로딩 상태에서만 렌더링함.
- 검증: `node --test tests/map-availability.test.mjs`, `npm run build`, `npm run lint`, `npm test -- --runInBand`, `git diff --check` 통과. 빌드의 대용량 청크 경고는 기존 번들 구조에 대한 경고이며 실패가 아님.
- 답변: 지도 API 오류가 있어도 사이드바가 표시되도록 수정 및 검증 결과를 안내함.

## 2026-09-13

- ID: `Q6r2Mz8Kp4`
- 요청: 첨부 영상처럼 지도와 일정 영역을 위·아래로 분할하고, 지도 또는 일정을 각각 전체 화면으로 확장할 수 있는지와 해당 UI 용어를 확인.
- 수정 내용: 없음. 현재 앱의 `collapsed / half / full` 모바일 시트 구조를 기준으로 용어와 구현 방향만 검토함.
- 답변: `resizable split view`, `map-list split view`, `draggable bottom sheet`, `snap points/detents`, `full-screen expand/collapse` 용어를 설명하고 구현 가능하다고 안내함.

## 2026-09-13

- ID: `B7k3Nq9L2x`
- 요청: 지도와 일정을 세로형 `resizable split view`로 구성하고 지도 전체·50:50·일정 전체의 3단계 `snap point`를 구현.
- 수정 내용: 모바일 시트의 스냅 좌표 계산을 `src/mobileSheet.js`로 분리하고, 지도 전체(하단 핸들만)·50:50·일정 전체(검색창 아래) 위치를 추가함. 드래그 중 패널 위치와 지도 영역 높이를 함께 갱신하고, 손을 놓으면 가장 가까운 스냅 위치로 이동하도록 `App`에 연결함. 기존 데스크톱 좌측 패널과 iOS 프로젝트 변경사항은 유지함.
- 검증: `node --test tests/mobile-sheet.test.mjs`, `npm run build`, `npm run lint`, `npm test -- --runInBand`, `git diff --check` 통과. 총 26개 테스트 통과. 빌드의 기존 대용량 청크 경고는 실패가 아님.
- 답변: 모바일 세로 분할 화면 구현 및 로컬 확인 주소를 안내함.

## 2026-09-13

- ID: `M4x8Q2nL7v`
- 요청: 지도·일정 세로형 분할 화면이 앱에서만 가능한지, 웹페이지에서도 가능한지 확인.
- 수정 내용: 없음. 웹 브라우저의 CSS·JavaScript 기반 구현 가능 범위와 네이티브 앱과의 차이를 설명함.
- 답변: 웹페이지에서도 구현 가능하며 현재 로컬 웹 버전에 이미 적용되어 있고, 브라우저 제스처·주소창·안전 영역 등 일부 환경 차이가 있음을 안내함.

## 2026-09-13

- ID: `C9v2Lk7Q4m`
- 요청: 현재 지도·일정 분할 화면 구현사항을 GitHub에 푸시하고 Cloudflare Pages에 배포.
- 수정 내용: 검증된 웹 소스·스타일·상태 계산 모듈·회귀 테스트·작업 기록만 커밋 대상으로 지정함. 기존 `ios/TravelPlaner.xcodeproj/project.pbxproj` 변경사항은 제외함.
- 검증: 푸시 전 `npm test -- --runInBand` 26개 통과, `npm run lint`, `npm run build`, `git diff --check` 통과. `origin/main`과 로컬 `main`의 선행 커밋 차이는 0/0으로 확인함.
- 답변: 관련 파일을 `a666f2d`로 커밋해 `origin/main`에 푸시하고 Cloudflare Pages에 배포함. 처음 지정한 Pages 프로젝트명 `travelplaner-545`는 존재하지 않아 실제 프로젝트명 `travelplaner`로 재시도함. 배포 URL은 `https://b77c3ac9.travelplaner-545.pages.dev`, 운영 주소와 배포 URL 모두 HTTP 200이며, Cloudflare 배포 목록에서 Production/main 및 소스 `a666f2d`로 확인함.

## 2026-09-13

- ID: `N2c7Rk4Vx9`
- 요청: 첨부한 동영상에 나타난 지도·콘텐츠 분할 화면의 기능을 전체적으로 설명.
- 수정 내용: 없음. 첨부 영상의 대표 화면을 확인하고, 지도·목록 동시 표시, 영역 확장, 드래그 분할, 스냅 상태의 기능 구조를 설명함.
- 답변: 영상의 기능을 `map–list split view`, `resizable split view`, `draggable bottom sheet`, `snap points`, `full-screen expand/collapse` 용어로 풀어 설명할 예정.
