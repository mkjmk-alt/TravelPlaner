import SwiftUI
import NativeCore
import PhotosUI
import UniformTypeIdentifiers
import Vision
import PDFKit
import ImageIO
import UIKit

struct TravelDetailsView: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String
    @State private var flight = FlightReceiptDraft()
    @State private var stayName = ""
    @State private var stayAddress = ""
    @State private var lodgingEditor: LodgingEditorTarget?
    @State private var lodgingToDelete: LodgingEditorTarget?
    @State private var baseline: [String: String] = [:]
    @State private var error: String?
    @State private var status: String?
    @State private var choosingFile = false
    @State private var photo: PhotosPickerItem?
    @State private var reading = false
    @State private var review = FlightReceiptDraft()
    @State private var showingReview = false
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }

    var body: some View {
        Form {
            Section {
                Button { choosingFile = true } label: { Label("예약 확인서 파일 가져오기", systemImage: "doc.viewfinder") }
                    .disabled(reading).accessibilityIdentifier("flightImportFile")
                PhotosPicker(selection: $photo, matching: .images) { Label("사진에서 가져오기", systemImage: "photo") }
                    .disabled(reading).accessibilityIdentifier("flightImportPhoto")
                if reading { ProgressView("확인서를 읽는 중…") }
                Text("사진 또는 PDF를 기기에서만 읽습니다. 인식된 내용은 확인 후 저장됩니다.")
                    .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
            }.listRowBackground(NativePreviewTheme.card)
            FlightFields(draft: $flight)
            Section("기존 숙소 · 날짜 미지정") {
                if let trip {
                    Button("기존 숙소로 추가") {
                        do {
                            let rows = try TripLodging.rows(in: trip)
                            lodgingEditor = .init(row: ["id": UUID().uuidString, "name": stayName, "address": stayAddress, "checkIn": "", "checkOut": ""], expected: rows)
                        } catch { self.error = error.localizedDescription }
                    }.disabled(stayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                TextField("숙소 이름", text: $stayName)
                TextField("숙소 주소", text: $stayAddress)
                if !stayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("추가해도 기존 정보는 그대로 보관됩니다. 숙박 날짜를 직접 선택해주세요.").font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                }
            }.listRowBackground(NativePreviewTheme.card)
            Section {
                if let trip {
                    switch Result(catching: { try TripLodging.rows(in: trip) }) {
                    case .failure(let issue): Text(issue.localizedDescription).foregroundStyle(NativePreviewTheme.favoritesAccent)
                    case .success(let rows):
                        if rows.isEmpty { Text("등록된 숙소가 없습니다.").foregroundStyle(NativePreviewTheme.textMuted) }
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(row["name"] as? String ?? "숙소").font(.headline)
                                Text("\(row["checkIn"] as? String ?? "날짜 미정") 체크인 · \(row["checkOut"] as? String ?? "날짜 미정") 체크아웃")
                                    .font(.caption).foregroundStyle(NativePreviewTheme.textMuted)
                                if let address = row["address"] as? String, !address.isEmpty { Text(address).font(.caption) }
                                HStack {
                                    Button("일정에 추가") {
                                        do { try store.applyMemoryChange(tripID: tripID, change: .addLodgingEvents(row: row)); error = nil; status = "여행 기간 안의 체크인·체크아웃 일정을 추가했습니다. 추가한 일정은 숙소 수정과 별도로 관리됩니다." }
                                        catch { self.error = error.localizedDescription; status = nil }
                                    }.accessibilityIdentifier("lodgingAddEvents")
                                    Button("수정") { lodgingEditor = .init(row: row, expected: rows) }
                                    Button("삭제", role: .destructive) { lodgingToDelete = .init(row: row, expected: rows) }
                                }.buttonStyle(.borderless).frame(minHeight: 44)
                            }.padding(.vertical, 4)
                        }
                        Button { lodgingEditor = .init(row: ["id": UUID().uuidString, "name": "", "address": "", "checkIn": trip.startDate, "checkOut": trip.endDate], expected: rows) } label: { Label("숙소 추가", systemImage: "plus.circle") }
                            .accessibilityIdentifier("lodgingAdd")
                    }
                }
            } header: { Text("숙소 관리") } footer: { Text("각 일차에서 숙소를 확인할 수 있어요. 일정 추가 시 여행 기간에 포함된 날짜만 추가되며, 숙소를 수정해도 추가한 일정은 자동으로 바뀌지 않습니다.") }
                .listRowBackground(NativePreviewTheme.card)
            Section {
                Button("여행 정보 저장") { save() }.accessibilityIdentifier("travelDetailsSave")
                if let status { Text(status).foregroundStyle(NativePreviewTheme.budgetAccent).accessibilityIdentifier("travelDetailsStatus") }
                if let error { Text(error).foregroundStyle(NativePreviewTheme.favoritesAccent).accessibilityIdentifier("travelDetailsError") }
            }.listRowBackground(NativePreviewTheme.card)
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(NativePreviewTheme.background)
        .tint(NativePreviewTheme.primary)
        .navigationTitle("항공·숙소 정보")
        .toolbar(.visible, for: .navigationBar)
        .onAppear { load() }
        .fileImporter(isPresented: $choosingFile, allowedContentTypes: [.pdf, .image]) { result in
            switch result {
            case .success(let url): readFile(url)
            case .failure(let issue): error = issue.localizedDescription
            }
        }
        .onChange(of: photo) { item in
            guard let item else { return }
            reading = true; error = nil; status = nil
            Task {
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else { throw FlightReceiptReadError.unreadable }
                    let parsed = try await Task.detached(priority: .userInitiated) { try FlightReceiptReader.read(data) }.value
                    review = parsed; showingReview = true
                } catch { self.error = error.localizedDescription }
                reading = false; photo = nil
            }
        }
        .sheet(item: $lodgingEditor) { target in
            LodgingEditorView(target: target) { row in
                var next = target.expected
                if let index = next.firstIndex(where: { ($0["id"] as? String) == (row["id"] as? String) }) { next[index] = row }
                else { next.append(row) }
                try store.applyMemoryChange(tripID: tripID, change: .setLodgings(rows: next, expected: target.expected))
            }
        }
        .alert("숙소를 삭제할까요?", isPresented: Binding(get: { lodgingToDelete != nil }, set: { if !$0 { lodgingToDelete = nil } })) {
            Button("숙소 삭제", role: .destructive) {
                if let target = lodgingToDelete {
                    do {
                        let next = target.expected.filter { ($0["id"] as? String) != (target.row["id"] as? String) }
                        try store.applyMemoryChange(tripID: tripID, change: .setLodgings(rows: next, expected: target.expected))
                        error = nil
                    } catch { self.error = error.localizedDescription }
                }
                lodgingToDelete = nil
            }
            Button("취소", role: .cancel) { lodgingToDelete = nil }
        } message: { Text("등록한 숙소 정보가 삭제됩니다.") }
        .sheet(isPresented: $showingReview) {
            FlightReceiptReviewView(initial: review) { reviewed, addToItinerary in
                let expected = Dictionary(uniqueKeysWithValues: reviewed.values.keys.map { ($0, baseline[$0] ?? "") })
                try store.saveFlightConfirmation(tripID: tripID, flight: reviewed, expected: expected,
                                                 addToItinerary: addToItinerary, itemID: UUID().uuidString)
                load()
                status = addToItinerary ? "항공 정보와 출발 일정을 저장했습니다." : "항공 정보를 저장했습니다."
                error = nil
            }
        }
    }
    private func load() {
        let details = trip?.raw["travelDetails"] as? [String: Any] ?? [:]
        func value(_ key: String) -> String { details[key] as? String ?? "" }
        flight.flightNumber = value("flightNumber"); flight.departure = value("departure"); flight.arrival = value("arrival")
        flight.departureDate = value("flightDepartureDate"); flight.departureTime = value("flightDepartureTime")
        flight.arrivalDate = value("flightArrivalDate"); flight.arrivalTime = value("flightArrivalTime")
        flight.boardingDate = value("flightBoardingDate"); flight.boardingTime = value("flightBoardingTime")
        stayName = value("stayName"); stayAddress = value("stayAddress")
        baseline = flight.values.merging(["stayName": stayName, "stayAddress": stayAddress]) { _, next in next }
    }
    private func save() {
        guard let trip else { error = "여행을 찾을 수 없습니다."; return }
        do {
            _ = try FlightConfirmation.apply(flight, to: trip, expected: baseline, addToItinerary: false, itemID: UUID().uuidString)
            let values = flight.values.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .merging(["stayName": stayName, "stayAddress": stayAddress]) { _, next in next }
            try store.applyMemoryChange(tripID: tripID, change: .setTravelDetails(values: values, expected: baseline))
            load(); error = nil; status = "여행 정보를 저장했습니다."
        } catch { self.error = error.localizedDescription; status = nil }
    }
    private func readFile(_ url: URL) {
        reading = true; error = nil; status = nil
        Task {
            do {
                let parsed = try await Task.detached(priority: .userInitiated) {
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size <= FlightReceiptReader.maximumBytes else { throw FlightReceiptReadError.tooLarge }
                    return try FlightReceiptReader.read(Data(contentsOf: url, options: .mappedIfSafe))
                }.value
                review = parsed; showingReview = true
            } catch { self.error = error.localizedDescription }
            reading = false
        }
    }
}

