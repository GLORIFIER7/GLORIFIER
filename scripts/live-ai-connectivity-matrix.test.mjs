import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHttpsOrigin, parseModelIds, probeProvider } from "./live-ai-connectivity-matrix.mjs";

test("normalizes a clean HTTPS origin", () => {
  assert.equal(normalizeHttpsOrigin("https://example.com/"), "https://example.com");
});

test("rejects unsafe public origins", () => {
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com/app", "https://example.com?token=x", "https://example.com/#x"]) {
    assert.throws(() => normalizeHttpsOrigin(value));
  }
});

test("malformed provider catalogues do not become connected models", () => {
  assert.deepEqual(parseModelIds({ kind: "openai" }, null), []);
  assert.deepEqual(parseModelIds({ kind: "openai" }, { data: [{ name: "not-an-id" }] }), []);
});

test("Gemini model discovery filters embedding-only models", () => {
  const result = parseModelIds({ kind: "gemini" }, { models: [
    { name: "models/gemini-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-embedding", supportedGenerationMethods: ["embedContent"] },
  ] });
  assert.deepEqual(result, ["gemini-flash"]);
});

test("OpenAI-compatible and Anthropic catalogue IDs are parsed", () => {
  const payload = { data: [{ id: "m1" }, { id: 2 }, null, { id: "m2" }] };
  assert.deepEqual(parseModelIds({ kind: "openai" }, payload), ["m1", "m2"]);
  assert.deepEqual(parseModelIds({ kind: "anthropic" }, payload), ["m1", "m2"]);
});

test("authenticated catalogue access is not reported as live inference", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET" });
    return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), { status: 200 });
  };
  try {
    const result = await probeProvider({ id: "openai", key: "OPENAI_API_KEY", model: "OPENAI_MODEL", base: "OPENAI_BASE_URL",
      url: "https://api.openai.com/v1", defaultModel: "gpt-4o", kind: "openai" },
      { OPENAI_API_KEY: "test-secret", OPENAI_MODEL: "gpt-4o" }, false);
    assert.equal(result.status, "AUTHENTICATED_API_ACCESS");
    assert.equal(result.inference, "NOT_RUN");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
  } finally { globalThis.fetch = original; }
});

test("metered inference stores only a response digest", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET" });
    if ((init?.method || "GET") === "GET") return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "verified response" } }] }), { status: 200 });
  };
  try {
    const result = await probeProvider({ id: "openai", key: "OPENAI_API_KEY", model: "OPENAI_MODEL", base: "OPENAI_BASE_URL",
      url: "https://api.openai.com/v1", defaultModel: "gpt-4o", kind: "openai" },
      { OPENAI_API_KEY: "test-secret", OPENAI_MODEL: "gpt-4o" }, true);
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.inference, "VERIFIED");
    assert.equal(result.responseChars, "verified response".length);
    assert.match(result.responseSha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(result, "response"), false);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, "POST");
  } finally { globalThis.fetch = original; }
});
