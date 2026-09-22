import SwiftUI
import GoogleMaps
import NativeCore

struct GoogleMapSurface: UIViewRepresentable {
    let projection:MapProjection
    let command:CameraCommand?
    let active:Bool
    let onSelect:(MapMarker)->Void
    let onReady:()->Void
    var initialCamera:MapCameraSnapshot?=nil
    var onCameraIdle:(MapCameraSnapshot)->Void={_ in}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context:Context) -> GMSMapView {
        // Parent only mounts after MapConfiguration.configure has accepted a nonblank key.
        let options=GMSMapViewOptions()
        options.camera=GMSCameraPosition(latitude:35,longitude:135,zoom:3)
        if let v=initialCamera?.values {options.camera=GMSCameraPosition(latitude:v[0],longitude:v[1],zoom:Float(v[2]),bearing:v[3],viewingAngle:v[4])}
        let map=GMSMapView(options:options)
        map.delegate=context.coordinator; map.settings.myLocationButton=false; map.settings.compassButton=true
        context.coordinator.update(self,map:map); return map
    }
    func updateUIView(_ map:GMSMapView,context:Context) { context.coordinator.update(self,map:map) }
    static func dismantleUIView(_ view:GMSMapView,coordinator:Coordinator) {
        view.delegate=nil
        coordinator.markers.values.forEach { $0.map=nil }; coordinator.lines.forEach { $0.map=nil }
        coordinator.markers=[:]; coordinator.lines=[]
    }
    final class Coordinator:NSObject,GMSMapViewDelegate {
        var owner:GoogleMapSurface
        var markers=[String:GMSMarker](), snapshots=[String:MapMarker]()
        var lines=[GMSPolyline](), routeCoordinates=[[Coordinate]]()
        var queue=CameraQueue(), ready=false
        init(_ owner:GoogleMapSurface) { self.owner=owner }
        func update(_ owner:GoogleMapSurface,map:GMSMapView) {
            self.owner=owner
            if !owner.active { queue.cancelPending() }
            let desired=Dictionary(uniqueKeysWithValues:owner.projection.markers.map { ($0.key,$0) })
            for key in markers.keys.filter({desired[$0]==nil}) { markers.removeValue(forKey:key)?.map=nil; snapshots.removeValue(forKey:key) }
            for value in owner.projection.markers where snapshots[value.key] != value {
                let marker=markers[value.key] ?? GMSMarker()
                marker.position=CLLocationCoordinate2D(latitude:value.coordinate.latitude,longitude:value.coordinate.longitude)
                marker.title=value.label; marker.userData=value.key
                marker.icon=GMSMarker.markerImage(with:value.kind == .saved ? .systemPink : .systemTeal)
                marker.map=map; markers[value.key]=marker; snapshots[value.key]=value
            }
            let routes=owner.projection.routes.map { $0.markers.map(\.coordinate) }
            if routes != routeCoordinates {
                lines.forEach { $0.map=nil }
                lines=routes.map { coordinates in
                    let path=GMSMutablePath(); coordinates.forEach { path.addLatitude($0.latitude,longitude:$0.longitude) }
                    let line=GMSPolyline(path:path); line.strokeColor = .systemTeal; line.strokeWidth=3; line.map=map; return line
                }
                routeCoordinates=routes
            }
            if let command=owner.command { queue.enqueue(command) }
            consume(map)
        }
        private func consume(_ map:GMSMapView) {
            queue.consume(ready:ready && owner.active && map.bounds.width > 0 && map.bounds.height > 0) { command in
                switch command.target {
                case .center(let point,let zoom):
                    map.moveCamera(.setTarget(CLLocationCoordinate2D(latitude:point.latitude,longitude:point.longitude),zoom:Float(zoom)))
                case .fit(let points):
                    if let bound=MapBounds.fit(points) {
                        let sw=CLLocationCoordinate2D(latitude:bound.south,longitude:bound.west), ne=CLLocationCoordinate2D(latitude:bound.north,longitude:bound.east)
                        map.moveCamera(.fit(GMSCoordinateBounds(coordinate:sw,coordinate:ne),withPadding:min(40,min(map.bounds.width,map.bounds.height)/4)))
                    }
                }
            }
        }
        func mapViewDidFinishTileRendering(_ mapView:GMSMapView) { ready=true; owner.onReady(); consume(mapView) }
        func mapView(_ mapView:GMSMapView,idleAt position:GMSCameraPosition) {
            if let snapshot=MapCameraSnapshot(values:[position.target.latitude,position.target.longitude,Double(position.zoom),position.bearing,position.viewingAngle]) {owner.onCameraIdle(snapshot)}
        }
        func mapView(_ mapView:GMSMapView,willMove gesture:Bool) { if gesture { queue.cancelPending() } }
        func mapView(_ mapView:GMSMapView,didTap marker:GMSMarker) -> Bool {
            guard let key=marker.userData as? String,let value=snapshots[key] else { return false }; owner.onSelect(value); return true
        }
    }
}