private struct LodgingEditorTarget: Identifiable {
    let id = UUID()
    let row: [String: Any]
    let expected: [[String: Any]]
}

private struct LodgingEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: NativeTripStore
    let target: LodgingEditorTarget
    let onSave: ([String: Any]) throws -> Void
    @State private var name: String
    @State private var address: String
    @State private var checkIn: Date
    @State private var checkOut: Date
    @State private var datesSelected: Bool
    @State private var checkInTime: String
    @State private var checkOutTime: String
    @State private var memo: String
    @State private var selectedPlace = ""
    @State private var error: String?
    init(target: LodgingEditorTarget, onSave: @escaping ([String: Any]) throws -> Void) {
        self.target = target; self.onSave = onSave
        _name = State(initialValue: target.row["name"] as? String ?? "")
        _address = State(initialValue: target.row["address"] as? String ?? "")
        _checkIn = State(initialValue: TripDate.date(target.row["checkIn"] as? String ?? "") ?? Date())
        _checkOut = State(initialValue: TripDate.date(target.row["checkOut"] as? String ?? "") ?? Date())
        _datesSelected = State(initialValue: TripDate.date(target.row["checkIn"] as? String ?? "") != nil && TripDate.date(target.row["checkOut"] as? String ?? "") != nil)
        _checkInTime = State(initialValue: target.row["checkInTime"] as? String ?? "")
        _checkOutTime = State(initialValue: target.row["checkOutTime"] as? String ?? "")
        _memo = State(initialValue: target.row["memo"] as? String ?? "")
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("숙소 정보") {
                    if !store.savedPlaces.isEmpty {
                        Picker("저장 장소에서 선택", selection: $selectedPlace) {
                            Text("직접 입력").tag("")
                            ForEach(store.savedPlaces) { place in Text(place.draft.name).tag(place.id) }
                        }.onChange(of: selectedPlace) { id in
                            if let place = store.savedPlaces.first(where: { $0.id == id }) {
                                name = place.draft.name; address = place.draft.loc
                            }
                        }
                    }
                    TextField("숙소 이름", text: $name).accessibilityIdentifier("lodgingName")
                    TextField("주소 (선택)", text: $address)
                    if !datesSelected { Button("숙박 날짜 선택") { datesSelected = true } }
                    if datesSelected {
                        DatePicker("체크인 날짜", selection: $checkIn, displayedComponents: .date)
                        DatePicker("체크아웃 날짜", selection: $checkOut, displayedComponents: .date)
                    } else { Text("체크인과 체크아웃 날짜를 선택해주세요.").font(.footnote).foregroundStyle(NativePreviewTheme.textMuted) }
                    TextField("체크인 시간 (선택, 09:30)", text: $checkInTime)
                    TextField("체크아웃 시간 (선택, 09:30)", text: $checkOutTime)
                    TextField("예약 메모 (선택)", text: $memo)
                }.listRowBackground(NativePreviewTheme.card)
                if target.expected.contains(where: { row in
                    guard (row["id"] as? String) != (target.row["id"] as? String),
                          let start = row["checkIn"] as? String, let end = row["checkOut"] as? String else { return false }
                    return start < TripDate.string(checkOut) && TripDate.string(checkIn) < end
                }) { Text("다른 숙소와 숙박 기간이 겹칩니다. 예약을 확인해주세요.").font(.footnote).foregroundStyle(NativePreviewTheme.textMuted) }
                if let error { Text(error).foregroundStyle(NativePreviewTheme.favoritesAccent) }
            }.scrollContentBackground(.hidden).background(NativePreviewTheme.background)
                .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
                .navigationTitle("숙소 등록").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("저장") {
                            guard datesSelected else { error = "체크인과 체크아웃 날짜를 선택해주세요."; return }
                            var row = target.row
                            row["name"] = name.trimmingCharacters(in: .whitespacesAndNewlines)
                            row["address"] = address.trimmingCharacters(in: .whitespacesAndNewlines)
                            if let place = store.savedPlaces.first(where: { $0.id == selectedPlace }), place.draft.loc == address {
                                for key in ["lat", "lng", "placeId", "nativePlaceSource"] { row[key] = place.payload[key] }
                            } else if (target.row["address"] as? String ?? "") != address {
                                for key in ["lat", "lng", "placeId", "nativePlaceSource"] { row.removeValue(forKey: key) }
                            }
                            row["checkIn"] = TripDate.string(checkIn); row["checkOut"] = TripDate.string(checkOut)
                            row["checkInTime"] = checkInTime; row["checkOutTime"] = checkOutTime; row["memo"] = memo
                            do { try TripLodging.validate(row); try onSave(row); dismiss() }
                            catch { self.error = error.localizedDescription }
                        }.accessibilityIdentifier("lodgingSave")
                    }
                }
        }.tint(NativePreviewTheme.primary)
    }
}

