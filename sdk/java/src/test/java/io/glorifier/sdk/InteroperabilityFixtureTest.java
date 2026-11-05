package io.glorifier.sdk;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class InteroperabilityFixtureTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static Path repositoryRoot() throws IOException {
        Path current = Paths.get("").toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isRegularFile(current.resolve("docs/architecture/interoperability-contract-fixtures.json"))) return current;
            current = current.getParent();
        }
        throw new IOException("Could not locate canonical interoperability fixtures.");
    }

    private static Map<String, JsonNode> loadCases() throws IOException {
        JsonNode document = JSON.readTree(repositoryRoot().resolve("docs/architecture/interoperability-contract-fixtures.json").toFile());
        assertEquals("1.0.0", document.path("schemaVersion").asText());
        assertEquals("UTF-8", document.path("encoding").asText());
        assertTrue(document.path("rules").isArray() && !document.path("rules").isEmpty());
        assertTrue(document.path("cases").isArray());
        Map<String, JsonNode> cases = new HashMap<>();
        for (JsonNode testCase : document.path("cases")) {
            String id = testCase.path("id").asText();
            assertFalse(id.isBlank());
            assertNull(cases.put(id, testCase), "duplicate fixture case: " + id);
        }
        return cases;
    }

    private static JsonNode roundTrip(JsonNode payload) throws IOException {
        byte[] wire = JSON.writeValueAsBytes(payload);
        return JSON.readTree(new String(wire, StandardCharsets.UTF_8));
    }

    @Test void consumesCanonicalCrossLanguageFixturesWithoutCoercion() throws Exception {
        Map<String, JsonNode> cases = loadCases();
        JsonNode unicode = cases.get("unicode-round-trip").path("payload");
        JsonNode decodedUnicode = roundTrip(unicode);
        assertEquals(unicode.path("message").asText(), decodedUnicode.path("message").asText());
        assertTrue(decodedUnicode.path("message").asText().contains("🌐"));
        assertTrue(decodedUnicode.path("message").asText().contains("你好"));

        JsonNode quantity = cases.get("large-quantity-string").path("payload");
        assertTrue(quantity.path("quantity").isTextual());
        assertEquals(quantity.path("quantity").asText(), roundTrip(quantity).path("quantity").asText());
        assertTrue(quantity.path("quantity").asText().matches("^(0|[1-9][0-9]*)$"));

        JsonNode nullable = cases.get("null-versus-absent").path("payload");
        assertTrue(nullable.has("presentNull") && nullable.get("presentNull").isNull());
        assertFalse(nullable.has("absentField"));
        assertEquals("", nullable.path("emptyString").asText());

        JsonNode nested = roundTrip(cases.get("nested-collections").path("payload"));
        assertTrue(nested.path("items").get(0).path("enabled").booleanValue());
        assertEquals(0, nested.path("items").get(0).path("count").intValue());
        assertFalse(nested.path("items").get(1).path("enabled").booleanValue());
        assertEquals(2, nested.path("items").get(1).path("count").intValue());

        JsonNode error = cases.get("stable-error-envelope").path("payload");
        assertFalse(error.path("ok").booleanValue());
        assertEquals("error", error.path("status").asText());
        assertEquals("REQUEST_BODY_TOO_LARGE", error.path("code").asText());
        assertTrue(error.path("error").isTextual());
    }
}
