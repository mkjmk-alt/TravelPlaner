import SwiftUI
import NativeCore

struct PlaceDestinationView:View {
    @EnvironmentObject private var store:NativeTripStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("native.activeTrip") private var activeTrip=""
    let selection:PlaceSelection
    let draft:PlaceDraft
    var onAdded:()->Void={}
    @State private var tripID=""
    @State private var day=0
    @State private var operationID=UUID().uuidString
    @State private var error:String?
    @State private var saving=false
    @State private var createTrip=false
    var body:some View {
        NavigationStack {
            Form {
                Section("어느 여행에 추가할까요?") {
                    Picker("여행",selection:$tripID) {
                        Text("여행 선택").tag("")
                        ForEach(store.trips) { Text($0.name).tag($0.id) }
                    }.accessibilityIdentifier("destinationTrip")
                    Button("새 여행 만들기") { createTrip=true }
                }
                if let trip=store.trips.first(where:{$0.id==tripID}) {
                    Picker("추가할 일차",selection:$day) {
                        Text("예비 목록").tag(0)
                        ForEach(1...trip.dayCount,id:\.self) { Text("\($0)일차").tag($0) }
                    }.accessibilityIdentifier("destinationDay")
                }
                Text(draft.name)
                Text("저장 장소는 그대로 두고 일정에 새 항목으로 복사합니다.").font(.caption)
                if let error { Text(error).foregroundStyle(.red) }
                Button("선택한 일정에 추가") {
                    guard !saving else { return }; saving=true
                    do {
                        guard store.trips.contains(where:{$0.id==tripID}) else { throw ScheduleError.missingSection }
                        try store.applySchedule(tripID:tripID,change:.addPlace(section:day==0 ? .reserve:.day(day),id:operationID,draft:draft,selection:selection))
                        activeTrip=tripID; dismiss(); onAdded()
                    } catch { self.error=error.localizedDescription; saving=false }
                }.disabled(tripID.isEmpty || saving).accessibilityIdentifier("destinationConfirm")
            }.navigationTitle("일정에 추가")
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("취소") { dismiss() } } }
                .onAppear { if tripID.isEmpty && store.trips.contains(where:{$0.id==activeTrip}) { tripID=activeTrip } }
                .onChange(of:tripID) { _ in day=0 }
                .sheet(isPresented:$createTrip) { TripEditorView(original:nil) { id in tripID=id; createTrip=false } }
        }
    }
}
