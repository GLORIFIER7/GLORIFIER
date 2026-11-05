import Foundation
import XCTest

final class InteroperabilityFixtureTests: XCTestCase {
    private func repositoryRoot() throws -> URL {
        var directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        while true {
            let candidate = directory.appendingPathComponent("docs/architecture/interoperability-contract-fixtures.json")
            if FileManager.default.fileExists(atPath: candidate.path) { return directory }
            let parent = directory.deletingLastPathComponent()
            if parent.path == directory.path {
                throw NSError(domain: "InteroperabilityFixtureTests", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "Could not locate canonical interoperability fixtures."])
            }
            directory = parent
        }
    }

    private func loadCases() throws -> [String: [String: Any]] {
        let path = try repositoryRoot().appendingPathComponent("docs/architecture/interoperability-contract-fixtures.json")
        let data = try Data(contentsOf: path)
        let document = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(document["schemaVersion"] as? String, "1.0.0")
        XCTAssertEqual(document["encoding"] as? String, "UTF-8")
        XCTAssertFalse((document["rules"] as? [Any] ?? []).isEmpty)
        let entries = try XCTUnwrap(document["cases"] as? [[String: Any]])
        var mapped: [String: [String: Any]] = [:]
        for entry in entries {
            let id = try XCTUnwrap(entry["id"] as? String)
            XCTAssertFalse(id.isEmpty)
            XCTAssertNil(mapped[id], "duplicate fixture case: \(id)")
            mapped[id] = entry
        }
        return mapped
    }

    private func roundTrip(_ payload: [String: Any]) throws -> [String: Any] {
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testConsumesCanonicalCrossLanguageFixturesWithoutCoercion() throws {
        let fixtures = try loadCases()
        let unicode = try XCTUnwrap(fixtures["unicode-round-trip"]?["payload"] as? [String: Any])
        let unicodeDecoded = try roundTrip(unicode)
        let message = try XCTUnwrap(unicodeDecoded["message"] as? String)
        XCTAssertEqual(message, unicode["message"] as? String)
        XCTAssertTrue(message.contains("🌐"))
        XCTAssertTrue(message.contains("你好"))

        let quantity = try XCTUnwrap(fixtures["large-quantity-string"]?["payload"] as? [String: Any])
        let quantityText = try XCTUnwrap(quantity["quantity"] as? String, "quantity must remain a string")
        XCTAssertTrue(quantityText.range(of: "^(0|[1-9][0-9]*)$", options: .regularExpression) != nil)
        XCTAssertEqual(try roundTrip(quantity)["quantity"] as? String, quantityText)

        let nullable = try XCTUnwrap(fixtures["null-versus-absent"]?["payload"] as? [String: Any])
        XCTAssertTrue(nullable.keys.contains("presentNull"))
        XCTAssertTrue(nullable["presentNull"] is NSNull)
        XCTAssertFalse(nullable.keys.contains("absentField"))
        XCTAssertEqual(nullable["emptyString"] as? String, "")

        let nestedPayload = try XCTUnwrap(fixtures["nested-collections"]?["payload"] as? [String: Any])
        let nested = try roundTrip(nestedPayload)
        let items = try XCTUnwrap(nested["items"] as? [[String: Any]])
        XCTAssertEqual(items[0]["enabled"] as? Bool, true)
        XCTAssertEqual(items[0]["count"] as? Int, 0)
        XCTAssertEqual(items[1]["enabled"] as? Bool, false)
        XCTAssertEqual(items[1]["count"] as? Int, 2)

        let error = try XCTUnwrap(fixtures["stable-error-envelope"]?["payload"] as? [String: Any])
        XCTAssertEqual(error["ok"] as? Bool, false)
        XCTAssertEqual(error["status"] as? String, "error")
        XCTAssertEqual(error["code"] as? String, "REQUEST_BODY_TOO_LARGE")
        XCTAssertNotNil(error["error"] as? String)
    }
}
