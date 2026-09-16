# Travel Mapmory 콘텐츠 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 TripPlot에 Travel Mapmory의 여행 정보·사진 기록 흐름을 통합하되, 방문 국가 색칠·음성 메모·예약 링크는 제외한다.

**Architecture:** 기존 `trip` 객체를 확장하고, 여행 기록 UI를 독립 React 컴포넌트로 분리한다. App은 기존 저장·동기화 함수와 새 컴포넌트를 연결하며, 지도·장소·일정·경비 화면은 그대로 유지한다.

**Tech Stack:** React 19, Vite, JavaScript, CSS, Node test runner, localStorage, Supabase payload sync.

**Spec:** `docs/superpowers/specs/2026-09-15-travelmapmory-content-design.md`

## Global Constraints

- 방문 국가 색칠·음성 메모·예약 링크는 구현하지 않는다.
- 기존 데스크톱 classic / 모바일·세로 태블릿 split responsive 정책을 유지한다.
- 기존 여행 데이터가 새 필드 없이 저장되어 있어도 정상 렌더링한다.
- 사진은 2.5MB 이하 data URL 1장으로 제한한다.
- 읽기 전용 공유 일정에서는 여행 기록을 수정할 수 없다.
- 모든 생산 코드 변경은 관련 failing test를 먼저 작성하고 실행한다.

---

### Task 1: 여행 기록 데이터 helper

**Files:**
- Create: `src/travelMemory.js`
- Create: `tests/travel-memory.test.mjs`

**Interfaces:**
- Produces `getDefaultTravelDetails()`
- Produces `getJournalEntries(trip)`
- Produces `getTravelDetails(trip)`
- Produces `getTripDurationLabel(trip)`
- Produces `getTripCountdownLabel(trip, today)`
- Produces `createJournalEntry({ date, title, body, imageDataUrl, now })`

- [ ] **Step 1: Write failing tests** for defaults, trip duration, countdown, and journal entry shape.
- [ ] **Step 2: Run `node --test tests/travel-memory.test.mjs`** and confirm the helper exports are missing.
- [ ] **Step 3: Implement only the helper functions** with safe defaults and date-only comparisons.
- [ ] **Step 4: Re-run the focused test and then `npm test`**.

### Task 2: 여행 기록 패널

**Files:**
- Create: `src/TravelMemoryPanel.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes `trip`, `readOnly`, `onUpdateTrip`, and `onOpenItinerary` props.
- Produces an accessible panel for travel summary, flight/stay details, and photo journal entries.

- [ ] **Step 1: Add the component test contract** in the helper test by asserting the data update callbacks used by the panel.
- [ ] **Step 2: Run the focused tests before writing the component.**
- [ ] **Step 3: Implement the panel** with controlled inputs, 2.5MB image validation, data URL preview, save/delete actions, and read-only gating.
- [ ] **Step 4: Add responsive CSS** using existing sidebar tokens and scroll behavior, without changing display-mode breakpoints.
- [ ] **Step 5: Run `npm run lint`** and fix only errors caused by this component.

### Task 3: App navigation and persistence integration

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/index.css`

**Interfaces:**
- `viewMode === 'memory'` renders `TravelMemoryPanel` for the active trip.
- `updateActiveTrip` remains the single write path for new travel details and journal entries.

- [ ] **Step 1: Add a failing source assertion** that App imports `TravelMemoryPanel`, exposes the `memory` view, and does not introduce deferred feature labels.
- [ ] **Step 2: Run the source assertion and confirm it fails.**
- [ ] **Step 3: Add the navigation button and render branch**, preserving existing tabs, split scrolling, and read-only behavior.
- [ ] **Step 4: Normalize new fields when trips are read from localStorage/cloud migration paths.**
- [ ] **Step 5: Add a direct `여행 기록` action to each trip card.**
- [ ] **Step 6: Run `npm test` and `npm run lint`**.

### Task 4: Build and regression verification

**Files:**
- Modify: `기록-history.md`

- [ ] **Step 1: Run `npm test`.**
- [ ] **Step 2: Run `npm run lint`.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Verify the saved data contract and confirm no code contains the deferred feature labels or controls.**
- [ ] **Step 5: Record the request, changes, verification, and fresh request ID in `기록-history.md`.**
