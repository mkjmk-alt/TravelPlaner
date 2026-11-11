import SwiftUI
import NativeCore

private let expenseCurrencies = ["KRW", "JPY", "USD", "EUR", "CNY", "VND"]

private func rawString(_ value: Any?, fallback: String = "") -> String { (value as? String) ?? fallback }
private func rawInt(_ value: Any?, fallback: Int = 0) -> Int { if let value = value as? NSNumber { return value.intValue }; return Int((value as? String) ?? "") ?? fallback }
private func rawDouble(_ value: Any?, fallback: Double = 0) -> Double { if let value = value as? NSNumber { return value.doubleValue }; return Double((value as? String) ?? "") ?? fallback }
private func walletText(_ row: [String: Any], _ key: String) -> String {
    if let value = row[key] as? String { return value }
    if let value = row[key] as? NSNumber { return String(value.intValue) }
    return ""
}

private func expenseTitle(_ row: [String: Any]) -> String {
    let memo = rawString(row["memo"]).trimmingCharacters(in: .whitespacesAndNewlines)
    if !memo.isEmpty { return memo }
    let category = ExpenseCategories.normalize(rawString(row["category"]))
    return ExpenseCategories.all.first(where: { $0.id == category })?.label ?? "기존 분류"
}

private func nativeParticipants(_ trip: TripDocument) -> [SettlementParticipant] {
    let parsed = (trip.raw["settlementParticipants"] as? [[String: Any]] ?? []).compactMap { row in
        let id = rawString(row["id"]); let name = rawString(row["name"])
        return id.isEmpty || name.isEmpty ? nil : SettlementParticipant(id: id, name: name)
    }
    return ExpenseSettlement.normalizeParticipants(parsed)
}

private func nativeExpenses(_ trip: TripDocument) -> [SettlementExpense] {
    (trip.raw["expenses"] as? [[String: Any]] ?? []).compactMap { row in
        let id = rawString(row["id"])
        guard !id.isEmpty else { return nil }
        let participantIDs = (row["participantIds"] as? [String]) ?? []
        return SettlementExpense(id: id, amount: rawDouble(row["amount"]), currency: rawString(row["currency"], fallback: "KRW"), amountKRW: rawInt(row["amountKRW"], fallback: rawInt(row["amount"])), payerID: rawString(row["payerId"], fallback: "self"), participantIDs: participantIDs)
    }
}

