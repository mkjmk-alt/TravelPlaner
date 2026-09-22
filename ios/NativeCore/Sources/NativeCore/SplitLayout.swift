import Foundation

public enum SplitLayout {
    public static func commit(_ ratio:Double)->Double { ratio.isFinite ? min(1,max(0,ratio)) : 0.5 }
    public static func resize(startRatio:Double,delta:Double,extent:Double)->Double {
        let start=commit(startRatio)
        guard extent.isFinite,extent>0,delta.isFinite else { return start }
        return commit(start+delta/extent)
    }
    public static func restore(_ ratio:Double)->Double { ratio.isFinite && ratio>0 && ratio<1 ? ratio : 0.5 }
    public static func isHorizontal(width:Double,height:Double)->Bool { width>=840 && height>=600 && width>height }
}
