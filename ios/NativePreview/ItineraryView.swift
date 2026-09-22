import SwiftUI

struct ItineraryView:View {
    let tripID:String
    var body:some View { TripWorkspaceView(tripID:tripID) }
}
