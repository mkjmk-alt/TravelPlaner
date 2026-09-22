# Native expenses and settlement verification

## Scope

This stage adds the native iOS/Android expense and settlement slice while keeping the web JSON contract intact. It covers:

- expense amount, source currency, KRW conversion, category, memo, payer, and shared participants;
- deterministic 1/n splitting with remainder won assigned in participant order;
- person-level paid/share/balance results and minimal transfer suggestions;
- participant add/remove operations;
- settlement-currency cash wallets, currency-specific wallet names, and wallet deletion;
- atomic repository mutations that preserve unknown trip and expense fields.

The Google Maps API key remains intentionally deferred. Map rendering, place search, current-location permission, and marker smoke verification must be repeated after the local iOS/Android keys are supplied. This is a verification gate, not a reason to block expense and settlement work.

## Verification completed

- Web tests: `npm test` — 84 passed.
- Web native security checks: `npm run native:security` — passed.
- Swift NativeCore: `swift test --package-path ios/NativeCore` — 48 passed.
- iOS native preview: `xcodebuild ... -scheme TripPlotNativePreview ... build` — succeeded.
- Android JVM/unit/build: `:nativepreview:testDebugUnitTest :nativepreview:assembleDebug` — succeeded.
- Android instrumentation: `NativePreviewUiTest#expenseEditorPersistsAndSettlementOpens` — 1 passed on API 36 emulator.
- Android persistence instrumentation: `RoomPersistenceTest#expenseMutationRoundTripsAndPreservesUneditedTripFields` — 1 passed on API 36 emulator.
- Fixture parity: `native-expense-settlement-parity.test.mjs` — passed through the web calculator.
- `git diff --check` — passed.

The focused iOS UI test target compiled with the new accessibility identifiers, but its simulator run did not produce a completed result bundle because Xcode remained in `simctl diagnose` after the runner exited. Treat it as not independently verified until the simulator test is rerun in a clean Xcode session.

## Recheck after map key setup

1. Add the local iOS key through `ios/NativePreview/Map/NativeMaps.local.xcconfig` and the Android key through `android/native-maps.properties`.
2. Run the existing native map preview tests and launch the iOS/Android previews.
3. Confirm search, saved-place markers, current location, split view, and map camera restoration.
4. Rerun this expense/settlement suite to ensure map configuration did not change persistence or navigation.
