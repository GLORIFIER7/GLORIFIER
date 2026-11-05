package io.glorifier.sdk;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class GlorifierNeuralClientTest {
    @Test void rejectsNonOriginAndUntrustedHttp() {
        assertThrows(IllegalArgumentException.class, () -> GlorifierNeuralClient.create("http://example.com", null));
        assertThrows(IllegalArgumentException.class, () -> GlorifierNeuralClient.create("https://example.com/path", null));
        assertThrows(IllegalArgumentException.class, () -> GlorifierNeuralClient.create("https://evil.example", null));
    }

    @Test void scopesBearerToTaskAndPreservesReadiness503() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<String> healthAuth = new AtomicReference<>("");
        AtomicReference<String> taskAuth = new AtomicReference<>("");
        server.createContext("/api/neural/health", exchange -> {
            healthAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = "{\"status\":\"ok\"}".getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/api/neural/ready", exchange -> {
            byte[] body = "{\"status\":\"NOT READY\"}".getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(503, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/api/neural/v1/tasks", exchange -> {
            exchange.getRequestBody().readAllBytes();
            taskAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = "{\"status\":\"accepted\"}".getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(202, body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            var client = new GlorifierNeuralClient(base, "caller-token", Set.of(), true, Duration.ofSeconds(3));
            assertEquals(200, client.health().statusCode());
            assertNull(healthAuth.get());
            assertEquals(503, client.ready().statusCode());
            assertEquals(202, client.submitTask(Map.of("task", "read-only check")).statusCode());
            assertEquals("Bearer caller-token", taskAuth.get());
        } finally { server.stop(0); }
    }

    @Test void rejectsUnknownTaskFieldsBeforeNetwork() {
        var client = new GlorifierNeuralClient("https://glorifier.glorifier.workers.dev", null, Set.of("https://glorifier.glorifier.workers.dev"), false, Duration.ofSeconds(5));
        assertThrows(IllegalArgumentException.class, () -> client.submitTask(Map.of("action", "read")));
        assertThrows(IllegalArgumentException.class, () -> client.submitTask(Map.of("task", "read", "extra", "no")));
    }
}