private struct FlightFields: View {
    @Binding var draft: FlightReceiptDraft
    var body: some View {
        Section("항공편") {
            field("항공편", placeholder: "예: KE703", text: $draft.flightNumber, id: "flightNumber")
            field("출발지", placeholder: "예: ICN", text: $draft.departure, id: "flightDeparture")
            field("도착지", placeholder: "예: NRT", text: $draft.arrival, id: "flightArrival")
        }.listRowBackground(NativePreviewTheme.card)
        Section {
            field("출발일", placeholder: "YYYY-MM-DD", text: $draft.departureDate, id: "flightDepartureDate")
            field("출발 시간", placeholder: "HH:MM", text: $draft.departureTime, id: "flightDepartureTime")
            field("도착일", placeholder: "YYYY-MM-DD", text: $draft.arrivalDate, id: "flightArrivalDate")
            field("도착 시간", placeholder: "HH:MM", text: $draft.arrivalTime, id: "flightArrivalTime")
            field("탑승일", placeholder: "확인된 경우만", text: $draft.boardingDate, id: "flightBoardingDate")
            field("탑승 시간", placeholder: "확인된 경우만", text: $draft.boardingTime, id: "flightBoardingTime")
        } header: { Text("날짜와 시간 · 각 공항의 현지 시각") }
          footer: { Text("탑승 시작 시간은 출발 시간과 다릅니다. 확인되지 않으면 비워두세요.") }
          .listRowBackground(NativePreviewTheme.card)
    }
    private func field(_ label: String, placeholder: String, text: Binding<String>, id: String) -> some View {
        HStack {
            Text(label).foregroundStyle(NativePreviewTheme.textPrimary)
            Spacer(minLength: 8)
            TextField(placeholder, text: text)
                .multilineTextAlignment(.trailing)
                .textInputAutocapitalization(id == "flightNumber" ? .characters : .never)
                .autocorrectionDisabled()
                .accessibilityLabel(label).accessibilityIdentifier(id)
        }
    }
}

