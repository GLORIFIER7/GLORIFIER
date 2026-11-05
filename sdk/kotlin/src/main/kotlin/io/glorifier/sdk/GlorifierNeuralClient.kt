package io.glorifier.sdk

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** Idiomatic Kotlin/JVM client for the GLORIFIER Neural HTTP/JSON contract. */
data class NeuralApiResponse(val statusCode: Int, val body: JsonNode, val correlationId: String?, val retryAfter: String?)

data class NeuralTaskRequest(
    val task: String,
    val purpose: String? = null,
    val requireApproval: Boolean? = null,
    val actionClass: String? = null
)

class GlorifierNeuralClient(
    baseUrl: String,
    private val token: String? = null,
    allowedOrigins: Set<String> = setOf("https://glorifier.glorifier.workers.dev"),
    allowLoopbackHttp: Boolean = false,
    private val timeout: Duration = Duration.ofSeconds(8)
) {
    private val origin: URI = validateOrigin(baseUrl, allowedOrigins, allowLoopbackHttp)
    private val http = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(HttpClient.Redirect.NEVER).build()
    private val mapper = ObjectMapper()

    fun health(): NeuralApiResponse = request("GET", "/api/neural/health")
    fun ready(): NeuralApiResponse = request("GET", "/api/neural/ready")

    fun submitTask(task: NeuralTaskRequest): NeuralApiResponse {
        require(!token.isNullOrBlank()) { "caller bearer token is required for task submission" }
        validateTask(task)
        val bytes = mapper.writeValueAsBytes(task.toWireMap())
        require(bytes.size <= MAX_TASK_BODY_BYTES) { "task request body exceeds 65,536 bytes" }
        return request("POST", "/api/neural/v1/tasks", bytes)
    }

    private fun request(method: String, path: String, body: ByteArray? = null): NeuralApiResponse {
        val builder = HttpRequest.newBuilder(origin.resolve(path)).timeout(timeout).header("Accept", "application/json")
        if (body == null) builder.GET() else builder.header("Content-Type", "application/json; charset=utf-8").POST(HttpRequest.BodyPublishers.ofByteArray(body))
        if (method == "POST" && path == "/api/neural/v1/tasks") builder.header("Authorization", "Bearer $token")
        val response = http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
        val bytes = response.body().use { input ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= MAX_RESPONSE_BODY_BYTES) { "GLORIFIER response exceeds 1 MiB" }
                out.write(buffer, 0, count)
            }
            out.toByteArray()
        }
        val parsed = mapper.readTree(bytes)
        require(parsed != null && parsed.isObject) { "GLORIFIER response must be a JSON object" }
        return NeuralApiResponse(response.statusCode(), parsed, response.headers().firstValue("X-Correlation-ID").orElse(null), response.headers().firstValue("Retry-After").orElse(null))
    }

    private fun validateTask(task: NeuralTaskRequest) {
        require(task.task.isNotBlank() && task.task.length <= 20_000) { "task must contain 1-20,000 characters" }
        task.purpose?.let { require(it.isNotEmpty() && it.length <= 100) { "purpose must contain 1-100 characters" } }
        task.actionClass?.let { require(it.isNotEmpty() && it.length <= 64) { "action_class must contain 1-64 characters" } }
    }

    private fun NeuralTaskRequest.toWireMap(): Map<String, Any> = buildMap {
        put("task", task)
        purpose?.let { put("purpose", it) }
        requireApproval?.let { put("require_approval", it) }
        actionClass?.let { put("action_class", it) }
    }

    companion object {
        const val MAX_TASK_BODY_BYTES = 65_536
        const val MAX_RESPONSE_BODY_BYTES = 1_048_576
        private fun validateOrigin(raw: String, allowed: Set<String>, allowLoopback: Boolean): URI {
            val uri = try { URI(raw) } catch (e: Exception) { throw IllegalArgumentException("baseUrl must be a valid origin", e) }
            require(uri.isAbsolute && uri.host != null && uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")) { "baseUrl must be an origin only" }
            val local = uri.scheme.equals("http", true) && allowLoopback && (uri.host.equals("localhost", true) || uri.host == "127.0.0.1" || uri.host == "::1")
            require(uri.scheme.equals("https", true) || local) { "baseUrl must use HTTPS" }
            val normalized = "${uri.scheme.lowercase()}://${uri.rawAuthority.lowercase()}"
            require(local || normalized in allowed) { "baseUrl is not an exact allowed origin" }
            return URI(normalized)
        }
    }
}