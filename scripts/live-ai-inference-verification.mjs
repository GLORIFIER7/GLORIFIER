import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { evaluateRepositoryProviderAttestation, normalizeRepositoryProviderEndpoint } from "../src/lib/ai/repository-contributor-policy.mjs";

const PROBE = "Return exactly this token and nothing else: GLORIFIER_RUNTIME_PROBE_OK";
const MAX_OUTPUT_TOKENS = 16;
const MAX_PROBE_BYTES = 512;
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1_000_000;

const PROVIDERS = Object.freeze({
  openai: { name: "OpenAI GPT", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", baseEnv: "OPENAI_BASE_URL", defaultBase: "https://api.openai.com/v1", kind: "openai" },
  gemini: { name: "Google Gemini", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultBase: "https://generativelanguage.googleapis.com/v1beta", kind: "gemini" },
  anthropic: { name: "Anthropic Claude", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", defaultBase: "https://api.anthropic.com/v1", kind: "anthropic" },
  meta: { name: "Meta Llama (local runtime)", keyEnv: "META_API_KEY", modelEnv: "META_MODEL", baseEnv: "META_BASE_URL", kind: "openai-local" },
  qwen: { name: "Alibaba Qwen", keyEnv: "QWEN_API_KEY", modelEnv: "QWEN_MODEL", baseEnv: "QWEN_BASE_URL", kind: "openai" },
  xai: { name: "xAI Grok", keyEnv: "XAI_API_KEY", modelEnv: "XAI_MODEL", baseEnv: "XAI_BASE_URL", defaultBase: "https://api.x.ai/v1", kind: "openai" },
  mistral: { name: "Mistral AI", keyEnv: "MISTRAL_API_KEY", modelEnv: "MISTRAL_MODEL", baseEnv: "MISTRAL_BASE_URL", defaultBase: "https://api.mistral.ai/v1", kind: "openai" },
  deepseek: { name: "DeepSeek", keyEnv: "DEEPSEEK_API_KEY", modelEnv: "DEEPSEEK_MODEL", baseEnv: "DEEPSEEK_BASE_URL", defaultBase: "https://api.deepseek.com/v1", kind: "openai" },
  groq: { name: "Groq", keyEnv: "GROQ_API_KEY", modelEnv: "GROQ_MODEL", baseEnv: "GROQ_BASE_URL", defaultBase: "https://api.groq.com/openai/v1", kind: "openai" },
  together: { name: "Together AI", keyEnv: "TOGETHER_API_KEY", modelEnv: "TOGETHER_MODEL", baseEnv: "TOGETHER_BASE_URL", defaultBase: "https://api.together.ai/v1", kind: "openai" },
  fireworks: { name: "Fireworks AI", keyEnv: "FIREWORKS_API_KEY", modelEnv: "FIREWORKS_MODEL", baseEnv: "FIREWORKS_BASE_URL", defaultBase: "https://api.fireworks.ai/inference/v1", kind: "openai" },
  openrouter: { name: "OpenRouter", keyEnv: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_MODEL", baseEnv: "OPENROUTER_BASE_URL", defaultBase: "https://openrouter.ai/api/v1", kind: "openai" },
  huggingface: { name: "Hugging Face Inference Providers", keyEnv: "HF_TOKEN", modelEnv: "HF_MODEL", baseEnv: "HF_BASE_URL", defaultBase: "https://router.huggingface.co/v1", kind: "openai" },
  llmsrelay: { name: "LLMsRelay", keyEnv: "LLMSRELAY_API_KEY", modelEnv: "LLMSRELAY_MODEL", baseEnv: "LLMSRELAY_BASE_URL", defaultBase: "https://api.llmsrelay.com/v1", kind: "openai" },
  nvidia: { name: "NVIDIA NIM / Nemotron", keyEnv: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL", baseEnv: "NVIDIA_BASE_URL", defaultBase: "https://integrate.api.nvidia.com/v1", kind: "openai" },
  ollama: { name: "Ollama (local runtime)", keyEnv: "OLLAMA_AUTH_TOKEN", modelEnv: "OLLAMA_MODEL", baseEnv: "OLLAMA_BASE_URL", defaultBase: "http://localhost:11434", kind: "ollama" },
});

export const LIVE_AI_PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

function parseAttestations(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 48_000) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).map(([providerId, value]) => ({ ...value, providerId }));
    }
  } catch {
    return [];
  }
  return [];
}

