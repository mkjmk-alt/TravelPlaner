import SwiftUI
import NativeCore

struct TripListView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Binding var activeTrip: String
    @State private var creating = false
    @State private var path: [String]

    init(activeTrip: Binding<String>) {
        _activeTrip = activeTrip
        _path = State(initialValue: activeTrip.wrappedValue.isEmpty ? [] : [activeTrip.wrappedValue])
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("여행을 그리는 작은 공간").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                        Text("어디로 떠나볼까요?").font(.title2.bold())
                        Text("일정을 차근차근 준비해보세요.\n만든 여행은 이 기기에 안전하게 저장됩니다.")
                            .font(.subheadline).foregroundStyle(.secondary).lineSpacing(4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(24)
                    .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 24))

                    if let error = store.loadError {
                        VStack(alignment: .leading, spacing: 12) {
                            Label("여행을 불러오지 못했어요", systemImage: "exclamationmark.triangle")
                            Text(error).font(.footnote)
                            Text("기존 데이터는 삭제하지 않았습니다.").font(.footnote)
                            Button("다시 불러오기", action: store.open).buttonStyle(.bordered)
                        }.foregroundStyle(.red)
                    } else {
                        Button { creating = true } label: {
                            Label("새 여행 만들기", systemImage: "plus.circle.fill")
                                .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 10)
                        }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .accessibilityIdentifier("newTripButton")

                        HStack {
                            Text("내 여행").font(.title3.bold())
                            Spacer()
                            Text("\(store.trips.count)개").font(.subheadline).foregroundStyle(.secondary)
                        }
                        if store.trips.isEmpty {
                            VStack(spacing: 12) {
                                Image(systemName: "suitcase.rolling").font(.system(size: 32)).foregroundStyle(.secondary)
                                Text("첫 여행을 만들어보세요").font(.headline)
                                Text("여행 이름과 날짜만 있으면 시작할 수 있어요.")
                                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            }.padding(30).frame(maxWidth: .infinity)
                        }
                        LazyVStack(spacing: 12) {
                            ForEach(store.trips) { trip in
                                NavigationLink(value: trip.id) {
                                    HStack(spacing: 16) {
                                        Image(systemName: "airplane").font(.title2).foregroundStyle(.tint)
                                            .frame(width: 48, height: 48)
                                            .background(Color.purple.opacity(0.09), in: RoundedRectangle(cornerRadius: 16))
                                        VStack(alignment: .leading, spacing: 7) {
                                            Text(trip.name).font(.headline).foregroundStyle(.primary)
                                            Text("\(trip.startDate) — \(trip.endDate)").font(.caption).foregroundStyle(.secondary)
                                            Text("\(trip.country.isEmpty ? "여행지 미정" : trip.country) · \(trip.dayCount)일")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer(minLength: 0)
                                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                                        .background(.background, in: RoundedRectangle(cornerRadius: 20))
                                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.secondary.opacity(0.12)))
                                }.buttonStyle(.plain).accessibilityIdentifier("trip-\(trip.id)")
                            }
                        }
                        Label("기기에 저장됨", systemImage: "checkmark.circle")
                            .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                    }
                }.padding(22)
            }
            .navigationTitle("TripPlot")
            .navigationDestination(for: String.self) { id in
                TripDetailView(tripID: id, activeTrip: $activeTrip)
            }
            .sheet(isPresented: $creating) {
                        TripEditorView(original: nil) { id in
                            activeTrip = id
                            path = [id]
                        }
            }
        }
        .onChange(of: path) { ids in
            // The map/saved tabs use activeTrip as a selection. Keep that
            // selection independent from the Trips navigation stack so
            // changing the map's displayed trip cannot unexpectedly push a
            // detail screen here. Only an explicit Trips navigation change
            // updates the shared active-trip choice.
            if let id = ids.last { activeTrip = id }
        }
        .onChange(of: store.trips.map(\.id)) { ids in
            if let id = path.last, !ids.contains(id) { path = [] }
            if !activeTrip.isEmpty && !ids.contains(activeTrip) { activeTrip = "" }
        }
    }
}

struct TripDetailView: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String
    @Binding var activeTrip: String
    @State private var editing = false
    @State private var deleting = false
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }

    var body: some View {
        Group {
            if let trip {
                List {
                    Section("여행 정보") {
                        LabeledContent("여행지", value: trip.country.isEmpty ? "미정" : trip.country)
                        LabeledContent("시작", value: trip.startDate)
                        LabeledContent("종료", value: trip.endDate)
                        LabeledContent("기간", value: "\(trip.dayCount)일")
                    }
                    Section("여행 일정") {
                        NavigationLink { ItineraryView(tripID: trip.id) } label: { Label("일정·예비 목록 편집", systemImage: "list.bullet.rectangle") }
                            .accessibilityIdentifier("openItinerary")
                        ForEach(0..<trip.dayCount, id: \.self) { index in
                            HStack {
                                Label("\(index + 1)일차", systemImage: "calendar")
                                Spacer()
                                Text("\((trip.days[index]["items"] as? [[String: Any]] ?? []).count)개 장소")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section {
                        Label("이 기기에 저장된 여행입니다", systemImage: "checkmark.circle")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Text("장소 직접 입력과 JSON 백업을 사용할 수 있습니다. 지도 검색은 다음 단계에서 제공됩니다.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Section {
                        NavigationLink { TripBackupView(tripID: trip.id) } label: { Label("여행 JSON 백업", systemImage: "square.and.arrow.up") }
                        Button("여행 삭제", role: .destructive) { deleting = true }
                    }
                }
                .navigationTitle(trip.name).navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("편집") { editing = true }.accessibilityIdentifier("editTripButton") }
                .sheet(isPresented: $editing) { TripEditorView(original: trip) { _ in } }
                .confirmationDialog("이 여행을 삭제할까요?", isPresented: $deleting, titleVisibility: .visible) {
                    Button("여행 삭제", role: .destructive) {
                        do { try store.delete(trip); activeTrip = "" } catch { self.error = error.localizedDescription }
                    }
                } message: { Text("이 미리보기 앱에 저장된 여행이 삭제됩니다.") }
            } else {
                VStack(spacing: 16) {
                    Text("여행을 찾을 수 없어요")
                    Button("여행 목록으로") { activeTrip = "" }
                }
            }
        }
        .alert("저장 오류", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("확인") { error = nil }
        } message: { Text(error ?? "") }
    }
}