struct ExpenseView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Binding var activeTrip: String
    let onGoToTrips: () -> Void
    @State private var adding = false
    @State private var editing: [String: Any]?
    @State private var pendingDeletion: [String: Any]?
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == activeTrip } }

    var body: some View {
        NavigationStack {
            Group {
                if let trip {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("지출").font(.title.bold()).foregroundStyle(NativePreviewTheme.textPrimary)
                                    Text(trip.name).font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
                                }
                                Spacer()
                                Button { adding = true } label: { Label("추가", systemImage: "plus") }
                                    .buttonStyle(.borderedProminent).tint(NativePreviewTheme.primary)
                                    .frame(minHeight: 44)
                                    .accessibilityIdentifier("addExpense")
                            }
                            Text("원래 금액·통화·환율과 누가 함께 사용했는지 저장해요.")
                                .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                            Text("지출 내역").font(.headline).foregroundStyle(NativePreviewTheme.textPrimary)
                            let rows = trip.raw["expenses"] as? [[String: Any]] ?? []
                            if rows.isEmpty { EmptyExpenseView(title: "아직 지출이 없어요", message: "추가 버튼으로 첫 지출을 기록해보세요.", symbol: "creditcard").nativeCard() }
                            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                                HStack(spacing: 12) {
                                Button { editing = row } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(expenseTitle(row)).font(.headline)
                                            Text(verbatim: "\(rawString(row["currency"], fallback: "KRW")) \(rawDouble(row["amount"])) · \(rawString(row["payerId"], fallback: "self")) 결제")
                                                .font(.caption).foregroundStyle(NativePreviewTheme.textMuted)
                                        }
                                        Spacer()
                                        Text("₩\(rawInt(row["amountKRW"]))").font(.subheadline.weight(.semibold))
                                    }
                                }.buttonStyle(.plain).foregroundStyle(NativePreviewTheme.textPrimary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .accessibilityIdentifier("editExpense-\(rawString(row["id"]))")
                                Button(role: .destructive) { pendingDeletion = row } label: {
                                    Image(systemName: "trash")
                                        .frame(minWidth: 44, minHeight: 44)
                                }
                                .accessibilityLabel("지출 삭제")
                                .accessibilityIdentifier("deleteExpense-\(rawString(row["id"]))")
                                }.nativeCard(padding: 16)
                            }
                            NavigationLink { SettlementView(tripID: trip.id) } label: {
                                Label("함께 정산", systemImage: "person.2")
                                    .frame(maxWidth: .infinity, minHeight: NativePreviewTheme.primaryButtonHeight)
                            }
                                .buttonStyle(.borderedProminent).tint(NativePreviewTheme.primary)
                                .accessibilityIdentifier("openSettlement")
                        }
                        .padding(.horizontal, NativePreviewTheme.screenPadding)
                        .padding(.vertical, NativePreviewTheme.sectionSpacing)
                    }
                    .background(NativePreviewTheme.background)
                    .accessibilityIdentifier("expense-page")
                    .navigationTitle("지출")
                    .toolbar(.hidden, for: .navigationBar)
                } else {
                    ScrollView {
                        TripRequiredBudgetView(onGoToTrips: onGoToTrips)
                            .padding(.horizontal, NativePreviewTheme.screenPadding)
                            .padding(.top, 12)
                    }
                        .background(NativePreviewTheme.background)
                        .accessibilityIdentifier("expense-page")
                        .navigationTitle("지출")
                        .toolbar(.hidden, for: .navigationBar)
                }
            }
            .sheet(isPresented: $adding) { if let trip { ExpenseEditorView(tripID: trip.id, defaultCurrency: trip.travelCurrency) } }
            .sheet(isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } })) { if let trip, let editing { ExpenseEditorView(tripID: trip.id, defaultCurrency: trip.travelCurrency, expense: editing) } }
            .alert("저장 오류", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("확인") { error = nil } } message: { Text(error ?? "") }
            .alert("지출 삭제", isPresented: Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })) {
                Button("삭제", role: .destructive) { if let row = pendingDeletion { delete(row) }; pendingDeletion = nil }
                Button("취소", role: .cancel) { pendingDeletion = nil }
            } message: { Text("이 지출 내역만 삭제합니다. 정산 결과에서도 제외됩니다.") }
        }
    }

    private func delete(_ row: [String: Any]) {
        guard let trip, let id = row["id"] as? String else { return }
        do { try store.deleteExpense(tripID: trip.id, expenseID: id) } catch let caught { self.error = caught.localizedDescription }
    }
}

