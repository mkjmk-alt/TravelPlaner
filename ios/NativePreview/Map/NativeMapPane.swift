import SwiftUI
import NativeCore

struct NativeMapPane:View {
    let projection:MapProjection
    let command:CameraCommand?
    var active=true
    var onSelect:(MapMarker)->Void={_ in}
    var initialCamera:MapCameraSnapshot?=nil
    var onCameraIdle:(MapCameraSnapshot)->Void={_ in}
    @State private var ready=false
    @State private var delayed=false
    @State private var retry=0
    @Environment(\.scenePhase) private var phase
    var body:some View {
        Group {
            if MapConfiguration.key != nil {
                ZStack(alignment:.top) {
                    GoogleMapSurface(projection:projection,command:command,active:active && phase == .active,onSelect:onSelect,onReady:{ready=true; delayed=false},initialCamera:initialCamera,onCameraIdle:onCameraIdle)
                        .id(retry)
                    if delayed {
                        HStack {
                            Text("지도 불러오기 지연").font(.caption)
                            Button("다시 시도") { ready=false; delayed=false; retry += 1 }
                        }.padding(8).background(.regularMaterial,in:RoundedRectangle(cornerRadius:12)).padding(8)
                    }
                }
                .task(id:"\(active)-\(phase)-\(retry)") {
                    guard active,phase == .active,!ready else { return }
                    do { try await Task.sleep(nanoseconds:15000000000) } catch { return }
                    if !ready { delayed=true }
                }
            } else {
                VStack(spacing:8) {
                    Image(systemName:"map").font(.title)
                    Text("지도 연결 준비 중").font(.headline)
                    Text("네이티브 지도 키가 필요합니다.\n일정과 저장 장소는 계속 사용할 수 있어요.")
                        .font(.caption).multilineTextAlignment(.center)
                }.padding().frame(maxWidth:.infinity,maxHeight:.infinity)
                    .background(Color.green.opacity(0.06)).accessibilityIdentifier("nativeMapUnavailable")
            }
        }.clipped()
    }
}
