# Responsive Display Modes and Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크톱과 태블릿 가로 화면에서는 1번 기본 UI를 사용하고, 모바일과 태블릿 세로 화면에서는 2번 스플릿 뷰를 자동으로 고정하며, 각 모드에 맞게 하단 영역을 정리한다.

**Architecture:** 화면 크기와 방향을 순수 함수로 판정해 `displayMode`를 뷰포트 상태에서 파생한다. 사용자가 1·2번 버튼을 눌러 모드를 바꾸는 방식은 제거하고, 회전·리사이즈 때 같은 판정 함수를 다시 적용한다. 2번 모드에서는 지도와 일정의 현재 분할 동작을 유지하면서 사이드바 전체를 스크롤하고, 하단에는 저장 상태만 고정하며 개수·법적 링크는 스크롤 마지막에 둔다.

**Tech Stack:** React 19, Vite, CSS Grid, Pointer Events, Node.js built-in test runner.

**Spec:** 이 대화의 사용자 요구사항이며, 실행 기록은 `기록-history.md`의 ID `R5mK8qL2Vx` 항목에 남긴다.

## Global Constraints

- 데스크톱 모드는 `DISPLAY_MODES.CLASSIC`을 사용한다.
- 모바일 및 태블릿 세로 모드는 `DISPLAY_MODES.SPLIT`을 사용한다.
- 태블릿 가로 모드는 데스크톱과 같은 `DISPLAY_MODES.CLASSIC`을 사용한다.
- 화면 모드는 localStorage나 사용자 선택으로 저장하지 않고 현재 뷰포트에서 자동 계산한다.
- 1번 기본 UI의 기존 bottom-sheet 스냅 동작은 변경하지 않는다.
- 2번 스플릿 뷰의 자유로운 분할선 드래그와 독립된 지도·일정 영역은 유지한다.
- 2번 모드에서 `닫기`와 `메뉴 열기`가 서로 충돌하지 않도록 수동 접기 경로를 제거한다.
- 기존 iOS·Android 네이티브 프로젝트와 기존 인증·저장 기능은 변경하지 않는다.

---

### Task 1: 뷰포트 기반 모드 및 하단 변형 판정 테스트 작성

**Files:**
- Modify: `tests/split-view.test.mjs`
- Test: `tests/split-view.test.mjs`

**Interfaces:**
- Produces the expected API for `getResponsiveDisplayMode({ width, height, isCoarsePointer })`.
- Produces the expected API for `getSidebarFooterVariant(mode)`.

- [ ] **Step 1: Write the failing tests**

```js
test('selects classic on desktop and tablet landscape, split on mobile and tablet portrait', () => {
  assert.equal(getResponsiveDisplayMode({ width: 1440, height: 900 }), DISPLAY_MODES.CLASSIC);
  assert.equal(getResponsiveDisplayMode({ width: 1024, height: 768 }), DISPLAY_MODES.CLASSIC);
  assert.equal(getResponsiveDisplayMode({ width: 390, height: 844 }), DISPLAY_MODES.SPLIT);
  assert.equal(getResponsiveDisplayMode({ width: 820, height: 1180 }), DISPLAY_MODES.SPLIT);
  assert.equal(getResponsiveDisplayMode({ width: 1024, height: 1366 }), DISPLAY_MODES.SPLIT);
  assert.equal(getResponsiveDisplayMode({ width: 844, height: 390, isCoarsePointer: true }), DISPLAY_MODES.SPLIT);
});

test('uses the full footer in classic mode and compact status footer in split mode', () => {
  assert.equal(getSidebarFooterVariant(DISPLAY_MODES.CLASSIC), 'full');
  assert.equal(getSidebarFooterVariant(DISPLAY_MODES.SPLIT), 'compact');
  assert.equal(getSidebarFooterVariant('unknown'), 'full');
});
```

Add `getResponsiveDisplayMode` and `getSidebarFooterVariant` to the existing import from `../src/splitView.js` before running the test.

- [ ] **Step 2: Run the focused test to verify it fails for the missing production exports**

Run: `node --test tests/split-view.test.mjs`

Expected: FAIL with a module export error for `getResponsiveDisplayMode` or `getSidebarFooterVariant`.

### Task 2: Add centralized responsive mode rules

