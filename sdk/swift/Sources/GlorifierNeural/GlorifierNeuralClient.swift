import Foundation

public struct NeuralApiResponse {
    public let statusCode: Int
    public let body: [String: Any]
    public let correlationId: String?
    public let retryAfter: String?
}

/// Native Swift 5.9+ client for GLORIFIER's versioned Neural HTTP/JSON API.
public final class GlorifierNeuralClient: NSObject, URLSessionTaskDelegate {
    public static let maxTaskBodyBytes = 65_536
    public static let maxResponseBodyBytes = 1_048_576
    private let origin: URL
    private let token: String?
    private let timeout: TimeInterval
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    public init(baseUrl: String, token: String? = nil, allowedOrigins: Set<String> = ["https://glorifier.glorifier.workers.dev"],
                allowLoopbackHttp: Bool = false, timeout: TimeInterval = 8) throws {
        guard timeout > 0 && timeout <= 60, let components = URLComponents(string: baseUrl),
              let scheme = components.scheme?.lowercased(), let host = components.host?.lowercased(),
              components.user == nil, components.password == nil, components.query == nil,
              components.fragment == nil, components.path.isEmpty || components.path == "/" else {
            throw ClientError.invalidOrigin
        }
        let local = scheme == "http" && allowLoopbackHttp && ["localhost", "127.0.0.1", "::1"].contains(host)
        guard scheme == "https" || local else { throw ClientError.invalidOrigin }
        let normalized = "\(scheme)://\(host)\(components.port.map { ":\($0)" } ?? "")"
        guard local || allowedOrigins.contains(normalized) else { throw ClientError.invalidOrigin }
        if let token, token.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || $0.value < 32 || $0.value == 127 }) {
            throw ClientError.invalidToken
        }
        self.origin = URL(string: normalized + "/")!
        self.token = token?.isEmpty == true ? nil : token
        self.timeout = timeout
        super.init()
    }

    public enum ClientError: Error { case invalidOrigin, invalidToken, missingToken, invalidTask, bodyTooLarge, invalidResponse }

    public func health() async throws -> NeuralApiResponse { try await request(method: "GET", path: "/api/neural/health") }
    public func ready() async throws -> NeuralApiResponse { try await request(method: "GET", path: "/api/neural/ready") }

    public func submitTask(_ task: [String: Any]) async throws -> NeuralApiResponse {
        guard token != nil else { throw ClientError.missingToken }
        try Self.validateTask(task)
        let bytes = try JSONSerialization.data(withJSONObject: task, options: [.sortedKeys, .fragmentsAllowed])
        guard bytes.count <= Self.maxTaskBodyBytes else { throw ClientError.bodyTooLarge }
        return try await request(method: "POST", path: "/api/neural/v1/tasks", body: bytes)
    }

    public static func validateTask(_ task: [String: Any]) throws {
        let allowed: Set<String> = ["task", "purpose", "require_approval", "action_class"]
        guard Set(task.keys).isSubset(of: allowed), let prompt = task["task"] as? String,
              !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, prompt.count <= 20_000 else {
            throw ClientError.invalidTask
        }
        if let purpose = task["purpose"] {
            guard let value = purpose as? String, !value.isEmpty, value.count <= 100 else { throw ClientError.invalidTask }
        }
        if let approval = task["require_approval"], !(approval is Bool) { throw ClientError.invalidTask }
        if let actionClass = task["action_class"] {
            guard let value = actionClass as? String, !value.isEmpty, value.count <= 64 else { throw ClientError.invalidTask }
        }
    }

    private func request(method: String, path: String, body: Data? = nil) async throws -> NeuralApiResponse {
        var request = URLRequest(url: URL(string: path, relativeTo: origin)!, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }
        if method == "POST" && path == "/api/neural/v1/tasks", let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: request)
        guard data.count <= Self.maxResponseBodyBytes else { throw ClientError.bodyTooLarge }
        guard let http = response as? HTTPURLResponse,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ClientError.invalidResponse
        }
        return NeuralApiResponse(statusCode: http.statusCode, body: object,
                                 correlationId: http.value(forHTTPHeaderField: "X-Correlation-ID"),
                                 retryAfter: http.value(forHTTPHeaderField: "Retry-After"))
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}