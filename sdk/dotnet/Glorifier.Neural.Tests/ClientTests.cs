using System.Net;
using System.Net.Sockets;
using System.Text;
using Glorifier.Neural;
using Xunit;

public sealed class ClientTests
{
    [Fact] public void RejectsUntrustedOriginsAndInvalidTask()
    {
        Assert.Throws<ArgumentException>(() => new GlorifierNeuralClient("http://example.com"));
        Assert.Throws<ArgumentException>(() => new GlorifierNeuralClient("https://evil.example"));
        using var client = new GlorifierNeuralClient("https://glorifier.glorifier.workers.dev");
        Assert.Throws<ArgumentException>(() => client.SubmitTaskAsync(new NeuralTaskRequest("")));
    }

    [Fact] public async Task HealthDoesNotForwardTokenAndReadiness503IsPreserved()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var observed = new List<string>();
        var server = Task.Run(async () =>
        {
            for (var i = 0; i < 2; i++)
            {
                using var socket = await listener.AcceptSocketAsync();
                using var stream = new NetworkStream(socket);
                var buffer = new byte[8192]; var read = await stream.ReadAsync(buffer);
                var headers = Encoding.ASCII.GetString(buffer, 0, read);
                observed.Add(headers);
                var ready = headers.Contains("/api/neural/ready");
                var body = ready ? """{"status":"NOT READY"}""" : """{"status":"ok"}""";
                var status = ready ? "503 Service Unavailable" : "200 OK";
                var bytes = Encoding.UTF8.GetBytes(body);
                var reply = Encoding.ASCII.GetBytes($"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");
                await stream.WriteAsync(reply); await stream.WriteAsync(bytes); await stream.FlushAsync();
            }
        });
        using (var client = new GlorifierNeuralClient($"http://127.0.0.1:{port}", "caller-token", allowLoopbackHttp: true))
        {
            Assert.Equal(HttpStatusCode.OK, (await client.HealthAsync()).StatusCode);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.ReadyAsync()).StatusCode);
        }
        await server; listener.Stop();
        Assert.DoesNotContain(observed, h => h.Contains("Authorization:", StringComparison.OrdinalIgnoreCase));
    }
}