**Files:**
- Modify: `src/splitView.js`
- Test: `tests/split-view.test.mjs`

**Interfaces:**
- `getResponsiveDisplayMode({ width, height, isCoarsePointer = false })` returns `DISPLAY_MODES.CLASSIC` or `DISPLAY_MODES.SPLIT`.
- `getSidebarFooterVariant(mode)` returns `'full'` for classic mode and `'compact'` for split mode.

- [ ] **Step 1: Implement the minimal viewport classifier**

Add the following after `normalizeDisplayMode`:

```js
export const getResponsiveDisplayMode = ({ width, height, isCoarsePointer = false }) => {
  const viewportWidth = Math.max(0, Number(width) || 0);
  const viewportHeight = Math.max(0, Number(height) || 0);
  const isPortrait = viewportHeight > viewportWidth;
  const isMobileViewport = viewportWidth <= 768 || (isCoarsePointer && viewportWidth <= 900);
  const isPortraitTablet = isPortrait && viewportWidth <= 1024;

  return isMobileViewport || isPortraitTablet
    ? DISPLAY_MODES.SPLIT
    : DISPLAY_MODES.CLASSIC;
};

export const getSidebarFooterVariant = (mode) => (
  normalizeDisplayMode(mode) === DISPLAY_MODES.SPLIT ? 'compact' : 'full'
);
```

This keeps a 1024×768 tablet/desktop landscape viewport in classic mode while treating a 1024×1366 portrait tablet as split. A touch-capable phone in landscape can remain split through `isCoarsePointer` without classifying a normal desktop browser window as mobile solely because it is narrow.

- [ ] **Step 2: Run the focused tests to verify the classifier**

Run: `node --test tests/split-view.test.mjs`

Expected: PASS, including the existing free-divider and whole-sidebar-scroll tests.

### Task 3: Make display mode automatic in the React shell

**Files:**
- Modify: `src/App.jsx:1150-1260, 4150-4300`
- Test: `tests/split-view.test.mjs`

**Interfaces:**
- `displayMode` becomes the result of `getResponsiveDisplayMode` rather than independently selected React state.
- The existing `getSplitViewGridRows({ height, position, dragOffset })` remains the source of the split row dimensions.

- [ ] **Step 1: Track coarse pointer capability alongside the existing viewport state**

Use `window.matchMedia('(pointer: coarse)')` in a small effect that updates on media-query changes. Keep the existing `windowSize` resize listener and do not store `displayMode` in localStorage.

- [ ] **Step 2: Derive the mode from the current viewport**

Replace `const [displayMode, setDisplayMode] = useState(DISPLAY_MODES.CLASSIC);` with:

```js
const displayMode = getResponsiveDisplayMode({
  width: windowSize.width,
  height: windowSize.height,
  isCoarsePointer
});
const isSplitView = displayMode === DISPLAY_MODES.SPLIT;
const sidebarOpen = isSplitView || sheetMode !== 'collapsed';
```

Remove the old `changeDisplayMode` state transition. Keep the two visual indicators in the header, but make them non-interactive selected-state indicators with `aria-pressed` and a label such as `자동 화면 모드: 1번` or `자동 화면 모드: 2번`. This prevents a manual click from contradicting the viewport rule.

- [ ] **Step 3: Keep split divider state valid across rotation and resize**

Add an effect that clears the stored divider position when leaving split mode and clamps/reinitializes it when entering or resizing split mode:

```js
useEffect(() => {
  if (!isSplitView) {
    setSplitPanePosition(null);
    setDragOffset(0);
    return;
  }

  setSplitPanePosition((currentPosition) => getFreeSplitPanePosition({
    height: windowSize.height,
    position: currentPosition ?? windowSize.height * 0.5
  }));
}, [isSplitView, windowSize.height]);
```

Keep the existing `splitPanePositionForRender` and pointer drag logic so the user’s free divider position is retained until the viewport changes.

- [ ] **Step 4: Run the build after the React mode transition is wired**

Run: `npm run lint && npm run build`

Expected: both commands exit successfully; the existing Vite large-chunk warning may remain a warning only.

### Task 4: Rework the bottom area per display mode

**Files:**
- Modify: `src/App.jsx:4435-4465, 5840-5860`
- Modify: `src/index.css:283-350`
- Test: `tests/split-view.test.mjs`

