# 네이티브 지출·정산 단계 실행 계획

> 요청 ID: `Z6pN4xR8Lm`
> 범위: 지도 키 검증은 보류하고, 기존 웹의 지출·현금 정산·함께 정산을 iOS SwiftUI와 Android Jetpack Compose 네이티브 화면으로 이식한다.
> 작업 원칙: 기존 여행 JSON의 알 수 없는 필드를 보존하고, 지도 SDK가 없어도 지출·정산·로컬 저장은 동작한다. 서브에이전트는 사용하지 않는다.

## 전제와 보류 게이트

- 지도 API 키는 이번 단계에서 입력하거나 추측하지 않는다.
- `docs/native-maps-saved-split-verification.md`의 실제 Google 타일·Places 검색·현재 위치·마커 렌더링 검증은 **보류**로 유지한다.
- 지출·정산 단계의 구현과 키 없는 회귀 검증이 끝난 뒤, 사용자가 제한된 iOS/Android 키를 제공하면 지도 단계의 실제 제공자 smoke와 마커 안정성 검증을 다시 리마인드한다.
- 지도 키 보류를 단계 통과로 간주하지 않는다. 앱 전체 출시 준비 상태도 아직 아니다.

## 목표

기존 웹에서 사용하는 다음 동작을 두 네이티브 앱에서 같은 데이터와 계산 결과로 제공한다.

1. 여행별 지출 추가·수정·삭제
2. 지출 카테고리, 금액, 원래 통화, KRW 환산 금액, 수동/자동 환율 보존
3. 지출자와 함께 사용한 사람 선택 및 지출자 자동 포함
4. 통화별 현금 지갑 추가·삭제와 환전/인출/실제 잔액 입력
5. 참여자별 부담액·지불액·잔액과 최소 송금 안내 계산
6. 앱 종료·재실행 및 오프라인 상태에서도 저장된 결과 복원
7. 현재 지도 키가 없는 상태에서도 지출 탭과 기존 일정·저장 탭이 오류 화면으로 바뀌지 않음

## 데이터 계약

기존 `TripDocument`의 raw JSON을 교체하지 않고, 아래 필드만 엄격히 읽고 쓴다. 새 필드가 추가되어도 모르는 필드는 원본 JSON 왕복 시 보존한다.

### `expenses`

```json
{
  "id": "expense-uuid",
  "amount": 1200,
  "currency": "JPY",
  "amountKRW": 10800,
  "exchangeRate": 9,
  "exchangeRateMode": "manual",
  "category": "food",
  "memo": "저녁",
  "payerId": "self",
  "participantIds": ["self", "person-1"],
  "createdAt": 0,
  "updatedAt": 0
}
```

- `amount`와 `currency`가 원장 원본이다. `amountKRW`는 표시/정산 기준으로 저장하되 원래 금액을 대체하지 않는다.
- 환율이 수동이면 `exchangeRateMode`와 `exchangeRate`를 보존한다. 자동 환율도 계산에 사용한 시점의 유효 rate를 저장해 과거 합계가 바뀌지 않게 한다.
- 참여자 배열의 순서로 1원 단위 나머지를 배분한다. `payerId`는 항상 `participantIds`에 포함한다.
- 기존 웹 필드(`name`, `time`, `paymentMethod` 등)가 있으면 제거하지 않고 그대로 왕복한다.

### `budgetSettings`

- 예산 한도, 기본 여행 통화, 환율 설정을 보존한다.
- `cashWallets`를 통화별 지갑 배열로 관리한다. 지갑에는 `id`, `name`, `currency`, `initial`, `additional`, `actualRemaining`을 둔다.
- 새 지갑은 현재 선택한 정산 통화로 생성한다. 다른 통화의 기존 지갑을 USD로 표시하거나 덮어쓰지 않는다.
- 지갑 삭제는 명시적인 확인 후 해당 지갑만 삭제하며 `expenses` 원장은 삭제하지 않는다.

### `settlementParticipants`

