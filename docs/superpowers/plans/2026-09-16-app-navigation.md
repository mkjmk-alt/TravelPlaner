# TripPlot App Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 WebView 안의 TripPlot을 앱형 하단 내비게이션과 복원 가능한 화면 이동 구조로 정리한다.

**Architecture:** 순수 `appNavigation.js` helper가 최상위 탭·화면 상태와 history payload를 정규화한다. `App.jsx`는 기존 데이터 mutator를 유지하면서 helper를 통해 탭 스냅샷, localStorage 복원, `pushState`/`popstate`를 연결한다. 모바일·세로 태블릿에서는 지도와 일정만 분할하고 나머지는 콘텐츠 전체 화면으로 렌더링한다.

**Tech Stack:** React 19, Vite, JavaScript modules, CSS, Node test runner, localStorage, WebView history.

**Spec:** `docs/superpowers/specs/2026-09-16-app-navigation-design.md`

## Global Constraints

- 하단 메뉴 순서는 `내 여행·지도·저장·더보기`로 고정한다.
- 데스크톱 classic 사이드바와 기존 지도·여행 데이터 계약을 유지한다.
- 일정 화면에서만 모바일·세로 태블릿 지도/일정 분할을 사용한다.
- 읽기 전용 공유 여행과 인증 콜백은 로컬 화면 복원에서 제외한다.
- 생산 코드 변경 전 관련 failing test를 작성하고 실행한다.
- 이번 작업에서는 네이티브 Swift/Kotlin 화면을 새로 만들지 않고 기존 WebView 셸을 유지한다.

---

### Task 1: 내비게이션 상태 helper

**Files:**
- Create: `src/appNavigation.js`
- Create: `tests/app-navigation.test.mjs`

**Interfaces:**
- `getDefaultNavigationState()` returns the four-root-tab initial state.
- `normalizeNavigationState(state, availableTripIds)` removes invalid roots, views, and deleted trip IDs.
- `getTabSelection({ currentRootTab, key, tabSnapshots })` returns a restored or reset selection.
- `createNavigationHistoryState(state)` creates a `travelPlanerNavigation` history payload.
- `getNavigationStateFromHistory(historyState)` returns a valid app state or `null`.

- [ ] **Step 1: Write failing tests** for the default state, deleted active trip cleanup, restoring another tab, resetting the selected tab, and history payload parsing.

```js
test('restores a tab snapshot and resets the selected tab to its root', () => {
  const snapshots = {
    trips: { viewMode: 'itinerary', activeTripId: 'trip-1' },
    map: { viewMode: 'trips', activeTripId: 'trip-1' },
    favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
    more: { viewMode: 'more', activeTripId: 'trip-1' }
  };
  assert.deepEqual(getTabSelection({ currentRootTab: 'favorites', key: 'trips', tabSnapshots: snapshots }), {
    rootTab: 'trips', viewMode: 'itinerary', activeTripId: 'trip-1'
  });
  assert.deepEqual(getTabSelection({ currentRootTab: 'trips', key: 'trips', tabSnapshots: snapshots }), {
    rootTab: 'trips', viewMode: 'trips', activeTripId: 'trip-1'
  });
});
```

- [ ] **Step 2: Run `node --test tests/app-navigation.test.mjs`** and confirm it fails because the new module is not present.
- [ ] **Step 3: Implement the minimal pure helper** with fixed allowed roots/views and safe fallback to `trips`.
- [ ] **Step 4: Re-run the focused helper test and then `npm test`**.

### Task 2: 시작 상태·탭 스냅샷·브라우저 history 연결

**Files:**
- Modify: `src/App.jsx:1358-1425, 1600-1635, effects section near 1780-1940`
- Modify: `src/mobileSidebar.js`
- Test: `tests/app-navigation.test.mjs`

**Interfaces:**
- `App.jsx` persists `travelplaner_navigation_state_v1` with the helper’s state shape.
- Bottom menu selection restores the target snapshot and same-tab selection resets its root view.
- App `popstate` restores the state encoded by `createNavigationHistoryState`.