**Interfaces:**
- Classic desktop/tablet-landscape keeps the current full footer: count summary, legal/support links, save status, and `닫기`.
- Split mobile/tablet-portrait uses a compact always-visible save-status bar; count summary and legal/support links move to the scrollable content end.

- [ ] **Step 1: Add explicit footer variant classes and the scroll-end metadata block**

Use `getSidebarFooterVariant(displayMode)` to render `sidebar-footer-full` or `sidebar-footer-compact`. Add a `sidebar-list-end-meta` block after the main list content with the existing count and three links. Hide it by default and show it only in split mode so classic mode does not duplicate the footer metadata.

The split footer should render only the existing dynamic save-status label (`저장됨`, `저장 중…`, `동기화 중…`, `오프라인 저장`, or `로컬 저장됨`). Do not render `닫기` in the compact split footer. Since split mode is automatic, do not render a separate `메뉴 열기` action for that mode.

- [ ] **Step 2: Make only the split footer persistent**

Add the following CSS rules after the existing split-view rules:

```css
.app-container.split-view-mode .sidebar-container {
  overflow-x: hidden;
  overflow-y: auto !important;
  padding-bottom: 0;
}

.app-container.split-view-mode .drag-handle {
  position: sticky;
  top: 0;
  z-index: 3;
}

.app-container.split-view-mode .sidebar-footer-compact {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 4;
  min-height: 46px;
  padding: 10px 16px max(10px, env(safe-area-inset-bottom));
  justify-content: center;
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -8px 20px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
}

.app-container.split-view-mode .sidebar-footer-compact .sidebar-footer-meta,
.app-container.split-view-mode .sidebar-footer-compact button {
  display: none;
}

.app-container.split-view-mode .sidebar-list-content {
  padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important;
}

.app-container.split-view-mode .sidebar-list-end-meta {
  display: flex;
}

.sidebar-list-end-meta {
  display: none;
  flex-direction: column;
  gap: 6px;
  margin-top: 24px;
  padding: 16px 0 8px;
  border-top: 1px solid #f1f5f9;
}
```

The absolute compact bar remains visible while the header, itinerary, and end metadata scroll underneath it. The extra bottom padding ensures the last itinerary card and the metadata are never hidden behind the bar.

- [ ] **Step 3: Preserve classic mode footer behavior**

Leave `.sidebar-footer-full` in normal flex flow with the existing inline sizing and keep its `닫기` callback only for classic mode. Confirm `sidebarOpen` is forced true in split mode so a classic collapsed-state floating `메뉴 열기` control cannot appear over the split layout.

- [ ] **Step 4: Run focused tests and inspect the responsive layout rules**

Run: `node --test tests/split-view.test.mjs`

Expected: PASS for automatic mode selection, footer variants, whole-sidebar scrolling, and free divider positions.

### Task 5: Full verification and delivery handoff

**Files:**
- Modify: `기록-history.md`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all tests, lint, build, and whitespace checks pass. Record any existing Vite chunk-size warning as non-fatal.

- [ ] **Step 2: Perform a responsive browser check**

Check the local page at these CSS viewport sizes:

| Viewport | Expected mode | Expected bottom behavior |
| --- | --- | --- |
| 1440×900 | 1번 classic | Full footer remains available; `닫기` works. |
| 390×844 | 2번 split | Header and itinerary scroll together; compact `저장됨` bar remains visible. |
| 820×1180 | 2번 split | Same as mobile portrait, with usable tablet spacing. |
| 1024×1366 | 2번 split | Portrait tablet remains split. |
| 1024×768 | 1번 classic | Tablet landscape uses classic footer. |

Also rotate or resize between a split and classic viewport and confirm the divider is clamped to the new height without stale mode state.

- [ ] **Step 3: Record the completed work**

Append the request ID `R5mK8qL2Vx`, the responsive mode rule, footer behavior, and verification results to `기록-history.md`.

- [ ] **Step 4: Commit only the requested web changes**

```bash
git add src/App.jsx src/index.css src/splitView.js tests/split-view.test.mjs 기록-history.md docs/superpowers/plans/2026-09-14-responsive-display-mode.md
git commit -m "Use responsive split view modes"
```

Do not include unrelated iOS project changes in the commit.
