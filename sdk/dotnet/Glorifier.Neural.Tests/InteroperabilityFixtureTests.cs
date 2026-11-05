using System.Text;
using System.Text.Json;
using Xunit;

public sealed class InteroperabilityFixtureTests
{
    private static string RepositoryRoot()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "docs", "architecture", "interoperability-contract-fixtures.json")))
                return current.FullName;
            current = current.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate canonical interoperability fixtures.");
    }

    private static Dictionary<string, JsonElement> LoadCases()
    {
        var path = Path.Combine(RepositoryRoot(), "docs", "architecture", "interoperability-contract-fixtures.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
        var root = document.RootElement;
        Assert.Equal("1.0.0", root.GetProperty("schemaVersion").GetString());
        Assert.Equal("UTF-8", root.GetProperty("encoding").GetString());
        Assert.True(root.GetProperty("rules").GetArrayLength() > 0);
        var cases = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var testCase in root.GetProperty("cases").EnumerateArray())
        {
            var id = testCase.GetProperty("id").GetString();
            Assert.False(string.IsNullOrWhiteSpace(id));
            Assert.True(cases.TryAdd(id!, testCase.Clone()), $"duplicate fixture case: {id}");
        }
        return cases;
    }

    private static JsonDocument RoundTrip(JsonElement payload) =>
        JsonDocument.Parse(JsonSerializer.SerializeToUtf8Bytes(payload));

    [Fact] public void ConsumesCanonicalCrossLanguageFixturesWithoutCoercion()
    {
        var fixtures = LoadCases();
        var unicode = fixtures["unicode-round-trip"].GetProperty("payload");
        using (var decoded = RoundTrip(unicode))
        {
            var message = decoded.RootElement.GetProperty("message").GetString()!;
            Assert.Equal(unicode.GetProperty("message").GetString(), message);
            Assert.Contains("🌐", message);
            Assert.Contains("你好", message);
        }

        var quantity = fixtures["large-quantity-string"].GetProperty("payload");
        Assert.Equal(JsonValueKind.String, quantity.GetProperty("quantity").ValueKind);
        using (var decoded = RoundTrip(quantity))
            Assert.Equal(quantity.GetProperty("quantity").GetString(), decoded.RootElement.GetProperty("quantity").GetString());

        var nullable = fixtures["null-versus-absent"].GetProperty("payload");
        Assert.Equal(JsonValueKind.Null, nullable.GetProperty("presentNull").ValueKind);
        Assert.False(nullable.TryGetProperty("absentField", out _));
        Assert.Equal("", nullable.GetProperty("emptyString").GetString());

        using (var nested = RoundTrip(fixtures["nested-collections"].GetProperty("payload")))
        {
            var items = nested.RootElement.GetProperty("items");
            Assert.True(items[0].GetProperty("enabled").GetBoolean());
            Assert.Equal(0, items[0].GetProperty("count").GetInt32());
            Assert.False(items[1].GetProperty("enabled").GetBoolean());
            Assert.Equal(2, items[1].GetProperty("count").GetInt32());
        }

        var error = fixtures["stable-error-envelope"].GetProperty("payload");
        Assert.False(error.GetProperty("ok").GetBoolean());
        Assert.Equal("error", error.GetProperty("status").GetString());
        Assert.Equal("REQUEST_BODY_TOO_LARGE", error.GetProperty("code").GetString());
        Assert.Equal(JsonValueKind.String, error.GetProperty("error").ValueKind);
    }
}
