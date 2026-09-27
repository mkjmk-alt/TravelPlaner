# 모바일 하단 메뉴 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user requested no subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일·세로 태블릿의 지도 탭을 없애고 `내 여행`, `저장`, `예산·지출`, `여행 기록`, `더보기` 5개 하단 탭으로 전환하며 기존 데스크톱 탐색과 여행 데이터를 보존한다.

**Architecture:** 내비게이션 모델이 새 루트와 구형 저장 상태 이전을 담당하고, `App.jsx`가 루트별 화면·여행 선택 빈 상태·기록에서 장소를 여는 흐름을 연결한다. 하단 바의 5열 배치와 좁은 폭/안전 영역 처리는 기존 CSS 반응형 패턴에 맞춰 조정한다. 예산과 지출은 기존 통합 화면을 재사용하며 데이터 구조와 저장소는 바꾸지 않는다.

**Tech Stack:** React 19, Vite, CSS, Node.js built-in test runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-09-27-mobile-bottom-navigation-design.md`

## Global Constraints

- 모바일 및 세로 태블릿 탭 순서는 `내 여행`, `저장`, `예산·지출`, `여행 기록`, `더보기`다.
- 별도 지도 탭은 없으며 지도는 `내 여행`의 지도·일정 분할 화면에 유지한다.
- `예산·지출`은 기존 예산·지출·현금 정산·함께 정산 화면을 한 탭으로 유지한다.
- 넓은 데스크톱의 기존 사이드바와 여행별 바로가기 동작은 유지한다.
- 여행 데이터 구조, 저장소, 지도 검색/마커 동작, 네이티브 앱, 서버, 인증은 변경하지 않는다.
- 새 런타임 의존성을 추가하지 않는다.
- 기존 네이티브 iOS/Android 변경사항은 이 계획의 대상이 아니며 작업 중 보존한다.

## Review Focus

- 삭제되었거나 유효하지 않은 `activeTripId`는 모든 새 루트에서 `null`로 정리하고 여행 전용 화면은 빈 상태를 보여야 한다. Task 1의 정규화 테스트와 Task 2의 여행 미선택 화면 테스트로 확인한다.
- 구형 `map`, `trips + budget`, `trips + memory` 저장 상태 및 브라우저 이력은 여행 ID와 화면 문맥을 잃지 않고 새 루트로 이전해야 한다. Task 1의 local state/history 마이그레이션 테스트로 확인한다.
- 데스크톱의 기존 예산·기록 바로가기는 계속 `trips` 루트 문맥을 사용해야 한다. Task 2의 데스크톱/모바일 라우팅 회귀 테스트로 확인한다.
- 기록의 장소를 열 때 유효한 좌표가 지도·일정 분할 화면에서 선택되어야 하고 잘못된 좌표는 화면 전환을 일으키면 안 된다. Task 2의 콜백 계약 테스트로 확인한다.
- 320px 폭과 하단 안전 영역에서도 다섯 탭이 읽히고 눌려야 하며 지도 없는 모바일 탭에서는 검색창이 숨겨져야 한다. Task 3의 반응형 검증으로 확인한다.

---

### Task 1: 모바일 내비게이션 모델과 구형 상태 이전

**Files:**
- Modify: `src/mobileSidebar.js`
- Modify: `src/appNavigation.js`
- Test: `tests/mobile-sidebar.test.mjs`
- Test: `tests/app-navigation.test.mjs`

**Interfaces:**
- Produces `ROOT_TABS = ['trips', 'favorites', 'budget', 'memory', 'more']`와 다섯 루트에 대한 기본 snapshot을 제공한다.
- `getBottomNavigationItems() -> Array<{ key: string, label: string }>`는 순서가 고정된 5개 항목을 반환한다.
- `getBottomNavigationSelection(key) -> { rootTab, viewMode, showSidebar }`는 `trips`, `favorites`, `budget`, `memory`, `more`를 각자 같은 이름의 루트/기본 화면에 연결한다. 알 수 없는 키는 `trips`로 안전하게 대체한다.
- `getTripRequiredPresentation(viewMode) -> { title, message, actionLabel } | null`은 여행 선택이 필요한 `budget`/`memory`일 때만 빈 상태 콘텐츠를 반환한다. Task 2가 이를 사용한다.
- `normalizeNavigationState(state, availableTripIds)`는 반환 상태에서 `map` 루트/스냅샷을 제거하고, 구형 상태를 새 루트 집합으로 정규화한다.

- [ ] **Step 1: 실패하는 새 메뉴 및 선택 테스트 작성**

`tests/mobile-sidebar.test.mjs`에서 기존 4개 탭 테스트를 다음 정확한 순서와 값으로 교체한다.

```js
[
  { key: 'trips', label: '내 여행' },
  { key: 'favorites', label: '저장' },
  { key: 'budget', label: '예산·지출' },
  { key: 'memory', label: '여행 기록' },
  { key: 'more', label: '더보기' }
]
```

각 새 키가 동일한 `rootTab`/`viewMode`와 `showSidebar: true`를 반환하고 `map`과 알 수 없는 키가 `trips`로 대체되는 테스트를 추가한다.

- [ ] **Step 2: 메뉴 테스트를 실행해 실패 확인**

Run: `node --test tests/mobile-sidebar.test.mjs`
Expected: 기존 4개 항목과 새 라우팅 기대값이 현재 구현과 달라 실패한다.

- [ ] **Step 3: 실패하는 상태 정규화·이력 테스트 작성**

`tests/app-navigation.test.mjs`에서 기본 snapshot이 새 5개 루트만 포함하는지 확인한다. 아래 케이스를 각각 추가한다.

1. 구형 `{rootTab:'map', viewMode:'trips', activeTripId:'trip-1'}`는 `trips/trips`로 이전하고 유효한 `trip-1`을 유지한다.
2. 구형 루트 `trips`의 `budget`/`memory` 화면은 각 새 최상위 루트로 승격하며, 구형 `trips` snapshot은 `trips/trips`로 정리한다.
3. 구형 `map` snapshot 및 구형 `trips`의 budget/memory snapshot은 대응하는 새 snapshot으로 옮기고 유효하지 않은 여행 ID만 비운다.
4. 새 루트 5개를 browser history로 round-trip하며 구형 map history도 정규화한다.
5. `getMobileRootPresentation`은 `trips + trips/itinerary`에서만 지도·콘텐츠 split을 반환하고 `favorites/budget/memory/more`는 콘텐츠 전용으로 반환한다.
6. `getTripRequiredPresentation('budget')`와 `('memory')`는 각 메뉴 제목, 여행이 필요한 안내, `내 여행으로 이동` 문구를 반환하며 다른 모드에는 `null`을 반환한다.

- [ ] **Step 4: 내비게이션 테스트를 실행해 실패 확인**

Run: `node --test tests/app-navigation.test.mjs`
Expected: 새 export와 루트/이전 규칙이 아직 구현되지 않아 실패한다.

- [ ] **Step 5: 내비게이션 모델과 마이그레이션 구현**

`src/mobileSidebar.js`에서 `BOTTOM_NAVIGATION_ITEMS`를 다섯 항목으로 바꾸고 선택 함수를 갱신한다. `src/appNavigation.js`에서 `ROOT_TABS`, 기본 화면/snapshot을 새 루트로 갱신하고 정규화 과정에서 구형 상태를 먼저 이전한 후 유효한 trip ID를 검증한다. 구형 `rootTab:'map'`은 trips 기본 split으로, 구형 trips의 budget/memory 루트 화면은 해당 새 루트로 옮긴다. `getTripRequiredPresentation`을 이 파일에서 export한다.

- [ ] **Step 6: 관련 테스트를 실행해 통과 확인**

Run: `node --test tests/mobile-sidebar.test.mjs tests/app-navigation.test.mjs`
Expected: 모든 신규 메뉴, 마이그레이션, history, map presentation, empty-state 문구 테스트 PASS.

- [ ] **Step 7: 이 작업만 커밋**

```bash
git add src/mobileSidebar.js src/appNavigation.js tests/mobile-sidebar.test.mjs tests/app-navigation.test.mjs
git commit -m "feat: define mobile bottom navigation routes"
```

### Task 2: 화면 전환·여행 미선택 상태·기존 동작 연결

**Files:**
- Create: `src/TripRequiredEmptyState.jsx`
- Modify: `src/App.jsx`
- Create: `tests/trip-required-empty-state.test.mjs`
- Modify: `tests/navigation-callbacks.test.mjs`
- Modify: `tests/travel-memory-panel.test.mjs`

**Interfaces:**
- Consumes Task 1의 `getTripRequiredPresentation(viewMode)`와 새 루트/snapshot 스키마.
- Produces `TripRequiredEmptyState({ viewMode, onGoToTrips })`, 콘텐츠 안내와 `내 여행으로 이동` 버튼을 렌더링한다.
- 모바일의 `openBudget`/`openTravelMemory`는 각각 `budget`/`memory` 루트로 이동한다. 넓은 화면에서는 기존 `trips` 루트 바로가기 동작을 유지한다.
- `openMemoryPlace(place)`는 좌표를 검증하고, 모바일에서는 `trips` split을 열어 해당 장소를 선택한다. `map` 루트를 만들지 않는다.

- [ ] **Step 1: 실패하는 여행 미선택 상태 테스트 작성**

`tests/trip-required-empty-state.test.mjs`는 `getTripRequiredPresentation`의 두 메뉴 결과를 검증하고 component source에 메뉴 제목, 안내 메시지, `onClick={onGoToTrips}`, 접근 가능한 button이 연결되어 있는지 검사한다. `tests/app-navigation.test.mjs`의 순수 helper 결과를 이용해 텍스트를 중복 정의하지 않는다.

- [ ] **Step 2: empty-state 테스트를 실행해 실패 확인**

Run: `node --test tests/trip-required-empty-state.test.mjs`
Expected: `TripRequiredEmptyState.jsx`가 아직 없어 실패한다.

- [ ] **Step 3: 실패하는 App 라우팅 회귀 테스트 작성**

`tests/navigation-callbacks.test.mjs`에 다음을 검증하는 계약을 추가한다: mobile budget/memory 최상위 루트, desktop의 기존 trips 하위 화면 유지, `openMemoryPlace`의 mobile 목적지가 trips split인 점, 잘못된 좌표 early return, 예산/기록 루트의 context-back bar 제외, mobile more에서 budget/memory 중복 shortcut 제외. map 검색은 Task 1의 map-visible 규칙을 그대로 사용한다.

- [ ] **Step 4: App 회귀 테스트를 실행해 실패 확인**

Run: `node --test tests/navigation-callbacks.test.mjs`
Expected: 현재 `map`/`trips` 기반 화면 전환 및 중복 바로가기 때문에 신규 계약 테스트가 실패한다.

- [ ] **Step 5: 공용 여행 미선택 컴포넌트와 화면 연결 구현**

`src/TripRequiredEmptyState.jsx`는 Task 1의 presentation helper를 사용해 안내 카드와 `onGoToTrips` button을 렌더링한다. `src/App.jsx`에서 budget은 `activeTrip`이 있을 때만 기존 전체 예산·지출 화면을 그리고, 없으면 공용 빈 상태를 렌더링한다. memory도 여행 선택 시 `TravelMemoryPanel`, 미선택 시 같은 빈 상태를 보여준다. CTA는 `handleBottomNavigationSelect('trips')`로 연결한다.

`openBudget`와 `openTravelMemory`는 `isBottomNavigationViewport`일 때 각각 최상위 budget/memory 루트와 snapshot을 설정하고, 그 외에는 기존 데스크톱 trips 루트·viewMode 동작을 유지한다. 여행 ID는 탭 간 이동에서 유지하되 삭제/무효 ID는 정규화 결과에 맡긴다.

- [ ] **Step 6: 지도 장소 선택과 모바일 더보기 동작 구현**

`openMemoryPlace`는 기존 finite lat/lng 검사를 보존한다. 모바일에서는 `selectedPlace`를 설정하고 `trips/trips` split을 열며 사이드바/일정 영역을 표시한다. 지도 이동 및 줌 동작은 그대로 둔다. 모바일 `budget`/`memory`는 하위 화면이 아니므로 context back bar를 `itinerary` 전용으로 제한한다. `more`에서는 모바일 중복 budget/memory rows를 숨기고 일정, 계정, 백업/복원, 지원 등은 유지한다. 데스크톱 바로가기와 메뉴는 그대로 둔다.

- [ ] **Step 7: 메뉴 아이콘과 접근성 상태 연결**

하단 메뉴 렌더링에 `Wallet`을 `budget`, `FileText`를 `memory`에 연결한다. 다섯 버튼 각각에 현재 메뉴의 `aria-current="page"`만 설정하고 기존 키보드 포커스 및 즐겨찾기 아이콘 상태를 보존한다.

- [ ] **Step 8: 집중 테스트를 실행해 통과 확인**

Run: `node --test tests/trip-required-empty-state.test.mjs tests/navigation-callbacks.test.mjs tests/travel-memory-panel.test.mjs tests/mobile-sidebar.test.mjs tests/app-navigation.test.mjs`
Expected: 여행 미선택 CTA, desktop/mobile 분기, 지도 포커스, 기록 패널 기존 계약 및 내비게이션 테스트 모두 PASS.

- [ ] **Step 9: 이 작업만 커밋**

```bash
git add src/TripRequiredEmptyState.jsx src/App.jsx tests/trip-required-empty-state.test.mjs tests/navigation-callbacks.test.mjs tests/travel-memory-panel.test.mjs
git commit -m "feat: connect budget and memory mobile destinations"
```

### Task 3: 5열 모바일 레이아웃과 전체 검증

**Files:**
- Modify: `src/index.css`
- Test: `tests/mobile-sidebar.test.mjs`
- Test: `tests/app-navigation.test.mjs`

**Interfaces:**
- Consumes Task 1의 고정된 탭 순서와 Task 2의 다섯 버튼/접근성 상태.
- Produces 같은 크기의 5개 nav column, 좁은 화면 레이블 규칙, 기존 safe-area 및 48px 최소 터치 높이.

- [ ] **Step 1: 실패하는 responsive contract 테스트 작성**

`tests/mobile-sidebar.test.mjs`에 CSS contract 검사를 추가해 모바일 navigation이 5열이고 각 버튼의 최소 높이 48px 및 `env(safe-area-inset-bottom)`을 유지하는지 확인한다. `tests/app-navigation.test.mjs`의 검색 노출 테스트는 trips split에서 보이고 budget/memory/favorites/more에서 숨는 조건을 포함하도록 확장한다.

- [ ] **Step 2: 관련 테스트를 실행해 실패 확인**

Run: `node --test tests/mobile-sidebar.test.mjs tests/app-navigation.test.mjs`
Expected: 현재 4열 및 budget/memory 조건 미검증으로 신규 기대값이 실패한다.

- [ ] **Step 3: CSS 5열·좁은 폭·안전 영역 구현**

`src/index.css`에서 mobile nav를 `repeat(5, minmax(0, 1fr))`로 바꾼다. 기본 좌우 여백/간격을 좁히고, 380px 이하에서 짧은 `예산·지출` 레이블이 잘리지 않도록 글자 크기와 padding을 낮춘다(레이블은 줄바꿈하거나 가로 스크롤로 바꾸지 않는다). 최소 button height 48px, 기존 safe-area 하단 padding, desktop의 1025px 숨김 규칙을 유지한다. map 전용 루트가 제거되므로 `.mobile-map-root`의 사이드바 숨김/지도 전체 높이 규칙도 제거한다.

- [ ] **Step 4: 집중 테스트와 프로젝트 검증 실행**

Run: `node --test tests/mobile-sidebar.test.mjs tests/app-navigation.test.mjs`
Expected: 메뉴, 뷰포트, 검색 조건 모두 PASS.

Run: `npm test`
Expected: 전체 Node 테스트 suite PASS.

Run: `npm run lint`
Expected: ESLint 오류 없음.

Run: `npm run build`
Expected: Vite production build 성공.

- [ ] **Step 5: 화면 폭별 수동 검증**

로컬 웹앱에서 320px, 375px, 768px 세로 viewport와 1025px 이상 데스크톱을 확인한다. 5개 label/아이콘/선택 표시와 safe-area, 데스크톱 사이드바 유지, trips split의 지도·검색창, 비지도 메뉴의 검색창 숨김, 더보기 항목, 여행 미선택 빈 상태/CTA, 기록에서 지도 장소 열기를 확인한다. 지도 API 키가 없는 경우에도 지도 이외 메뉴가 정상 렌더링되는지 확인한다.

- [ ] **Step 6: 이 작업만 커밋**

```bash
git add src/index.css tests/mobile-sidebar.test.mjs tests/app-navigation.test.mjs
git commit -m "style: fit five mobile destinations safely"
```

- [ ] **Step 7: 최종 diff가 범위 안인지 확인**

Run: `git status --short` and `git diff --stat HEAD~3..HEAD`
Expected: 이 계획의 웹 파일만 각 커밋에 포함되고, 이미 작업 중인 Android/iOS 파일은 staged/committed 되지 않은 상태로 보존된다.