function safeBaseUrl(providerId, config, env, attestation) {
  const configured = config.baseEnv ? String(env[config.baseEnv] || "").trim() : "";
  const candidate = configured || config.defaultBase || "";
  if (!candidate) throw new Error("provider-endpoint-not-configured");
  const normalized = normalizeRepositoryProviderEndpoint(providerId, candidate);
  if (!normalized) throw new Error("provider-endpoint-not-allowed");
  const attested = normalizeRepositoryProviderEndpoint(providerId, attestation.endpointUrl);
  if (!attested || normalized !== attested) throw new Error("provider-endpoint-does-not-match-attestation");
  return normalized;
}

function safeRequestUrl(base, suffix) {
  const url = new URL(base);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const queryIndex = suffix.indexOf("?");
  const pathnameSuffix = queryIndex >= 0 ? suffix.slice(0, queryIndex) : suffix;
  url.pathname = url.pathname.replace(/\/+$/, "") + pathnameSuffix;
  if (queryIndex >= 0) url.search = suffix.slice(queryIndex);
  return url.toString();
}

async function readBounded(response) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("response-too-large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error("response-too-large");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

async function requestJson(fetchImpl, url, init = {}) {
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", ...(init.headers || {}) },
    });
    const raw = await readBounded(response);
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* raw provider output is never retained */ }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: null, payload: null,
      reason: error?.message === "response-too-large" ? "RESPONSE_TOO_LARGE"
        : error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_OR_TLS_ERROR" };
  }
}

function headersFor(config, key) {
  if (config.kind === "gemini") return { "x-goog-api-key": key };
  if (config.kind === "anthropic") return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  return key ? { Authorization: "Bearer " + key } : {};
}

function modelIdsFor(config, payload) {
  if (!payload || typeof payload !== "object") return [];
  if (config.kind === "gemini") {
    return (Array.isArray(payload.models) ? payload.models : [])
      .filter((entry) => entry && typeof entry.name === "string"
        && (!Array.isArray(entry.supportedGenerationMethods) || entry.supportedGenerationMethods.includes("generateContent")))
      .map((entry) => entry.name.replace(/^models\//, ""));
  }
  if (config.kind === "ollama") {
    return (Array.isArray(payload.models) ? payload.models : [])
      .map((entry) => typeof entry?.name === "string" ? entry.name : "")
      .filter(Boolean);
  }
  return (Array.isArray(payload.data) ? payload.data : [])
    .map((entry) => typeof entry?.id === "string" ? entry.id : "")
    .filter(Boolean);
}

function modelCatalogUrl(config, base) {
  if (config.kind === "ollama") return safeRequestUrl(base, "/api/tags");
  if (config.kind === "anthropic") return safeRequestUrl(base, "/models?limit=100");
  return safeRequestUrl(base, "/models");
}

function inferenceRequest(providerId, config, base, model, key, maxTokens) {
  const headers = { "Content-Type": "application/json", ...headersFor(config, key) };
  if (config.kind === "gemini") {
    return {
      url: safeRequestUrl(base, "/models/" + encodeURIComponent(model) + ":generateContent"),
      init: { method: "POST", headers, body: JSON.stringify({
        contents: [{ parts: [{ text: PROBE }] }],
        generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
      }) },
    };
  }
  if (config.kind === "anthropic") {
    return {
      url: safeRequestUrl(base, "/messages"),
      init: { method: "POST", headers, body: JSON.stringify({
        model, max_tokens: maxTokens, temperature: 0,
        messages: [{ role: "user", content: PROBE }],
      }) },
    };
  }
  if (config.kind === "ollama") {
    return {
      url: safeRequestUrl(base, "/api/chat"),
      init: { method: "POST", headers, body: JSON.stringify({
        model, stream: false, messages: [{ role: "user", content: PROBE }],
        options: { temperature: 0, num_predict: maxTokens },
      }) },
    };
  }
  return {
    url: safeRequestUrl(base, "/chat/completions"),
    init: { method: "POST", headers, body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0, stream: false,
      messages: [{ role: "user", content: PROBE }],
      ...(providerId === "openrouter" ? { provider: { allow_fallbacks: false } } : {}),
    }) },
  };
}