- [ ] **Step 1: Add a failing source assertion** that App imports the navigation helper, persists the navigation key, and registers `popstate`.
- [ ] **Step 2: Run the assertion and confirm it fails.**
- [ ] **Step 3: Add lazy initial state and tab snapshot state** using the saved navigation payload, while keeping the existing `viewMode`, `mobileRootTab`, and `activeTripId` setters available to existing handlers.
- [ ] **Step 4: Update `openItinerary`, `openBudget`, `openTravelMemory`, `openFavorites`, and `handleBottomNavigationSelect`** to update the correct snapshot and restore the target tab without changing the existing data mutators.
- [ ] **Step 5: Add an effect that normalizes deleted active trips and writes valid navigation state to localStorage.**
- [ ] **Step 6: Add one `replaceState` initialization, one `pushState` per app screen change, and a `popstate` listener that restores root/view/trip without adding a new state during back navigation.
- [ ] **Step 7: Run `node --test tests/app-navigation.test.mjs` and `npm test`**.

### Task 3: 메뉴별 화면 영역과 상세 이동

**Files:**
- Modify: `src/App.jsx:4470-4770, 4790-5120, 6180-6330`
- Modify: `src/index.css:247-360, 3618-3695`
- Test: `tests/app-navigation.test.mjs`

**Interfaces:**
- `mobileRootTab === 'map'` renders the map-only root.
- `viewMode === 'itinerary'` renders the optional split map/schedule view.
- Other root/content modes render a full content pane on split-capable mobile layouts.

- [ ] **Step 1: Add failing assertions** for the root-to-view matrix and the mobile context title contract.
- [ ] **Step 2: Run the assertions and confirm the existing source does not express the matrix.**
- [ ] **Step 3: Change the split grid row selection** so map root is map-only, itinerary is split, and trips/favorites/more/budget/memory are content-only.
- [ ] **Step 4: Add a mobile context bar** with current screen title and a back action to the relevant root; hide duplicated desktop top navigation controls only in mobile/portrait layouts.
- [ ] **Step 5: Route saved-place selection through the map root** so the saved list remains a list and location details open over the map.
- [ ] **Step 6: Keep the existing four bottom buttons fixed and reserve one safe-area-aware content bottom inset.**
- [ ] **Step 7: Run the focused test and inspect the rendered production build for the expected classes and labels.**

### Task 4: Entry and return edge cases

**Files:**
- Modify: `src/App.jsx:1840-1860, 2850-2950, 3295-3325, 7370-7510`
- Modify: `android/app/src/main/java/com/travelplaner/app/MainActivity.kt:135-160`
- Modify: `ios/TravelPlaner/TravelWebView.swift`
- Test: `tests/app-navigation.test.mjs`

**Interfaces:**
- Shared trip entry stays in itinerary and is never written as a local resume state.
- Creating/deleting a trip leaves the app in a valid root/view state.
- Native WebView back handling continues closing dialogs first and then follows the web app history.

- [ ] **Step 1: Add failing tests** for shared-entry exclusion and deleted active-trip fallback.
- [ ] **Step 2: Run the focused tests and verify they fail before the edge-case integration.**
- [ ] **Step 3: Normalize shared links, new-trip entry, and delete-trip fallback** through the same root/view transition helpers.
- [ ] **Step 4: Add native-only comments/guards where needed without changing the established WebView URL or dialog-first behavior.**
- [ ] **Step 5: Run the focused test and native security/store validation.**

### Task 5: Full verification and history

**Files:**
- Modify: `기록-history.md`

- [ ] **Step 1: Run `npm test`.**
- [ ] **Step 2: Run `npm run lint`.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Run `npm run native:security` and `npm run store:validate`.**
- [ ] **Step 5: Run `git diff --check` and inspect that the prior app-icon changes remain intact.**
- [ ] **Step 6: Record the request, implementation, verification, remaining deployment status, and fresh request ID in `기록-history.md`.**
