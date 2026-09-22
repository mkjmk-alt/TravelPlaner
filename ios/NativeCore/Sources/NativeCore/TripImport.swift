import Foundation

public struct ImportCandidate {
    public let sourceHash: String
    public let sourceBytes: Data
    public let trip: TripDocument
    public let warnings: [String]
}
public enum ImportDisposition { case newTrip, alreadyImported, identicalExisting, conflict, previouslyDeleted }
public struct ImportPreview {
    public let candidate: ImportCandidate
    public let disposition: ImportDisposition
    public let targetID: String
    public let expectedExistingHash: String?
    public let expectedReceiptHash: String?
}
public enum ImportDecision { case confirmNew, keepBoth, restoreDeleted }
public struct ImportOutcome {
    public let tripID: String
    public let created: Bool
    public let alreadyImported: Bool
}
public enum BackupError: LocalizedError {
    case invalid(String), stale, decision, tooLarge, tooDeep
    public var errorDescription: String? {
        switch self {
        case .invalid(let reason): return "백업을 가져오지 않았습니다. \(reason)"
        case .stale: return "내용이 바뀌어 다시 확인이 필요합니다. 파일을 다시 선택해주세요."
        case .decision: return "기존 여행을 보존하기 위해 가져오기 방법을 확인해주세요."
        case .tooLarge: return "백업은 최대 20 MiB까지 가져올 수 있습니다. 데이터를 변경하지 않았습니다."
        case .tooDeep: return "백업의 중첩 구조가 너무 깊습니다. 데이터를 변경하지 않았습니다."
        }
    }
}