function responseText(config, payload) {
  if (!payload || typeof payload !== "object") return "";
  if (config.kind === "gemini") {
    return (payload.candidates?.[0]?.content?.parts || [])
      .map((part) => typeof part?.text === "string" ? part.text : "").join("");
  }
  if (config.kind === "anthropic") {
    return (payload.content || [])
      .map((part) => typeof part?.text === "string" ? part.text : "").join("");
  }
  if (config.kind === "ollama") {
    return typeof payload.message?.content === "string" ? payload.message.content
      : typeof payload.response === "string" ? payload.response : "";
  }
  const content = payload.choices?.[0]?.message?.content;
  return typeof content === "string" ? content
    : Array.isArray(content) ? content.map((part) => typeof part?.text === "string" ? part.text : "").join("") : "";
}

function failureReason(response) {
  if (response.status === 401 || response.status === 403) return "AUTHENTICATION_REJECTED";
  if (response.status === 402 || response.status === 429) return "QUOTA_OR_RATE_LIMIT";
  if (response.status && response.status >= 500) return "UPSTREAM_FAILURE";
  return response.reason || "INVALID_OR_UNRECOGNIZED_RESPONSE";
}

function findAttestation(providerId, attestations) {
  return attestations.find((entry) => entry && typeof entry === "object" && entry.providerId === providerId);
}

