# Map Pane Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not use subagents.

**Goal:** Move Google Maps rendering into a lazy-loaded `MapPane` so the app and map chunks each stay below Vite's 500 kB warning threshold without breaking map, sidebar, search, or offline behavior.

**Architecture:** Keep trip, selection, search, and itinerary state in `App`; move the Google Maps loader and map-only render tree into `src/MapPane.jsx`. Mount that lazy module only when existing responsive presentation says the map is visible, keep the map wrapper in place for layout, and isolate import failures inside a map-specific error boundary. Preserve camera actions requested before the map instance is ready using a small tested helper.

**Tech Stack:** React 19, Vite 8, JavaScript/JSX, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-28-map-pane-code-splitting-design.md`

## Global Constraints

- Keep `chunkSizeWarningLimit` at its current default; do not silence the warning.
- Keep all generated chunks in `shell-assets.json` and preserve `public/sw.js` offline precaching.
- Preserve existing desktop map visibility, mobile map/split visibility, `getMapAvailability` behavior, and the sidebar when map loading fails.
- Preserve map search, place details, markers, routes, InfoWindow actions, geolocation, saved-place focus, and itinerary camera fitting.
- Do not change native iOS/Android files or unrelated existing working-tree changes; do not push or deploy.

## Review Focus

1. Desktop map visibility must remain true even where mobile `mapVisible` is false. Pin `shouldRenderMapPane` behavior in Task 1.
2. A saved-place/search camera request made before `GoogleMap.onLoad` must be applied once to the newly attached map. Pin immediate, pending, and one-shot behavior in Task 1.
3. Missing key and Google Maps API load errors must remain distinct from a rejected JavaScript chunk, with the non-map UI still present. Keep `tests/map-availability.test.mjs` green and pin the local error boundary in Task 2.
4. Leaving the map tab must not leave a stale map instance for later actions. Task 1 tests the camera helper; Task 2 verifies `onMapUnmount` clears the App map reference.
5. The service-worker manifest must include the built dynamic map asset so offline behavior is unchanged. Verify `dist/shell-assets.json` after the build in Task 2.

---

### Task 1: Map visibility and deferred camera actions

**Files:**
- Create: `src/mapPanePresentation.js`
- Test: `tests/map-pane-presentation.test.mjs`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces `shouldRenderMapPane({ isBottomNavigationViewport, mapVisible }) -> boolean`. It returns true for desktop (`isBottomNavigationViewport === false`) and otherwise follows `Boolean(mapVisible)`.
- Produces `runOrQueueMapCameraAction(mapRef, pendingActionRef, action) -> boolean`. It runs `action(mapRef.current)` immediately and returns `true` when a map exists; otherwise it replaces `pendingActionRef.current` with the latest action and returns `false`.
- Produces `flushPendingMapCameraAction(map, mapRef, pendingActionRef) -> boolean`. It installs the map in `mapRef`, consumes and runs a pending action once, and returns whether one was run.

- [ ] **Step 1: Write failing presentation and camera-action tests**

Add `shouldRenderMapPane follows desktop and mobile map visibility policy` proving desktop returns true for `mapVisible: false`, while bottom-navigation viewport values follow both true and false `mapVisible`. Add `runs camera actions immediately and flushes latest queued action once` proving immediate execution, deferred execution after attach, last-request-wins, and no second execution on repeated flush.

- [ ] **Step 2: Run the focused test and confirm it fails because the helpers are absent**

Run: `node --test tests/map-pane-presentation.test.mjs`
Expected: FAIL because `src/mapPanePresentation.js` does not yet export the tested functions.

- [ ] **Step 3: Implement the three helpers in `src/mapPanePresentation.js`**

Keep pending state in the provided ref; do not add a class, event bus, or dependency.

- [ ] **Step 4: Run the focused test and confirm all cases pass**

Run: `node --test tests/map-pane-presentation.test.mjs`
Expected: PASS for all visibility and camera-action cases.

- [ ] **Step 5: Integrate the visibility policy and camera callbacks in `src/App.jsx`**

Keep the existing `.map-wrapper` element and its sizing/classes mounted. Use `shouldRenderMapPane` to decide whether its map contents mount. Hold the live map in both existing React state and a ref; clear both on map unmount. Route `openMemoryPlace`, geocoded/Places search focus, and geolocation camera moves through `runOrQueueMapCameraAction`; flush once when the map loads. Leave active-day `fitBounds` behavior tied to the map state effect so it runs after attach.

- [ ] **Step 6: Run the focused test and current web tests**

Run: `node --test tests/map-pane-presentation.test.mjs tests/app-navigation.test.mjs tests/map-availability.test.mjs`
Expected: PASS; existing navigation and map-availability behavior remains unchanged.

### Task 2: Extract and lazy-load the map renderer

**Files:**
- Create: `src/MapPane.jsx`
- Create: `src/MapPaneErrorBoundary.jsx`
- Test: `tests/map-pane-code-split.test.mjs`
- Modify: `src/App.jsx`
- Modify: `src/index.css`
- No change: `vite.config.js`, `public/sw.js`, `src/mapAvailability.js`

**Interfaces:**
- `MapPane` receives `mapData` (`favorites`, `userLocation`, `polylinePath`, `activeDay`, `itinerary`, `reserveItems`, `searchResult`, `fullTripPaths`, `interDayPaths`, `dayColors`); `mapView` (`showFullRoute`, `selectedPlace`, `useFloatingPlacePanel`, `selectedPlaceBusinessStatus`, `selectedPlaceOpeningHours`, `windowWidth`, `sidebarOpen`, `activeTripId`, `isReadOnlyTrip`, `itineraryDisplayName`, `itineraryEmoji`, `itineraryTime`); `actions` (`onMapLoad(map)`, `onMapUnmount()`, `onMapClick(event)`, `onSelectedPlaceChange(placeOrNull)`, `onToggleFullRoute()`, `onMyLocation()`, `onOpenSidebar()`, `onToggleFavorite(place)`, `isFavorite(place) -> boolean`, `onActiveDayChange(day)`, `onItineraryDisplayNameChange(value)`, `onItineraryEmojiChange(value)`, `onItineraryTimeChange(value)`, `onAddToItinerary(place)`); and `formComponents` (`ItineraryEmojiPicker`, `PremiumTimeInput`).
- `MapPaneErrorBoundary` accepts `children` and an `onRetry` callback; it renders children normally and a map-local error state after a descendant/chunk error. Retry reloads the current page to re-request a failed deployment chunk; the boundary does not replace the app or sidebar.
- `App` owns `const LazyMapPane = lazy(() => import('./MapPane.jsx'))`; it renders it under `Suspense` and `MapPaneErrorBoundary` only when `shouldRenderMapPane(...)` is true. The Suspense fallback occupies the map wrapper and does not shift the sidebar.

- [ ] **Step 1: Add failing module-boundary regression tests**

In `tests/map-pane-code-split.test.mjs`, add `App keeps Google Maps out of its static imports and lazy-loads MapPane`, asserting `App.jsx` has no `@react-google-maps/api` import, declares `lazy(() => import('./MapPane.jsx'))`, and renders the lazy module under both `Suspense` and `MapPaneErrorBoundary`. Add `MapPane owns the Google loader and existing map availability UI`, asserting the new module imports `useJsApiLoader` and `getMapAvailability` and retains the missing-key text. Add `MapPaneErrorBoundary exposes a localized failure state`, loading the boundary through the existing Vite SSR test pattern and asserting `getDerivedStateFromError(new Error('chunk failed'))` returns `{ hasError: true }`.

- [ ] **Step 2: Run the focused test and confirm it fails against the current monolithic App**

Run: `node --test tests/map-pane-code-split.test.mjs`
Expected: FAIL because the Google Maps imports/render tree are still in `App.jsx` and the lazy boundary does not exist.

- [ ] **Step 3: Move the Google Maps loader, options, `CustomMapMarker`, map controls, markers, route polylines, and InfoWindow into `src/MapPane.jsx`**

Keep the existing markup and interactions. Define the day parsing and map-only constants in the map module. Pass the existing `ItineraryEmojiPicker` and `PremiumTimeInput` as `formComponents` so this extraction does not duplicate or relocate unrelated form code. Keep search, trip, and selection business rules in `App` and wire them through the declared `actions` contract.

- [ ] **Step 4: Implement `MapPaneErrorBoundary` and wire lazy rendering in `App.jsx`**

Move API-key lookup and `useJsApiLoader` into `MapPane`; keep missing-key/API-error messaging from `getMapAvailability`. Keep the map wrapper in App, render a stable `.map-pane-loading-state` Suspense fallback, and add only the corresponding loading styles in `src/index.css`. Ensure `onMapUnmount` clears the current map and `onMapLoad` flushes the pending camera action.

- [ ] **Step 5: Run focused map, boundary, and source-boundary tests**

Run: `node --test tests/map-pane-code-split.test.mjs tests/map-pane-presentation.test.mjs tests/map-availability.test.mjs`
Expected: PASS, including missing-key/API-error presentation and App-to-MapPane integration contracts.

- [ ] **Step 6: Run the full test suite and lint the changed JavaScript**

Run: `npm test`
Expected: all tests pass.

Run: `npx eslint src/App.jsx src/MapPane.jsx src/MapPaneErrorBoundary.jsx src/mapPanePresentation.js tests/map-pane-code-split.test.mjs tests/map-pane-presentation.test.mjs`
Expected: no lint errors.

- [ ] **Step 7: Build and inspect chunk sizes plus the offline shell manifest**

Run: `npm run build`
Expected: successful build with no Vite chunk-size warning; both the App and map JavaScript chunks are below 500 kB.

Then inspect `dist/shell-assets.json` and confirm every emitted dynamic map chunk path is present. If any chunk remains at or above 500 kB, do not raise the warning threshold or mark complete; inspect the generated chunk composition and revise the boundary before proceeding.

- [ ] **Step 8: Review the final diff for scope and map behavior preservation**

Confirm only the planned web files changed for this feature, no native or unrelated dirty files were altered, and the extraction retains map controls, all marker/path variants, selected-place actions, and missing-key/API-failure UI. Do not push or deploy.
