package io.glorifier.sdk

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertFailsWith

class GlorifierNeuralClientTest {
    @Test fun rejectsUntrustedOriginsAndTaskFields() {
        assertFailsWith<IllegalArgumentException> { GlorifierNeuralClient("http://example.com") }
        assertFailsWith<IllegalArgumentException> { GlorifierNeuralClient("https://evil.example") }
        val client = GlorifierNeuralClient("https://glorifier.glorifier.workers.dev")
        assertFailsWith<IllegalArgumentException> { client.submitTask(NeuralTaskRequest("read", purpose = "x".repeat(101))) }
    }

    @Test fun scopesCredentialsAndPreservesReadinessStatus() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val healthAuth = AtomicReference<String?>()
        val taskAuth = AtomicReference<String?>()
        server.createContext("/api/neural/health") { exchange ->
            healthAuth.set(exchange.requestHeaders.getFirst("Authorization"))
            val bytes = """{"status":"ok"}""".toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/api/neural/ready") { exchange ->
            val bytes = """{"status":"NOT READY"}""".toByteArray()
            exchange.sendResponseHeaders(503, bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/api/neural/v1/tasks") { exchange ->
            exchange.requestBody.use { it.readBytes() }
            taskAuth.set(exchange.requestHeaders.getFirst("Authorization"))
            val bytes = """{"status":"accepted"}""".toByteArray()
            exchange.sendResponseHeaders(202, bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val client = GlorifierNeuralClient("http://127.0.0.1:${server.address.port}", "caller-token", allowLoopbackHttp = true, timeout = Duration.ofSeconds(3))
            assertEquals(200, client.health().statusCode)
            assertNull(healthAuth.get())
            assertEquals(503, client.ready().statusCode)
            assertEquals(202, client.submitTask(NeuralTaskRequest("read only")).statusCode)
            assertEquals("Bearer caller-token", taskAuth.get())
        } finally { server.stop(0) }
    }
}