private struct FlightReceiptReviewView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: FlightReceiptDraft
    @State private var addToItinerary = true
    @State private var error: String?
    let onConfirm: (FlightReceiptDraft, Bool) throws -> Void
    init(initial: FlightReceiptDraft, onConfirm: @escaping (FlightReceiptDraft, Bool) throws -> Void) {
        _draft = State(initialValue: initial); self.onConfirm = onConfirm
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(draft.hasAmbiguity ? "여러 항공편이나 날짜가 확인되었습니다. 한 편의 정보를 직접 확인해 입력해주세요." : "인식 결과가 정확한지 예약 확인서와 비교해 수정해주세요.")
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                    Text("확인되지 않은 탑승일과 시간은 비워둡니다. 기존 항공 정보는 이 내용으로 변경됩니다.")
                        .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                }.listRowBackground(NativePreviewTheme.card)
                FlightFields(draft: $draft)
                Section {
                    Toggle("출발 일차에 항공 일정 추가", isOn: $addToItinerary).accessibilityIdentifier("flightAddToItinerary")
                    Text("항공편과 출발일·출발 시간이 필요하며, 여행 기간에 포함되어야 합니다.")
                        .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                }.listRowBackground(NativePreviewTheme.card)
                if let error { Section { Text(error).foregroundStyle(NativePreviewTheme.favoritesAccent).accessibilityIdentifier("flightReviewError") }.listRowBackground(NativePreviewTheme.card) }
            }
            .scrollContentBackground(.hidden).background(NativePreviewTheme.background).tint(NativePreviewTheme.primary)
            .navigationTitle("항공 정보 확인").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("확인 후 저장") {
                        do { try onConfirm(draft, addToItinerary); dismiss() }
                        catch { self.error = error.localizedDescription }
                    }.accessibilityIdentifier("flightReviewSave")
                }
            }
        }
        .interactiveDismissDisabled()
    }
}

