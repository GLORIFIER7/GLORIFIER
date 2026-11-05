package io.glorifier.sdk

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class InteroperabilityFixtureTest {
    private val mapper = ObjectMapper()

    private fun repositoryRoot(): Path {
        var current: Path? = Path.of("").toAbsolutePath().normalize()
        while (current != null) {
            if (Files.isRegularFile(current.resolve("docs/architecture/interoperability-contract-fixtures.json"))) return current
            current = current.parent
        }
        error("Could not locate canonical interoperability fixtures.")
    }

    private fun cases(): Map<String, JsonNode> {
        val document = mapper.readTree(repositoryRoot().resolve("docs/architecture/interoperability-contract-fixtures.json").toFile())
        assertEquals("1.0.0", document.path("schemaVersion").asText())
        assertEquals("UTF-8", document.path("encoding").asText())
        assertTrue(document.path("rules").isArray && document.path("rules").size() > 0)
        val result = linkedMapOf<String, JsonNode>()
        document.path("cases").forEach { testCase ->
            val id = testCase.path("id").asText()
            assertTrue(id.isNotBlank())
            assertTrue(result.put(id, testCase) == null, "duplicate fixture case: $id")
        }
        return result
    }

    private fun roundTrip(value: JsonNode): JsonNode =
        mapper.readTree(String(mapper.writeValueAsBytes(value), StandardCharsets.UTF_8))

    @Test fun consumesCanonicalCrossLanguageFixturesWithoutCoercion() {
        val fixtures = cases()
        val unicode = fixtures.getValue("unicode-round-trip").path("payload")
        val decodedUnicode = roundTrip(unicode)
        assertEquals(unicode.path("message").asText(), decodedUnicode.path("message").asText())
        assertTrue(decodedUnicode.path("message").asText().contains("🌐"))
        assertTrue(decodedUnicode.path("message").asText().contains("你好"))

        val quantity = fixtures.getValue("large-quantity-string").path("payload")
        assertTrue(quantity.path("quantity").isTextual)
        assertEquals(quantity.path("quantity").asText(), roundTrip(quantity).path("quantity").asText())
        assertTrue(quantity.path("quantity").asText().matches(Regex("^(0|[1-9][0-9]*)$")))

        val nullable = fixtures.getValue("null-versus-absent").path("payload")
        assertTrue(nullable.has("presentNull") && nullable.get("presentNull").isNull)
        assertFalse(nullable.has("absentField"))
        assertEquals("", nullable.path("emptyString").asText())

        val nested = roundTrip(fixtures.getValue("nested-collections").path("payload"))
        assertTrue(nested.path("items")[0].path("enabled").booleanValue())
        assertEquals(0, nested.path("items")[0].path("count").intValue())
        assertFalse(nested.path("items")[1].path("enabled").booleanValue())
        assertEquals(2, nested.path("items")[1].path("count").intValue())

        val error = fixtures.getValue("stable-error-envelope").path("payload")
        assertFalse(error.path("ok").booleanValue())
        assertEquals("error", error.path("status").asText())
        assertEquals("REQUEST_BODY_TOO_LARGE", error.path("code").asText())
        assertTrue(error.path("error").isTextual)
    }
}