export async function verifySelectedLiveAiProvider(providerId, env = process.env, options = {}) {
  const config = PROVIDERS[providerId];
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const observedAt = now.toISOString();
  if (!config) return { status: "BLOCKED_BY_POLICY", providerId: String(providerId), observedAt, reason: "unsupported-provider" };
  if (env.ALLOW_FREE_INFERENCE !== "true") {
    return { status: "BLOCKED_BY_POLICY", providerId, providerName: config.name, observedAt, reason: "explicit-free-inference-opt-in-required" };
  }

  const attestations = parseAttestations(env.GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON);
  const attestation = findAttestation(providerId, attestations);
  const evaluation = evaluateRepositoryProviderAttestation(providerId, attestation, observedAt);
  if (!evaluation.eligible) {
    return { status: "BLOCKED_BY_POLICY", providerId, providerName: config.name, observedAt,
      reason: "free-only-owner-attestation-rejected", policyReasons: evaluation.reasons };
  }

  let base;
  try { base = safeBaseUrl(providerId, config, env, attestation); }
  catch (error) {
    return { status: "BLOCKED_BY_POLICY", providerId, providerName: config.name, observedAt,
      reason: error instanceof Error ? error.message : "provider-endpoint-invalid" };
  }

  const key = String(env[config.keyEnv] || "").trim();
  if (!key && providerId !== "meta" && providerId !== "ollama") {
    return { status: "NOT_CONFIGURED", providerId, providerName: config.name, observedAt, reason: "provider-secret-missing" };
  }
  const model = String(env[config.modelEnv] || attestation.modelId || "").trim();
  if (!model || model !== evaluation.modelId) {
    return { status: "BLOCKED_BY_POLICY", providerId, providerName: config.name, observedAt,
      reason: "configured-model-does-not-match-owner-attestation" };
  }
  const maxTokens = Math.min(MAX_OUTPUT_TOKENS, evaluation.limits.maxOutputTokens);
  const probeBytes = Buffer.byteLength(PROBE, "utf8");
  if (probeBytes > MAX_PROBE_BYTES || maxTokens < 1) {
    return { status: "BLOCKED_BY_POLICY", providerId, providerName: config.name, observedAt,
      reason: "probe-exceeds-owner-attested-request-limits" };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const headers = headersFor(config, key);
  const catalogStarted = Date.now();
  const catalog = await requestJson(fetchImpl, modelCatalogUrl(config, base), { method: "GET", headers });
  const catalogLatencyMs = Date.now() - catalogStarted;
  if (!catalog.ok) {
    return { status: "FAILED", providerId, providerName: config.name, observedAt,
      stage: "authenticated-model-catalog", httpStatus: catalog.status, latencyMs: catalogLatencyMs,
      reason: failureReason(catalog), inferenceExecuted: false };
  }
  const modelIds = modelIdsFor(config, catalog.payload);
  if (!modelIds.includes(model)) {
    return { status: "BLOCKED_BY_POLICY", providerId, providerName: config.name, observedAt,
      stage: "authenticated-model-catalog", reason: "attested-model-not-returned-by-provider-catalog",
      inferenceExecuted: false, discoveredModelCount: modelIds.length };
  }

  const call = inferenceRequest(providerId, config, base, model, key, maxTokens);
  const inferenceStarted = Date.now();
  const inference = await requestJson(fetchImpl, call.url, call.init);
  const inferenceLatencyMs = Date.now() - inferenceStarted;
  if (!inference.ok) {
    return { status: "FAILED", providerId, providerName: config.name, observedAt,
      stage: "live-inference", httpStatus: inference.status, latencyMs: inferenceLatencyMs,
      reason: failureReason(inference), inferenceExecuted: true };
  }
  const answer = responseText(config, inference.payload).trim();
  if (answer !== "GLORIFIER_RUNTIME_PROBE_OK") {
    return { status: "FAILED", providerId, providerName: config.name, observedAt,
      stage: "live-inference", httpStatus: inference.status, latencyMs: inferenceLatencyMs,
      reason: "verification-marker-not-returned", inferenceExecuted: true,
      responseChars: answer.length };
  }

  return {
    status: "VERIFIED", providerId, providerName: config.name, observedAt,
    modelId: model, inferenceExecuted: true, expectedMarkerReturned: true,
    catalogHttpStatus: catalog.status, inferenceHttpStatus: inference.status,
    catalogLatencyMs, inferenceLatencyMs, maxOutputTokens: maxTokens,
    responseChars: answer.length,
    responseSha256: createHash("sha256").update(answer).digest("hex"),
    usage: inference.payload?.usage && typeof inference.payload.usage === "object"
      ? Object.fromEntries(["input_tokens", "output_tokens", "total_tokens", "prompt_tokens", "completion_tokens"]
          .filter((key) => Number.isSafeInteger(inference.payload.usage[key]) && inference.payload.usage[key] >= 0)
          .map((key) => [key, inference.payload.usage[key]]))
      : null,
    responseText: "[omitted]",
  };
}

async function main() {
  const required = {
    event: process.env.GITHUB_EVENT_NAME === "workflow_dispatch",
    branch: process.env.GITHUB_REF === "refs/heads/main",
    owner: process.env.GITHUB_ACTOR_ID === "32674233",
    firstAttempt: process.env.GITHUB_RUN_ATTEMPT === "1",
    selectedProvider: typeof process.env.LIVE_AI_PROVIDER === "string" && Boolean(process.env.LIVE_AI_PROVIDER),
    explicitOptIn: process.env.ALLOW_FREE_INFERENCE === "true",
    releaseSwitch: process.env.LIVE_AI_PROBE_ENABLED === "true",
  };
  if (Object.values(required).some((value) => !value)) {
    process.stdout.write(JSON.stringify({ status: "BLOCKED_BY_POLICY", reason: "owner-main-first-attempt-manual-free-opt-in-required", required }, null, 2) + "\n");
    process.exitCode = 2;
    return;
  }
  const report = await verifySelectedLiveAiProvider(process.env.LIVE_AI_PROVIDER, process.env);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.status !== "VERIFIED") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Live AI inference verification failed safely; no provider response or credential was printed.\n");
    process.exitCode = 1;
  });
}