- `self`를 항상 유지하고 이름이 비어 있거나 중복 ID인 참여자는 정규화한다.
- 기존 참여자 ID를 지출에서 삭제하지 않는다. 삭제/이름 변경은 사용자가 확정한 이후 새 지출에 반영하고, 과거 계산은 보존된 ID를 기준으로 재현한다.

## 구현 순서

### 1. 공통 순수 모델과 계산기

**대상 파일**

- 신규 `ios/NativeCore/Sources/NativeCore/ExpenseSettlement.swift`
- 신규 `android/nativepreview/src/main/java/com/travelplaner/nativepreview/domain/ExpenseSettlement.kt`
- `ios/NativeCore/Tests/NativeCoreTests/ExpenseSettlementTests.swift`
- `android/nativepreview/src/test/java/com/travelplaner/nativepreview/ExpenseSettlementTest.kt`
- 필요 시 `TripDocument.swift/.kt`의 안전한 필드 접근 보조 함수

**작업**

- 참여자/지출/지갑 입력을 정규화하는 순수 함수를 만든다.
- 웹 `normalizeExpenseParticipants`, `normalizeSettlementParticipants`, `calculateSettlement`와 같은 결과를 반환한다.
- 통화 변환은 `convertAmount(amount, currency, storedRate)` 경계를 주입한다. 네이티브 계산기가 네트워크 환율을 직접 호출하지 않게 한다.
- 금액은 최소 통화 단위 규칙을 명시하고, KRW 정산 예제는 정수로 처리한다.
- 채무자/채권자 매칭은 결정적 순서를 사용해 동일 입력이 양 플랫폼에서 같은 송금 목록을 만든다.

**RED → GREEN 기준**

- 1,200 JPY를 2명이 나누는 경우와 나머지 1원이 발생하는 경우를 검증한다.
- 여러 지출에서 한 사람이 선결제하고 다른 사람이 부담하는 경우 송금 안내 합계가 전체 지출 합계와 일치해야 한다.
- 참여자 없음, 잘못된 ID, 0/음수/문자 금액, 환율 누락을 안전하게 처리한다.

### 2. 원자적 저장 API와 재실행 보존

**대상 파일**

- `ios/NativeCore/Sources/NativeCore/TripRepository.swift`
- `android/nativepreview/src/main/java/com/travelplaner/nativepreview/data/TripRepository.kt`
- `ios/NativePreview/NativeTripStore.swift`
- `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TripViewModel.kt`
- 각 플랫폼의 저장소 테스트

**작업**

- 지출 추가/수정/삭제, 예산 설정 변경, 참여자 변경, 현금 지갑 추가/삭제를 각각 하나의 저장 트랜잭션으로 만든다.
- 수정은 ID 기반으로만 적용하고, 없는 ID·다른 여행 ID·중복 operation ID는 오류로 처리한다.
- 삭제 전에 저장된 원본을 다시 읽어 대상이 맞는지 확인한다.
- 저장 실패 시 이전 payload 전체를 rollback하고 UI에 저장 완료를 표시하지 않는다.
- 앱을 강제 종료한 뒤 재실행하면 지출·지갑·참여자·환율 기준이 동일하게 복원되는 테스트를 추가한다.

### 3. iOS 지출 탭과 현금 정산 화면

**대상 파일**

- `ios/NativePreview/NativeRootView.swift`
- 신규 `ios/NativePreview/ExpenseView.swift`
- 신규 `ios/NativePreview/ExpenseEditorView.swift`
- 신규 `ios/NativePreview/SettlementView.swift`
- 필요 시 `ios/NativePreview/NativeTripStore.swift`

**작업**

