import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LIVE_AI_PROVIDER_IDS,
  verifySelectedLiveAiProvider,
} from "./live-ai-inference-verification.mjs";

const workflow = readFileSync(new URL("../.github/workflows/live-ai-inference-verification.yml", import.meta.url), "utf8");
const now = new Date("2026-11-17T00:00:00.000Z");
const attestation = {
  providerId: "openai",
  mode: "promotional-credits",
  status: "owner-attested",
  evidenceUrl: "https://platform.openai.com/docs/guides/rate-limits",
  attestedAt: "2026-11-17T00:00:00.000Z",
  expiresAt: "2026-11-17T01:00:00.000Z",
  monthlyPaidSpendLimitUsd: 0,
  autoTopUpEnabled: false,
  payAsYouGoEnabled: false,
  paidFallbackEnabled: false,
  monthlyInvoicingEnabled: false,
  billingEnabled: false,
  requestsPerMinute: 2,
  requestsPerDay: 2,
  maxTokensPerDay: 128,
  maxInputTokens: 1024,
  maxOutputTokens: 16,
  endpointUrl: "https://api.openai.com/v1",
  modelId: "gpt-4o",
  remainingFreeCreditsUsd: 1,
};

test("live inference selector includes every registered GLORIFIER provider", () => {
  const expected = [
    "openai", "gemini", "anthropic", "meta", "qwen", "xai", "mistral",
    "deepseek", "groq", "together", "fireworks", "openrouter",
    "huggingface", "llmsrelay", "nvidia", "ollama",
  ];
  assert.deepEqual(LIVE_AI_PROVIDER_IDS, expected);
  for (const providerId of expected) {
    assert.ok(workflow.includes("          - " + providerId), "workflow dispatch must offer " + providerId);
  }
});

test("secret-bearing workflow is owner-only, main-only, protected, and manually opt-in", () => {
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.actor_id == '32674233'/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /vars\.LIVE_AI_PROBE_ENABLED == 'true'/);
  assert.match(workflow, /allow_free_inference:[\s\S]*?default: false/);
  assert.match(workflow, /environment: live-ai-probe/);
  assert.match(workflow, /verify-live-ai-probe-environment\.mjs/);
  assert.match(workflow, /GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON/);
  assert.match(workflow, /permissions:\n      contents: read/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /pull-requests: write|contents: write|gh pr merge|--auto/);
});

test("inference is denied before network access unless the owner explicitly opts in", async () => {
  let calls = 0;
  const result = await verifySelectedLiveAiProvider("openai", {
    ALLOW_FREE_INFERENCE: "false",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([attestation]),
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-4o",
  }, { now, fetchImpl: async () => { calls += 1; throw new Error("must not call network"); } });

  assert.equal(result.status, "BLOCKED_BY_POLICY");
  assert.equal(result.reason, "explicit-free-inference-opt-in-required");
  assert.equal(calls, 0);
});

test("missing or non-zero-budget owner attestations deny inference before network access", async () => {
  let calls = 0;
  const unsafe = { ...attestation, monthlyPaidSpendLimitUsd: 0.01 };
  const result = await verifySelectedLiveAiProvider("openai", {
    ALLOW_FREE_INFERENCE: "true",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([unsafe]),
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-4o",
  }, { now, fetchImpl: async () => { calls += 1; throw new Error("must not call network"); } });

  assert.equal(result.status, "BLOCKED_BY_POLICY");
  assert.equal(calls, 0);
});

test("one explicitly authorized provider is verified with a bounded request and redacted evidence", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === "GET") {
      return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: "GLORIFIER_RUNTIME_PROBE_OK" } }],
      usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
    }), { status: 200 });
  };

  const result = await verifySelectedLiveAiProvider("openai", {
    ALLOW_FREE_INFERENCE: "true",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([attestation]),
    OPENAI_API_KEY: "test-provider-secret",
    OPENAI_MODEL: "gpt-4o",
  }, { now, fetchImpl });

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.providerId, "openai");
  assert.equal(result.modelId, "gpt-4o");
  assert.equal(result.inferenceExecuted, true);
  assert.equal(calls.length, 2, "one model-catalogue read and one generation request only");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.redirect, "error");
  const body = JSON.parse(calls[1].init.body);
  assert.ok(body.max_tokens <= 16);
  assert.equal(body.messages[0].content, "Return exactly this token and nothing else: GLORIFIER_RUNTIME_PROBE_OK");
  assert.equal(JSON.stringify(result).includes("test-provider-secret"), false);
  assert.equal(JSON.stringify(result).includes("GLORIFIER_RUNTIME_PROBE_OK"), false);
  assert.match(result.responseSha256, /^[a-f0-9]{64}$/);
});

