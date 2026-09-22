import Foundation

/// Viewport preference only. Never part of a trip, location history, or Google response cache.
public struct MapCameraSnapshot:Equatable {
    public let values:[Double]
    public init?(values:[Double]) {
        guard values.count==5,values.allSatisfy(\.isFinite),(-90...90).contains(values[0]),(-180...180).contains(values[1]),
              (0...22).contains(values[2]),(0...360).contains(values[3]),(0...90).contains(values[4]) else {return nil}
        self.values=values
    }
}
