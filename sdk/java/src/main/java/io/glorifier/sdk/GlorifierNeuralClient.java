package io.glorifier.sdk;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

/** Native Java 17+ client for GLORIFIER's versioned Neural HTTP/JSON API. */
public final class GlorifierNeuralClient {
    public static final int MAX_TASK_BODY_BYTES = 65_536;
    public static final int MAX_RESPONSE_BODY_BYTES = 1_048_576;
    private static final int MAX_TASK_CHARACTERS = 20_000;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> TASK_FIELDS = Set.of("task", "purpose", "require_approval", "action_class");
    private final URI origin;
    private final String token;
    private final Duration timeout;
    private final HttpClient http;

    public record ApiResponse(int statusCode, JsonNode body, String correlationId, String retryAfter) {}

    public GlorifierNeuralClient(String baseUrl, String token, Set<String> allowedOrigins, boolean allowLoopbackHttp, Duration timeout) {
        this.origin = validateOrigin(baseUrl, allowedOrigins, allowLoopbackHttp);
        if (token != null && token.chars().anyMatch(c -> c <= 32 || c == 127)) throw new IllegalArgumentException("token must be a raw bearer token");
        this.token = token == null || token.isBlank() ? null : token;
        this.timeout = timeout == null ? Duration.ofSeconds(8) : timeout;
        if (this.timeout.isZero() || this.timeout.isNegative() || this.timeout.compareTo(Duration.ofSeconds(60)) > 0) throw new IllegalArgumentException("timeout must be between 0 and 60 seconds");
        this.http = HttpClient.newBuilder().connectTimeout(this.timeout).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    public static GlorifierNeuralClient create(String baseUrl, String token) {
        return new GlorifierNeuralClient(baseUrl, token, Set.of("https://glorifier.glorifier.workers.dev"), false, Duration.ofSeconds(8));
    }

    private static URI validateOrigin(String raw, Set<String> allowedOrigins, boolean allowLoopbackHttp) {
        final URI uri;
        try { uri = URI.create(raw); } catch (RuntimeException e) { throw new IllegalArgumentException("baseUrl must be a valid origin", e); }
        if (!uri.isAbsolute() || uri.getHost() == null || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || (uri.getRawPath() != null && !uri.getRawPath().isEmpty() && !uri.getRawPath().equals("/"))) throw new IllegalArgumentException("baseUrl must be an origin without credentials, path, query, or fragment");
        boolean localHttp = "http".equalsIgnoreCase(uri.getScheme()) && allowLoopbackHttp && (uri.getHost().equalsIgnoreCase("localhost") || uri.getHost().equals("127.0.0.1") || uri.getHost().equals("::1"));
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !localHttp) throw new IllegalArgumentException("baseUrl must use HTTPS");
        String normalized = uri.getScheme().toLowerCase() + "://" + uri.getAuthority().toLowerCase();
        if (!localHttp && (allowedOrigins == null || !allowedOrigins.contains(normalized))) throw new IllegalArgumentException("baseUrl is not an exact allowed origin");
        return URI.create(normalized);
    }

    public ApiResponse health() throws IOException, InterruptedException { return request("GET", "/api/neural/health", null); }
    public ApiResponse ready() throws IOException, InterruptedException { return request("GET", "/api/neural/ready", null); }
    public ApiResponse submitTask(Map<String, ?> task) throws IOException, InterruptedException {
        validateTask(task);
        if (token == null) throw new IllegalStateException("caller bearer token is required for task submission");
        byte[] body;
        try { body = JSON.writeValueAsBytes(task); } catch (Exception e) { throw new IllegalArgumentException("task must be valid JSON", e); }
        if (body.length > MAX_TASK_BODY_BYTES) throw new IllegalArgumentException("task request body exceeds 65,536 bytes");
        return request("POST", "/api/neural/v1/tasks", body);
    }

    private ApiResponse request(String method, String path, byte[] body) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(timeout).header("Accept", "application/json");
        if (body != null) builder.header("Content-Type", "application/json; charset=utf-8").POST(HttpRequest.BodyPublishers.ofByteArray(body));
        else builder.GET();
        if ("POST".equals(method) && "/api/neural/v1/tasks".equals(path) && token != null) builder.header("Authorization", "Bearer " + token);
        HttpResponse<InputStream> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
        byte[] bytes;
        try (InputStream stream = response.body(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int total = 0; int count;
            while ((count = stream.read(buffer)) != -1) {
                total += count;
                if (total > MAX_RESPONSE_BODY_BYTES) throw new IOException("GLORIFIER response exceeds 1 MiB");
                out.write(buffer, 0, count);
            }
            bytes = out.toByteArray();
        }
        JsonNode parsed;
        try { parsed = JSON.readTree(bytes); } catch (Exception e) { throw new IOException("GLORIFIER returned invalid JSON", e); }
        if (parsed == null || !parsed.isObject()) throw new IOException("GLORIFIER response must be a JSON object");
        return new ApiResponse(response.statusCode(), parsed, response.headers().firstValue("X-Correlation-ID").orElse(null), response.headers().firstValue("Retry-After").orElse(null));
    }

    private static void validateTask(Map<String, ?> task) {
        if (task == null || !TASK_FIELDS.containsAll(task.keySet())) throw new IllegalArgumentException("task contains unknown fields");
        Object prompt = task.get("task");
        if (!(prompt instanceof String s) || s.isBlank() || s.length() > MAX_TASK_CHARACTERS) throw new IllegalArgumentException("task must be a non-empty string of at most 20,000 characters");
        if (task.containsKey("purpose") && (!(task.get("purpose") instanceof String p) || p.isEmpty() || p.length() > 100)) throw new IllegalArgumentException("purpose must contain 1-100 characters");
        if (task.containsKey("require_approval") && !(task.get("require_approval") instanceof Boolean)) throw new IllegalArgumentException("require_approval must be boolean");
        if (task.containsKey("action_class") && (!(task.get("action_class") instanceof String a) || a.isEmpty() || a.length() > 64)) throw new IllegalArgumentException("action_class must contain 1-64 characters");
    }
}