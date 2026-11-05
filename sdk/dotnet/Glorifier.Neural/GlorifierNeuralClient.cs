using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Glorifier.Neural;

public sealed record NeuralTaskRequest(string Task, string? Purpose = null, bool? RequireApproval = null, string? ActionClass = null);
public sealed record NeuralApiResponse(HttpStatusCode StatusCode, JsonObject Body, string? CorrelationId, string? RetryAfter);

/// <summary>Native .NET 8 client for GLORIFIER's versioned Neural API.</summary>
public sealed class GlorifierNeuralClient : IDisposable
{
    public const int MaxTaskBodyBytes = 65_536;
    public const int MaxResponseBodyBytes = 1_048_576;
    private readonly Uri _origin;
    private readonly string? _token;
    private readonly HttpClient _http;

    public GlorifierNeuralClient(string baseUrl, string? token = null, IEnumerable<string>? allowedOrigins = null,
        bool allowLoopbackHttp = false, TimeSpan? timeout = null)
    {
        _origin = ValidateOrigin(baseUrl, allowedOrigins ?? ["https://glorifier.glorifier.workers.dev"], allowLoopbackHttp);
        if (token is not null && token.Any(c => char.IsControl(c) || char.IsWhiteSpace(c))) throw new ArgumentException("token must be a raw bearer token");
        _token = string.IsNullOrWhiteSpace(token) ? null : token;
        var requestTimeout = timeout ?? TimeSpan.FromSeconds(8);
        if (requestTimeout <= TimeSpan.Zero || requestTimeout > TimeSpan.FromSeconds(60)) throw new ArgumentOutOfRangeException(nameof(timeout));
        _http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = requestTimeout };
    }

    public Task<NeuralApiResponse> HealthAsync(CancellationToken cancellationToken = default) => SendAsync(HttpMethod.Get, "/api/neural/health", null, cancellationToken);
    public Task<NeuralApiResponse> ReadyAsync(CancellationToken cancellationToken = default) => SendAsync(HttpMethod.Get, "/api/neural/ready", null, cancellationToken);

    public Task<NeuralApiResponse> SubmitTaskAsync(NeuralTaskRequest task, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(task);
        ValidateTask(task);
        if (_token is null) throw new InvalidOperationException("caller bearer token is required for task submission");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object?>
        {
            ["task"] = task.Task,
            ["purpose"] = task.Purpose,
            ["require_approval"] = task.RequireApproval,
            ["action_class"] = task.ActionClass
        }.Where(kv => kv.Value is not null).ToDictionary(kv => kv.Key, kv => kv.Value));
        if (bytes.Length > MaxTaskBodyBytes) throw new ArgumentException("task request body exceeds 65,536 bytes");
        return SendAsync(HttpMethod.Post, "/api/neural/v1/tasks", bytes, cancellationToken);
    }

    private async Task<NeuralApiResponse> SendAsync(HttpMethod method, string path, byte[]? body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, new Uri(_origin, path));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (body is not null)
        {
            request.Content = new ByteArrayContent(body);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json") { CharSet = "utf-8" };
        }
        if (method == HttpMethod.Post && path == "/api/neural/v1/tasks" && _token is not null)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var count = await stream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (count == 0) break;
            if (output.Length + count > MaxResponseBodyBytes) throw new HttpRequestException("GLORIFIER response exceeds 1 MiB");
            output.Write(buffer, 0, count);
        }
        var parsed = JsonNode.Parse(output.ToArray()) as JsonObject ?? throw new HttpRequestException("GLORIFIER response must be a JSON object");
        return new NeuralApiResponse(response.StatusCode, parsed,
            response.Headers.TryGetValues("X-Correlation-ID", out var ids) ? ids.FirstOrDefault() : null,
            response.Headers.TryGetValues("Retry-After", out var retry) ? retry.FirstOrDefault() : null);
    }

    private static void ValidateTask(NeuralTaskRequest task)
    {
        if (string.IsNullOrWhiteSpace(task.Task) || task.Task.Length > 20_000) throw new ArgumentException("task must contain 1-20,000 characters");
        if (task.Purpose is not null && task.Purpose.Length is < 1 or > 100) throw new ArgumentException("purpose must contain 1-100 characters");
        if (task.ActionClass is not null && task.ActionClass.Length is < 1 or > 64) throw new ArgumentException("action_class must contain 1-64 characters");
    }

    private static Uri ValidateOrigin(string raw, IEnumerable<string> allowed, bool allowLoopback)
    {
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) || string.IsNullOrEmpty(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath is not ("" or "/"))
            throw new ArgumentException("baseUrl must be an origin only");
        var local = uri.Scheme == Uri.UriSchemeHttp && allowLoopback && (uri.Host == "localhost" || IPAddress.TryParse(uri.Host, out var ip) && IPAddress.IsLoopback(ip));
        if (uri.Scheme != Uri.UriSchemeHttps && !local) throw new ArgumentException("baseUrl must use HTTPS");
        var normalized = uri.GetLeftPart(UriPartial.Authority).TrimEnd('/').ToLowerInvariant();
        if (!local && !allowed.Select(x => x.TrimEnd('/').ToLowerInvariant()).Contains(normalized, StringComparer.Ordinal))
            throw new ArgumentException("baseUrl is not an exact allowed origin");
        return new Uri(normalized + "/");
    }

    public void Dispose() => _http.Dispose();
}