private enum FlightReceiptReadError: LocalizedError {
    case unreadable, tooLarge, locked, tooManyPages, noText
    var errorDescription: String? {
        switch self {
        case .unreadable: "파일을 읽을 수 없습니다. 다른 이미지나 PDF를 선택해주세요."
        case .tooLarge: "확인서 파일은 20MB 이하로 선택해주세요."
        case .locked: "암호가 설정된 PDF는 열 수 없습니다. 암호를 해제한 파일을 선택해주세요."
        case .tooManyPages: "PDF는 최대 10페이지까지 읽을 수 있습니다."
        case .noText: "읽을 수 있는 문자를 찾지 못했습니다. 더 선명한 확인서를 선택해주세요."
        }
    }
}

private enum FlightReceiptReader {
    static let maximumBytes = 20 * 1024 * 1024
    static func read(_ data: Data) throws -> FlightReceiptDraft {
        guard !data.isEmpty else { throw FlightReceiptReadError.unreadable }
        guard data.count <= maximumBytes else { throw FlightReceiptReadError.tooLarge }
        var text = ""
        if data.starts(with: Data("%PDF".utf8)) {
            guard let document = PDFDocument(data: data) else { throw FlightReceiptReadError.unreadable }
            guard !document.isLocked else { throw FlightReceiptReadError.locked }
            guard document.pageCount > 0 else { throw FlightReceiptReadError.unreadable }
            guard document.pageCount <= 10 else { throw FlightReceiptReadError.tooManyPages }
            for index in 0..<document.pageCount {
                guard let page = document.page(at: index) else { continue }
                if let content = page.string { text += "\n" + content }
                let bounds = page.bounds(for: .mediaBox)
                let scale = min(3.0, 2400.0 / max(1, max(bounds.width, bounds.height)))
                let size = CGSize(width: max(1, bounds.width * scale), height: max(1, bounds.height * scale))
                if let image = page.thumbnail(of: size, for: .mediaBox).cgImage,
                   let recognized = try? recognize(image) { text += "\n" + recognized }
            }
        } else {
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 3000
                  ] as CFDictionary) else { throw FlightReceiptReadError.unreadable }
            text = try recognize(image)
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw FlightReceiptReadError.noText }
        return FlightReceiptParser.parse(text)
    }
    private static func recognize(_ image: CGImage) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        if let supported = try? request.supportedRecognitionLanguages() {
            let languages = ["ko-KR", "en-US"].filter { supported.contains($0) }
            if !languages.isEmpty { request.recognitionLanguages = languages }
        }
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}