- 기존 “지출” 탭의 준비 중 화면을 실제 화면으로 교체한다.
- 활성 여행이 없을 때는 첫 여행을 임의 선택하지 않고 여행 선택 안내를 표시한다.
- 목록 → 추가 → 편집 → 삭제 확인 → 정산 결과 순서의 내부 NavigationStack을 사용한다.
- 금액/통화/환율/카테고리/메모 입력과 지출자·참여자 선택을 제공한다.
- 현금 정산 영역에서 통화 선택, 지갑 선택, 지갑 추가·삭제 확인, 환전/인출/실제 잔액을 제공한다.
- 키보드, 큰 글자, VoiceOver에서 저장/삭제 버튼이 가려지지 않게 한다.

### 4. Android 지출 탭과 현금 정산 화면

**대상 파일**

- `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TripPlotApp.kt`
- 신규 `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/ExpenseScreen.kt`
- 신규 `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/ExpenseEditorScreen.kt`
- 신규 `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/SettlementScreen.kt`
- `android/nativepreview/src/main/java/com/travelplaner/nativepreview/ui/TripViewModel.kt`

**작업**

- 현재 `FeaturePreview("지출", ...)`를 실제 Compose route로 교체한다.
- 기존 탭 백스택과 시스템 뒤로가기 규칙을 유지한다.
- 선택한 여행을 명시적으로 유지하고, 저장 중에는 중복 제출을 막는다.
- `LazyColumn`과 `imePadding`으로 마지막 지출/정산 버튼까지 접근 가능하게 한다.
- 지갑 추가 시 선택 통화가 지갑 통화가 되도록 하고, 삭제 시 확인 대화상자를 제공한다.
- TalkBack에서 지출자, 함께 사용한 사람, 금액, 통화, 삭제 동작을 식별할 수 있게 한다.

### 5. 정산 결과와 웹 호환 회귀

**대상 파일**

- 신규 `contracts/native/fixtures/expense-settlement.json`
- 신규 `contracts/native/fixtures/expense-settlement-expected.json`
- 기존 `tests/expense-settlement*.test.mjs`와 웹 테스트
- `docs/native-expenses-settlement-verification.md`

**작업**

- 하나의 공통 fixture로 웹·Swift·Kotlin 계산 결과를 비교한다.
- 지출 상세에는 원래 금액/통화/환율을 표시하고, 정산 결과에는 기준 통화 금액과 송금 방향을 표시한다.
- 삭제된 지출/지갑이 다른 원장과 여행 일정에 미치는 영향을 확인한다.
- 지도 키가 없거나 지도 SDK가 초기화되지 않아도 지출·정산 route가 정상 진입되는 회귀 테스트를 추가한다.

## 검증 명령

```bash
swift test --package-path ios/NativeCore

cd android
./gradlew :nativepreview:testDebugUnitTest :nativepreview:assembleDebug :nativepreview:lintDebug --console=plain
cd ..

npm test
npm run native:security
npm run build
git diff --check
```

추가로 양 플랫폼에서 다음 시나리오를 수동/자동으로 확인한다.

1. 여행 선택 → JPY 지출 추가 → `self`와 참여자 1명 선택 → 앱 종료 → 재실행
2. USD 지갑이 있는 상태에서 JPY 정산 통화 선택 → JPY 지갑 추가 → JPY 지갑 삭제
3. 결제자와 참여자가 다른 지출 2건 입력 → 사람별 부담액과 송금 안내 비교
4. 지도 키 미설정 상태에서 지출 탭 진입·저장·정산 확인
5. 키보드/큰 글자/뒤로 가기/탭 전환 후 입력 중인 초안과 목록 상태 확인

## 완료 판정과 다음 인계

- 이 계획의 구현·검증이 완료되기 전에는 “네이티브 앱 전체 구현 완료”로 표현하지 않는다.
- 지도 키 실제 검증은 이 단계의 성공과 별개인 보류 관문이다.
- 지출·정산 단계가 완료되면 사용자에게 지도 키 입력 및 실제 지도 smoke 검증을 다시 상기하고, 그때만 `NativeMaps.local.xcconfig`와 `native-maps.properties`에 사용자가 제공한 제한 키를 설정한다.
- 커밋·푸시·배포·개발자 결제·사용자 데이터 초기화는 별도 요청 없이는 실행하지 않는다.
