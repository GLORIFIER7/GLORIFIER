import XCTest
@testable import GlorifierNeural

final class GlorifierNeuralClientTests: XCTestCase {
    func testRejectsUntrustedOrigins() {
        XCTAssertThrowsError(try GlorifierNeuralClient(baseUrl: "http://example.com"))
        XCTAssertThrowsError(try GlorifierNeuralClient(baseUrl: "https://evil.example/path"))
    }

    func testRejectsInvalidAndUnknownTaskFields() throws {
        XCTAssertThrowsError(try GlorifierNeuralClient.validateTask(["action": "read"]))
        XCTAssertThrowsError(try GlorifierNeuralClient.validateTask(["task": "read", "extra": true]))
        XCTAssertThrowsError(try GlorifierNeuralClient.validateTask(["task": ""]))
        XCTAssertNoThrow(try GlorifierNeuralClient.validateTask(["task": "read only", "require_approval": true]))
    }

    func testTaskRequestByteLimitIsExported() {
        XCTAssertEqual(GlorifierNeuralClient.maxTaskBodyBytes, 65_536)
        XCTAssertEqual(GlorifierNeuralClient.maxResponseBodyBytes, 1_048_576)
    }
}