test("Gemini uses its native generateContent contract and exact attested endpoint", async () => {
  const geminiAttestation = {
    ...attestation,
    providerId: "gemini",
    mode: "vendor-free-tier",
    evidenceUrl: "https://ai.google.dev/gemini-api/docs/rate-limits",
    billingEnabled: false,
    modelFree: true,
    endpointUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelId: "gemini-3.1-flash-lite",
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return init.method === "GET"
      ? new Response(JSON.stringify({ models: [{ name: "models/gemini-3.1-flash-lite", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "GLORIFIER_RUNTIME_PROBE_OK" }] } }] }), { status: 200 });
  };
  const result = await verifySelectedLiveAiProvider("gemini", {
    ALLOW_FREE_INFERENCE: "true",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([geminiAttestation]),
    GEMINI_API_KEY: "test-gemini-secret",
    GEMINI_MODEL: "gemini-3.1-flash-lite",
  }, { now, fetchImpl });

  assert.equal(result.status, "VERIFIED");
  assert.match(calls[1].url, /:generateContent$/);
  assert.equal(new Headers(calls[1].init.headers).get("x-goog-api-key"), "test-gemini-secret");
  assert.equal(JSON.stringify(result).includes("test-gemini-secret"), false);
});

test("Anthropic model catalogue preserves its query string and uses the Messages API", async () => {
  const anthropicAttestation = {
    ...attestation,
    providerId: "anthropic",
    evidenceUrl: "https://platform.claude.com/docs/en/api/rate-limits",
    endpointUrl: "https://api.anthropic.com/v1",
    modelId: "claude-sonnet-4-5",
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return init.method === "GET"
      ? new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4-5" }] }), { status: 200 })
      : new Response(JSON.stringify({ content: [{ type: "text", text: "GLORIFIER_RUNTIME_PROBE_OK" }] }), { status: 200 });
  };
  const result = await verifySelectedLiveAiProvider("anthropic", {
    ALLOW_FREE_INFERENCE: "true",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([anthropicAttestation]),
    ANTHROPIC_API_KEY: "test-anthropic-secret",
    ANTHROPIC_MODEL: "claude-sonnet-4-5",
  }, { now, fetchImpl });

  assert.equal(result.status, "VERIFIED");
  assert.equal(new URL(calls[0].url).searchParams.get("limit"), "100");
  assert.ok(calls[1].url.endsWith("/messages"));
  assert.equal(new Headers(calls[1].init.headers).get("anthropic-version"), "2023-06-01");
  assert.equal(JSON.stringify(result).includes("test-anthropic-secret"), false);
});

test("configured endpoint and exact model must match the current attestation", async () => {
  let calls = 0;
  const result = await verifySelectedLiveAiProvider("openai", {
    ALLOW_FREE_INFERENCE: "true",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([attestation]),
    OPENAI_API_KEY: "test-key",
    OPENAI_BASE_URL: "https://example.com/v1",
    OPENAI_MODEL: "gpt-4o",
  }, { now, fetchImpl: async () => { calls += 1; throw new Error("must not call network"); } });

  assert.equal(result.status, "BLOCKED_BY_POLICY");
  assert.equal(calls, 0);
});

test("provider errors never trigger a second provider or a hidden paid fallback", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    if (init.method === "GET") return new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: "quota exhausted" } }), { status: 402 });
  };
  const result = await verifySelectedLiveAiProvider("openai", {
    ALLOW_FREE_INFERENCE: "true",
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([attestation]),
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-4o",
  }, { now, fetchImpl });

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "QUOTA_OR_RATE_LIMIT");
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);
});