struct ExpenseEditorView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    let expense: [String: Any]?
    @State private var amount: String
    @State private var amountKRW: String
    @State private var currency: String
    @State private var category: String
    @State private var memo: String
    @State private var payerID: String
    @State private var participantIDs: Set<String>
    @State private var newParticipantName = ""
    @State private var rate: String
    @State private var rateMode: String
    @State private var rateReferenceDate: String
    @State private var rateWasApplied: Bool
    @State private var rateSnapshot: ExchangeRateSnapshot?
    @State private var rateStatus = "자동 환율을 불러오는 중이에요."
    @State private var saving = false
    @State private var error: String?

    init(tripID: String, defaultCurrency: String, expense: [String: Any]? = nil) {
        self.tripID = tripID; self.expense = expense
        let cleanedDefault = defaultCurrency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let defaultCode = cleanedDefault.isEmpty ? "USD" : cleanedDefault
        _amount = State(initialValue: expense.map { String(rawDouble($0["amount"])) } ?? "")
        _amountKRW = State(initialValue: expense.map { String(rawInt($0["amountKRW"])) } ?? "")
        _currency = State(initialValue: expense.map { rawString($0["currency"], fallback: defaultCode) } ?? defaultCode)
        _category = State(initialValue: ExpenseCategories.normalize(expense.map { rawString($0["category"], fallback: "other") } ?? "other"))
        _memo = State(initialValue: expense.map { rawString($0["memo"]) } ?? "")
        _payerID = State(initialValue: expense.map { rawString($0["payerId"], fallback: "self") } ?? "self")
        _participantIDs = State(initialValue: Set((expense?["participantIds"] as? [String]) ?? ["self"]))
        let savedRate = expense.map { row -> String in
            if let value = row["exchangeRate"] as? String { return value }
            if let value = row["exchangeRate"] as? NSNumber { return value.stringValue }
            return ""
        } ?? ""
        _rate = State(initialValue: savedRate.isEmpty && defaultCode == "KRW" ? "1" : savedRate)
        _rateMode = State(initialValue: expense.map { rawString($0["exchangeRateMode"], fallback: savedRate.isEmpty ? "automatic" : "manual") } ?? "automatic")
        _rateReferenceDate = State(initialValue: expense.map { rawString($0["exchangeRateReferenceDate"]) } ?? "")
        _rateWasApplied = State(initialValue: expense == nil && defaultCode == "KRW")
    }

    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var participants: [SettlementParticipant] { trip.map(nativeParticipants) ?? [SettlementParticipant(id: "self", name: "나")] }
    private var currencyOptions: [String] {
        [currency, "KRW", "JPY", "USD", "EUR", "CNY", "VND"].reduce(into: []) { result, code in
            if !code.isEmpty && !result.contains(code) { result.append(code) }
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("금액") {
                    TextField("원래 금액", text: Binding(get: { amount }, set: { value in
                        amount = value
                        rateWasApplied = true
                        amountKRW = convertedKRW(amount: value, rate: rate)
                    })).keyboardType(.decimalPad).accessibilityIdentifier("expenseAmount")
                    Picker("사용 통화", selection: Binding(get: { currency }, set: { code in
                        currency = code
                        rateMode = "automatic"
                        rateWasApplied = true
                        applyRate(rateSnapshot?.krwPerUnit(for: code) ?? (code == "KRW" ? 1 : nil), recalculate: true)
                    })) { ForEach(currencyOptions, id: \.self) { Text($0).tag($0) } }
                    TextField("KRW 환산 금액", text: $amountKRW).keyboardType(.numberPad).accessibilityIdentifier("expenseAmountKRW")
                    TextField("적용 환율 (₩/1단위)", text: Binding(get: { rate }, set: { value in
                        rate = value
                        rateMode = "manual"
                        rateReferenceDate = ""
                        rateWasApplied = true
                        amountKRW = convertedKRW(amount: amount, rate: value)
                    })).keyboardType(.decimalPad).disabled(currency == "KRW")
                    Text(rateSummary).font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                }
                Section("내용") {
                    Picker("카테고리", selection: $category) {
                        if !ExpenseCategories.all.contains(where: { $0.id == category }) { Text("기존 분류").tag(category) }
                        ForEach(ExpenseCategories.all, id: \.id) { Text($0.label).tag($0.id) }
                    }.accessibilityIdentifier("expenseCategory")
                    TextField("메모", text: $memo)
                }
                Section("함께 정산") {
                    Picker("지출자", selection: $payerID) { ForEach(participants) { Text($0.name).tag($0.id) } }
                    HStack {
                        TextField("지출자 이름 추가", text: $newParticipantName)
                            .textInputAutocapitalization(.words)
                            .accessibilityIdentifier("addExpenseParticipantName")
                        Button("추가") { addParticipant() }
                            .disabled(newParticipantName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityIdentifier("addExpenseParticipant")
                    }
                    ForEach(participants) { person in
                        Toggle(person.name, isOn: Binding(get: { participantIDs.contains(person.id) }, set: { enabled in
                            if enabled { participantIDs.insert(person.id) } else if person.id != payerID { participantIDs.remove(person.id) }
                        }))
                    }
                    Text("지출자는 자동으로 포함되며 선택한 사람 수로 1/n 정산해요.").font(.footnote).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(NativePreviewTheme.background)
            .navigationTitle(expense == nil ? "지출 추가" : "지출 수정")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("저장") { save() }.disabled(saving).accessibilityIdentifier("saveExpense") }
            }
            .task { await loadExchangeRates() }
        }
    }

    private var rateSummary: String {
        if rateMode == "manual", !rate.isEmpty { return "직접 입력한 환율을 적용하고 있어요." }
        if currency == "KRW" { return "원화 지출은 1 KRW = 1 KRW로 계산해요." }
        guard let rateValue = Double(rate), rateValue > 0 else { return rateStatus }
        let source = rateSnapshot?.isStale == true ? "저장된 환율" : (rateReferenceDate.isEmpty ? "적용 환율" : "자동 환율")
        let date = rateReferenceDate
        return date.isEmpty
            ? "\(source) · 1 \(currency) = ₩\(rateValue)"
            : "\(source) · 1 \(currency) = ₩\(rateValue) · 기준일 \(date)"
    }

    private func loadExchangeRates() async {
        do {
            let snapshot = try await ExchangeRateClient.shared.latestSnapshot()
            rateSnapshot = snapshot
            rateStatus = snapshot.isStale ? "네트워크 연결이 없어 저장된 환율을 사용해요." : "자동 환율을 적용했어요."
            if expense == nil {
                applyRate(snapshot.krwPerUnit(for: currency), recalculate: true)
                rateWasApplied = true
            } else if rate.isEmpty {
                applyRate(snapshot.krwPerUnit(for: currency), recalculate: rateWasApplied)
            }
        } catch {
            rateStatus = "환율을 불러오지 못했어요. 환율과 원화 금액을 직접 입력할 수 있어요."
        }
    }

    private func applyRate(_ value: Double?, recalculate: Bool) {
        guard let value, value.isFinite, value > 0 else {
            rate = ""
            if recalculate { amountKRW = "" }
            rateStatus = "이 통화의 환율이 없어 직접 입력이 필요해요."
            return
        }
        rate = String(value)
        if rateMode == "automatic", let rateSnapshot {
            rateReferenceDate = TripDate.string(rateSnapshot.updatedAt)
        }
        if recalculate { amountKRW = convertedKRW(amount: amount, rate: rate) }
    }

    private func convertedKRW(amount: String, rate: String) -> String {
        guard let amountValue = Double(amount), amountValue.isFinite,
              let rateValue = Double(rate), rateValue.isFinite, rateValue > 0 else { return "" }
        let converted = (amountValue * rateValue).rounded()
        guard converted.isFinite, converted >= 0, converted < Double(Int.max) else { return "" }
        return String(Int(converted))
    }

    private func addParticipant() {
        let name = newParticipantName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        if let existing = participants.first(where: { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(name) == .orderedSame }) {
            payerID = existing.id
            participantIDs.insert(existing.id)
            newParticipantName = ""
            return
        }
        let participant = SettlementParticipant(id: UUID().uuidString, name: name)
        let nextParticipants = ExpenseSettlement.normalizeParticipants(participants + [participant])
        do {
            try store.updateParticipants(tripID: tripID, participants: nextParticipants.map { ["id": $0.id, "name": $0.name] })
            payerID = participant.id
            participantIDs.insert(participant.id)
            newParticipantName = ""
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() {
        guard let trip, let numericAmount = Double(amount), numericAmount.isFinite, numericAmount > 0, let converted = Int(amountKRW), converted >= 0 else { error = "원래 금액과 KRW 환산 금액을 확인해주세요."; return }
        var ids = participants.map(\.id).filter { participantIDs.contains($0) }
        if !ids.contains(payerID) { ids.append(payerID) }
        saving = true
        var fields: [String: Any] = ["amount": numericAmount, "currency": currency, "amountKRW": converted, "category": category, "memo": memo, "payerId": payerID, "participantIds": ids, "updatedAt": Date().timeIntervalSince1970 * 1000]
        if rateWasApplied, let rateValue = Double(rate), rateValue.isFinite, rateValue > 0 {
            fields["exchangeRate"] = rateValue
            fields["exchangeRateMode"] = rateMode
            fields["exchangeRateReferenceDate"] = rateMode == "automatic" && !rateReferenceDate.isEmpty ? rateReferenceDate as Any : NSNull()
        }
        do { try store.upsertExpense(tripID: trip.id, expenseID: expense?["id"] as? String ?? UUID().uuidString, fields: fields); dismiss() }
        catch { self.error = error.localizedDescription; saving = false }
    }
}

struct SettlementView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    @State private var newParticipant = ""
    @State private var selectedCurrency = "USD"
    @State private var error: String?
    @State private var walletDrafts: [String: String] = [:]
    @State private var initialWalletDrafts: [String: String] = [:]
    @State private var actualWalletDrafts: [String: String] = [:]
    @State private var pendingWalletDeletion: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var participants: [SettlementParticipant] { trip.map(nativeParticipants) ?? [] }
    private var expenses: [SettlementExpense] { trip.map(nativeExpenses) ?? [] }
    private var summary: SettlementSummary { ExpenseSettlement.calculate(expenses: expenses, participants: participants) }
    private var walletRows: [[String: Any]] {
        (trip?.raw["budgetSettings"] as? [String: Any])?["cashWallets"] as? [[String: Any]] ?? []
    }

    var body: some View {
        List {
            Section("정산 요약") {
                Text(verbatim: "총 지출 ₩\(summary.totalKRW) · \(summary.expenseCount)건")
                ForEach(summary.people) { person in
                    HStack { Text(person.name); Spacer(); Text("지불 ₩\(person.paidKRW) · 부담 ₩\(person.shareKRW)"); Text(person.balanceKRW >= 0 ? "+₩\(person.balanceKRW)" : "-₩\(-person.balanceKRW)").foregroundStyle(person.balanceKRW >= 0 ? .green : .red) }
                        .font(.caption)
                }
                ForEach(Array(summary.transfers.enumerated()), id: \.offset) { _, transfer in
                    let from = summary.people.first { $0.id == transfer.fromID }?.name ?? transfer.fromID
                    let to = summary.people.first { $0.id == transfer.toID }?.name ?? transfer.toID
                    Label("\(from) → \(to) ₩\(transfer.amountKRW)", systemImage: "arrow.right")
                }
            }
            Section("정산 참여자") {
                ForEach(participants) { person in
                    HStack { Text(person.name); Spacer(); if person.id != "self" { Button(role: .destructive) { removeParticipant(person.id) } label: { Image(systemName: "trash") } } }
                }
                HStack { TextField("함께 여행한 사람 이름", text: $newParticipant); Button("추가") { addParticipant() }.disabled(newParticipant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
            Section("현금 지갑") {
                Picker("정산 통화", selection: $selectedCurrency) { ForEach(expenseCurrencies, id: \.self) { Text($0).tag($0) } }
                    .onChange(of: selectedCurrency) { _ in saveBudget(values: ["travelCurrency": selectedCurrency]) }
                ForEach(Array(walletRows.enumerated()), id: \.offset) { _, row in
                    let id = rawString(row["id"]); let currency = rawString(row["currency"], fallback: "KRW")
                    VStack(alignment: .leading) {
                        HStack { Text(rawString(row["name"], fallback: "\(currency) 현금 지갑")); Spacer(); Text(currency); if !id.isEmpty { Button(role: .destructive) { pendingWalletDeletion = id } label: { Image(systemName: "trash") }.accessibilityLabel("지갑 삭제") } }
                        TextField("여행 전 환전·인출", text: Binding(get: { initialWalletDrafts[id] ?? walletText(row, "initial") }, set: { initialWalletDrafts[id] = $0 })).keyboardType(.numberPad)
                        TextField("추가 환전·인출", text: Binding(get: { walletDrafts[id] ?? walletText(row, "additional") }, set: { walletDrafts[id] = $0 })).keyboardType(.numberPad)
                        TextField("실제 남은 현금", text: Binding(get: { actualWalletDrafts[id] ?? walletText(row, "actualRemaining") }, set: { actualWalletDrafts[id] = $0 })).keyboardType(.numberPad)
                        Button("지갑 금액 저장") { updateWallet(row, id: id) }
                    }
                }
                Button("현재 통화로 지갑 추가") { addWallet() }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(NativePreviewTheme.background)
        .navigationTitle("함께 정산")
        .toolbar(.visible, for: .navigationBar)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        .onAppear { selectedCurrency = rawString((trip?.raw["budgetSettings"] as? [String: Any])?["travelCurrency"], fallback: "USD") }
        .alert("지갑 삭제", isPresented: Binding(get: { pendingWalletDeletion != nil }, set: { if !$0 { pendingWalletDeletion = nil } })) {
            Button("삭제", role: .destructive) { if let id = pendingWalletDeletion { removeWallet(id) }; pendingWalletDeletion = nil }
            Button("취소", role: .cancel) { pendingWalletDeletion = nil }
        } message: { Text("선택한 현금 지갑만 삭제합니다. 지출 내역은 유지됩니다.") }
    }

    private func addParticipant() {
        guard let trip else { return }; let name = newParticipant.trimmingCharacters(in: .whitespacesAndNewlines); guard !name.isEmpty else { return }
        var rows = trip.raw["settlementParticipants"] as? [[String: Any]] ?? [["id": "self", "name": "나"]]
        rows.append(["id": "person-\(UUID().uuidString)", "name": name])
        do { try store.updateParticipants(tripID: trip.id, participants: rows); newParticipant = "" } catch let caught { self.error = caught.localizedDescription }
    }
    private func removeParticipant(_ id: String) {
        guard let trip else { return }; let rows = (trip.raw["settlementParticipants"] as? [[String: Any]] ?? []).filter { rawString($0["id"]) != id }
        do { try store.updateParticipants(tripID: trip.id, participants: rows) } catch let caught { self.error = caught.localizedDescription }
    }
    private func saveBudget(values: [String: Any]) { do { try store.updateBudgetSettings(tripID: tripID, values: values) } catch let caught { self.error = caught.localizedDescription } }
    private func addWallet() {
        let id = "wallet-\(UUID().uuidString)"; var next = walletRows
        next.append(["id": id, "name": "\(selectedCurrency) 현금 지갑", "currency": selectedCurrency, "initial": 0, "additional": 0, "actualRemaining": ""])
        saveBudget(values: ["cashWallets": next])
    }
    private func removeWallet(_ id: String) { saveBudget(values: ["cashWallets": walletRows.filter { rawString($0["id"]) != id }]) }
    private func updateWallet(_ row: [String: Any], id: String) {
        var updated = row
        if let value = Int(initialWalletDrafts[id] ?? walletText(row, "initial")) { updated["initial"] = value }
        if let value = Int(walletDrafts[id] ?? walletText(row, "additional")) { updated["additional"] = value }
        let actual = actualWalletDrafts[id] ?? walletText(row, "actualRemaining")
        if actual.isEmpty { updated["actualRemaining"] = "" }
        else if let value = Int(actual) { updated["actualRemaining"] = value }
        saveBudget(values: ["cashWallets": walletRows.map { rawString($0["id"]) == id ? updated : $0 }])
        initialWalletDrafts[id] = nil; walletDrafts[id] = nil; actualWalletDrafts[id] = nil
    }
}

private struct EmptyExpenseView: View {
    let title: String
    let message: String
    let symbol: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 30)).foregroundStyle(NativePreviewTheme.primary)
                .frame(width: 72, height: 72).background(NativePreviewTheme.primaryContainer, in: Circle())
            Text(title).font(.headline).foregroundStyle(NativePreviewTheme.textPrimary)
            Text(message).font(.footnote).foregroundStyle(NativePreviewTheme.textMuted).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(.vertical, 18)
    }
}

private struct TripRequiredBudgetView: View {
    let onGoToTrips: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "airplane")
                .font(.system(size: 23, weight: .semibold))
                .foregroundStyle(NativePreviewTheme.primary)
                .frame(width: 48, height: 48)
                .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 15))
            Text("예산·지출")
                .font(.title2.bold())
                .foregroundStyle(NativePreviewTheme.textPrimary)
            Text("여행을 선택하면 예산과 지출을 관리할 수 있어요.")
                .font(.subheadline)
                .foregroundStyle(NativePreviewTheme.textMuted)
            Button(action: onGoToTrips) {
                Label("내 여행으로 이동", systemImage: "arrow.right")
                    .font(.subheadline.weight(.heavy))
                    .foregroundStyle(NativePreviewTheme.onPrimary)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(NativePreviewTheme.primary, in: RoundedRectangle(cornerRadius: 13))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("budgetGoToTrips")
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [NativePreviewTheme.primaryContainer, NativePreviewTheme.card],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(NativePreviewTheme.primary.opacity(0.2), lineWidth: 1)
        }
    }
}
