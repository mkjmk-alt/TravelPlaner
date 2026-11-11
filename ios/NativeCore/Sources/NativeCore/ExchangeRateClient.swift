import Foundation

public struct ExchangeRateSnapshot: Sendable {
    public let rates: [String: Double]
    public let updatedAt: Date
    public let fetchedAt: Date
    public let isStale: Bool

    public func krwPerUnit(for currency: String) -> Double? {
        let code = currency.uppercased()
        if code == "KRW" { return 1 }
        guard let currencyPerKRW = rates[code], currencyPerKRW.isFinite, currencyPerKRW > 0 else { return nil }
        return 1 / currencyPerKRW
    }
}

public enum ExchangeRateError: LocalizedError {
    case invalidResponse

    public var errorDescription: String? {
        "자동 환율을 불러오지 못했어요. 네트워크 연결을 확인해주세요."
    }
}

public actor ExchangeRateClient {
    public static let shared = ExchangeRateClient()

    private var cachedSnapshot: ExchangeRateSnapshot?
    private let cacheLifetime: TimeInterval = 6 * 60 * 60

    public func latestSnapshot(now: Date = Date()) async throws -> ExchangeRateSnapshot {
        if let cachedSnapshot, now.timeIntervalSince(cachedSnapshot.fetchedAt) < cacheLifetime {
            return cachedSnapshot
        }

        do {
            guard let url = URL(string: "https://open.er-api.com/v6/latest/KRW") else {
                throw ExchangeRateError.invalidResponse
            }
            var request = URLRequest(url: url)
            request.timeoutInterval = 12
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
                throw ExchangeRateError.invalidResponse
            }

            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let payload = try decoder.decode(Response.self, from: data)
            guard payload.result == "success", payload.baseCode == "KRW", let rates = payload.rates,
                  let wonRate = rates["KRW"], abs(wonRate - 1) < 0.000001 else {
                throw ExchangeRateError.invalidResponse
            }

            let updatedAt = Date(timeIntervalSince1970: TimeInterval(payload.timeLastUpdateUnix ?? Int(now.timeIntervalSince1970)))
            let snapshot = ExchangeRateSnapshot(rates: rates, updatedAt: updatedAt, fetchedAt: now, isStale: false)
            cachedSnapshot = snapshot
            return snapshot
        } catch {
            if Task.isCancelled { throw CancellationError() }
            if let cachedSnapshot {
                return ExchangeRateSnapshot(rates: cachedSnapshot.rates, updatedAt: cachedSnapshot.updatedAt, fetchedAt: cachedSnapshot.fetchedAt, isStale: true)
            }
            throw error
        }
    }

    private struct Response: Decodable {
        let result: String?
        let baseCode: String?
        let rates: [String: Double]?
        let timeLastUpdateUnix: Int?
    }
}
