import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MCP_VERSION = "2026-07-28";
const DEFAULT_ORIGIN = "https://glorifier.pages.dev";
const APPROVED_PUBLIC_ORIGINS = new Set([DEFAULT_ORIGIN]);
const TIMEOUT_MS = 15000;
const MAX_BYTES = 1000000;
const PROBE = "GLORIFIER live provider connectivity probe. Reply with a short confirmation.";
const PROVIDERS = [
  { id: "openai", key: "OPENAI_API_KEY", model: "OPENAI_MODEL", base: "OPENAI_BASE_URL", url: "https://api.openai.com/v1", defaultModel: "gpt-4o", kind: "openai" },
  { id: "gemini", key: "GEMINI_API_KEY", model: "GEMINI_MODEL", url: "https://generativelanguage.googleapis.com/v1beta", defaultModel: "gemini-2.5-flash", kind: "gemini" },
  { id: "anthropic", key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL", url: "https://api.anthropic.com/v1", defaultModel: "", kind: "anthropic" },
  { id: "nvidia-nemotron", key: "NVIDIA_API_KEY", model: "NVIDIA_MODEL", base: "NVIDIA_BASE_URL", url: "https://integrate.api.nvidia.com/v1", defaultModel: "nvidia/nemotron-3.5-super-vl-120b-a12b", kind: "openai", authorize: "NVIDIA_AUTHORIZED" },
];

export function normalizeHttpsOrigin(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Expected a clean public HTTPS origin.");
  }
  if (!APPROVED_PUBLIC_ORIGINS.has(url.origin)) {
    throw new Error("Origin is not approved for authenticated GLORIFIER probes.");
  }
  return url.origin;
}

export function parseModelIds(provider, payload) {
  if (!payload || typeof payload !== "object") return [];
  if (provider.kind === "gemini") {
    return (Array.isArray(payload.models) ? payload.models : [])
      .filter((m) => m && typeof m.name === "string"
        && (!Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent")))
      .map((m) => m.name.replace(/^models\//, ""));
  }
  return (Array.isArray(payload.data) ? payload.data : [])
    .filter((m) => m && typeof m.id === "string")
    .map((m) => m.id);
}

async function boundedText(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > MAX_BYTES) throw new Error("RESPONSE_TOO_LARGE");
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function requestJson(url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", ...(options.headers || {}) },
    });
    const text = await boundedText(response);
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* omit raw response */ }
    const id = ["x-request-id", "request-id", "x-goog-request-id", "anthropic-request-id"]
      .map((name) => response.headers.get(name))
      .find((value) => value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) || null;
    return { ok: response.ok, status: response.status, latencyMs: Date.now() - started, requestId: id, payload };
  } catch (error) {
    return { ok: false, status: null, latencyMs: Date.now() - started, requestId: null,
      errorCode: error && error.message === "RESPONSE_TOO_LARGE" ? "RESPONSE_TOO_LARGE"
        : error && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_OR_TLS_ERROR" };
  }
}

function baseFor(provider, env) {
  const url = new URL((provider.base && env[provider.base]) || provider.url);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Unsafe provider origin.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function headersFor(provider, key) {
  if (provider.kind === "gemini") return { "x-goog-api-key": key };
  if (provider.kind === "anthropic") return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  return { Authorization: "Bearer " + key };
}

function modelIdsUrl(provider, base) {
  if (provider.kind === "gemini") return base + "/models";
  if (provider.kind === "anthropic") return base + "/models?limit=50";
  return base + "/models";
}

function modelFor(provider, ids, env) {
  const selected = (env[provider.model] || provider.defaultModel || "").trim();
  if (selected && ids.includes(selected)) return selected;
  if (!selected && provider.id === "gemini") return ids.find((id) => /flash/i.test(id)) || null;
  return null;
}

function inferenceFor(provider, base, model, key) {
  const headers = { "Content-Type": "application/json", ...headersFor(provider, key) };
  if (provider.kind === "gemini") return {
    url: base + "/models/" + encodeURIComponent(model) + ":generateContent",
    init: { method: "POST", headers, body: JSON.stringify({
      contents: [{ parts: [{ text: PROBE }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    }) },
  };
  if (provider.kind === "anthropic") return {
    url: base + "/messages",
    init: { method: "POST", headers, body: JSON.stringify({
      model, max_tokens: 16, temperature: 0, messages: [{ role: "user", content: PROBE }],
    }) },
  };
  return {
    url: base + "/chat/completions",
    init: { method: "POST", headers, body: JSON.stringify({
      model, max_tokens: 16, temperature: 0, messages: [{ role: "user", content: PROBE }],
    }) },
  };
}

function textFrom(provider, payload) {
  if (!payload || typeof payload !== "object") return "";
  if (provider.kind === "gemini") return (payload.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (provider.kind === "anthropic") return (payload.content || []).map((p) => p.text || "").join("");
  const content = payload.choices?.[0]?.message?.content;
  return typeof content === "string" ? content
    : Array.isArray(content) ? content.map((p) => p.text || "").join("") : "";
}

function failure(result) {
  if (result.status === 401 || result.status === 403) return "AUTHENTICATION_REJECTED";
  if (result.status === 402 || result.status === 429) return "QUOTA_OR_RATE_LIMIT";
  if (result.status && result.status >= 500) return "UPSTREAM_FAILURE";
  return result.errorCode || "INVALID_OR_UNRECOGNIZED_RESPONSE";
}

export async function probeProvider(provider, env, allowMetered) {
  const key = (env[provider.key] || "").trim();
  if (!key) return { id: provider.id, status: "NOT_CONFIGURED", reason: provider.key + " is absent." };
  if (provider.authorize && env[provider.authorize] !== "true") {
    return { id: provider.id, status: "BLOCKED_BY_POLICY", reason: provider.authorize + "=true is required." };
  }
  let base;
  try { base = baseFor(provider, env); }
  catch { return { id: provider.id, status: "CONFIGURATION_ERROR", reason: "Invalid HTTPS provider base URL." }; }

  const catalog = await requestJson(modelIdsUrl(provider, base), { method: "GET", headers: headersFor(provider, key) });
  if (!catalog.ok) return {
    id: provider.id, status: "FAILED", stage: "authenticated-model-catalog", httpStatus: catalog.status,
    latencyMs: catalog.latencyMs, requestId: catalog.requestId, reason: failure(catalog),
  };
  const ids = parseModelIds(provider, catalog.payload);
  if (!ids.length) return { id: provider.id, status: "FAILED", stage: "authenticated-model-catalog", reason: "EMPTY_MODEL_CATALOG" };
  const result = {
    id: provider.id, status: "AUTHENTICATED_API_ACCESS", stage: "authenticated-model-catalog",
    httpStatus: catalog.status, latencyMs: catalog.latencyMs, requestId: catalog.requestId,
    modelCount: ids.length, inference: "NOT_RUN",
  };
  if (!allowMetered) {
    result.reason = "Inference disabled; no generation request was made.";
    return result;
  }
  const model = modelFor(provider, ids, env);
  if (!model) {
    result.reason = "No configured model was confirmed in this provider catalogue.";
    return result;
  }
  result.modelId = model;
  const call = inferenceFor(provider, base, model, key);
  const inference = await requestJson(call.url, call.init);
  result.inferenceHttpStatus = inference.status;
  result.inferenceLatencyMs = inference.latencyMs;
  result.inferenceRequestId = inference.requestId;
  if (!inference.ok) {
    result.status = "FAILED"; result.inference = "FAILED"; result.reason = failure(inference);
    return result;
  }
  const answer = textFrom(provider, inference.payload).trim();
  if (!answer) {
    result.status = "FAILED"; result.inference = "FAILED"; result.reason = "EMPTY_MODEL_RESPONSE";
    return result;
  }
  result.status = "VERIFIED";
  result.inference = "VERIFIED";
  result.responseChars = answer.length;
  result.responseSha256 = createHash("sha256").update(answer).digest("hex");
  return result;
}

function mcpHeaders(method, tool) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": MCP_VERSION,
    "Mcp-Method": method,
    ...(tool ? { "Mcp-Name": tool } : {}),
  };
}

function mcpMeta() {
  return {
    "io.modelcontextprotocol/protocolVersion": MCP_VERSION,
    "io.modelcontextprotocol/clientCapabilities": {},
  };
}

export function isValidMcpToolResult(payload) {
  const result = payload?.result;
  return Boolean(
    result
      && typeof result === "object"
      && !Array.isArray(result)
      && result.isError !== true
      && Array.isArray(result.content)
      && result.content.length > 0
      && result.content.every((item) => item && typeof item === "object" && typeof item.type === "string"),
  );
}

async function probeMcp(origin) {
  const endpoint = origin + "/mcp";
  const call = async (method, id, params, tool) => requestJson(endpoint, {
    method: "POST", headers: mcpHeaders(method, tool),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: mcpMeta() } }),
  });
  const discovery = await call("server/discover", "live-discover", {});
  if (!discovery.ok || discovery.payload?.error || !discovery.payload?.result) {
    return { status: "FAILED", stage: "server-discover", httpStatus: discovery.status, reason: failure(discovery) };
  }
  const listing = await call("tools/list", "live-tools", {});
  const tools = listing.payload?.result?.tools;
  if (!listing.ok || !Array.isArray(tools) || !tools.some((item) => item?.name === "github_get_repository")) {
    return { status: "PARTIALLY_VERIFIED", stage: "tools-list", httpStatus: listing.status };
  }
  const read = await call("tools/call", "live-repository-read", {
    name: "github_get_repository", arguments: {},
  }, "github_get_repository");
  if (!read.ok || read.payload?.error || !isValidMcpToolResult(read.payload)) {
    return { status: "PARTIALLY_VERIFIED", stage: "tools-call", httpStatus: read.status, reason: "MCP_TOOL_RESULT_INVALID" };
  }
  return { status: "VERIFIED", stage: "discover-tools-list-read-only-call", toolCount: tools.length,
    readOnlyRepositoryCall: true, latencyMs: discovery.latencyMs + listing.latencyMs + read.latencyMs };
}

export async function probeA2A(origin, token) {
  if (!token) return { status: "NOT_CONFIGURED", reason: "A live owner/internal-service bearer token is absent." };
  const card = await requestJson(origin + "/.well-known/agent-card.json");
  if (!card.ok || !Array.isArray(card.payload?.supportedInterfaces)) {
    return { status: "FAILED", stage: "agent-card", httpStatus: card.status, reason: failure(card) };
  }
  const rpc = await requestJson(origin + "/api/a2a/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json", "A2A-Version": "1.0", Authorization: "Bearer " + token },
    body: JSON.stringify({ jsonrpc: "2.0", id: "live-list-tasks", method: "ListTasks", params: { pageSize: 1 } }),
  });
  if (!rpc.ok || rpc.payload?.error || !rpc.payload?.result) {
    return { status: "FAILED", stage: "authenticated-list-tasks", httpStatus: rpc.status, reason: "A2A_LIST_TASKS_FAILED" };
  }
  return {
    status: "VERIFIED", stage: "agent-card-and-authenticated-list-tasks", httpStatus: rpc.status,
    protocolVersion: card.payload.supportedInterfaces[0]?.protocolVersion || null,
    taskCountReturned: Array.isArray(rpc.payload.result.tasks) ? rpc.payload.result.tasks.length : null,
    readOnlyProbe: true,
  };
}

async function probeRegistryAndCouncil(origin, token, allowMetered) {
  const response = await requestJson(origin + "/api/ai/registry");
  if (!response.ok || !Array.isArray(response.payload?.providers)) {
    return { registry: { status: "FAILED", httpStatus: response.status, reason: failure(response) },
      council: { status: "NOT_RUN", reason: "Provider registry unavailable." } };
  }
  const connected = response.payload.providers.filter((p) => p && p.status === "connected" && typeof p.id === "string")
    .map((p) => ({ id: p.id, models: Array.isArray(p.models) ? p.models.map((m) => typeof m === "string" ? m : m?.id).filter(Boolean) : [] }))
    .filter((p) => p.models.length);
  const registry = { status: connected.length ? "CONFIGURED_PROVIDERS_OBSERVED" : "NO_CONNECTED_PROVIDERS",
    httpStatus: response.status, connectedProviderCount: connected.length, providerIds: connected.map((p) => p.id) };
  if (!allowMetered) return { registry, council: { status: "NOT_RUN", reason: "Metered Council probe is disabled." } };
  if (!token) return { registry, council: { status: "NOT_CONFIGURED", reason: "Owner/internal-service bearer token absent." } };
  const participants = connected.slice(0, 2).map((p) => ({ providerId: p.id, modelId: p.models[0] }));
  if (new Set(participants.map((p) => p.providerId)).size < 2) {
    return { registry, council: { status: "NOT_READY", reason: "Two connected providers with advertised models are required." } };
  }
  const council = await requestJson(origin + "/api/ai/council", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      topic: "GLORIFIER AI Council live connectivity canary. Give one concise verification observation.",
      agenda: "GLORIFIER AI Council live connectivity canary. Give one concise verification observation.",
      participants, footprintCount: 0,
    }),
  });
  if (!council.ok || council.payload?.ok !== true) {
    return { registry, council: { status: "FAILED", httpStatus: council.status, reason: "AI_COUNCIL_CANARY_FAILED" } };
  }
  const count = Number(council.payload.participantCount || 0);
  const diversity = Number(council.payload.providerDiversity || 0);
  return { registry, council: { status: count >= 2 && diversity >= 2 ? "VERIFIED" : "PARTIALLY_VERIFIED",
    httpStatus: council.status, participantCount: count, providerDiversity: diversity,
    failureCount: Array.isArray(council.payload.failures) ? council.payload.failures.length : null } };
}

async function probeNeural(origin) {
  return Promise.all(["health", "ready"].map(async (name) => {
    const result = await requestJson(origin + "/api/neural/" + name);
    const healthy = result.ok && result.payload?.ok === true;
    return { name, status: healthy ? "VERIFIED" : result.status === 503 ? "DEGRADED_OR_NOT_CONFIGURED" : "FAILED",
      httpStatus: result.status, code: typeof result.payload?.code === "string" ? result.payload.code : null,
      latencyMs: result.latencyMs };
  }));
}

export async function buildConnectivityMatrix(env = process.env) {
  let origin;
  try { origin = normalizeHttpsOrigin(env.GLORIFIER_PUBLIC_BASE_URL || DEFAULT_ORIGIN); }
  catch { return { schemaVersion: "1.0.0", observedAt: new Date().toISOString(), overallStatus: "BLOCKED",
    error: "Invalid or unapproved public HTTPS origin.", checks: [] }; }
  const allowMetered = env.ALLOW_METERED_PROBES === "true";
  const token = (env.GLORIFIER_LIVE_PROBE_BEARER_TOKEN || "").trim();
  const providers = await Promise.all(PROVIDERS.map((p) => probeProvider(p, env, allowMetered)));
  const [mcp, a2a, routing, neural] = await Promise.all([
    probeMcp(origin), probeA2A(origin, token),
    probeRegistryAndCouncil(origin, token, allowMetered), probeNeural(origin),
  ]);
  const checks = [
    ...providers.map((p) => ({ category: "provider", ...p })),
    { category: "provider_registry", ...routing.registry },
    { category: "ai_council", ...routing.council },
    { category: "provider_failover", status: "NOT_VERIFIED",
      reason: "No owner-authenticated live failover canary exists; registry fallback has test evidence only." },
    { category: "a2a", ...a2a }, { category: "mcp", ...mcp },
    ...neural.map((n) => ({ category: "neural", ...n })),
  ];
  const verified = checks.filter((c) => c.status === "VERIFIED").length;
  const failed = checks.filter((c) => ["FAILED", "BLOCKED", "CONFIGURATION_ERROR"].includes(c.status)).length;
  return {
    schemaVersion: "1.0.0", observedAt: new Date().toISOString(),
    run: { id: env.GITHUB_RUN_ID || null, commit: env.GITHUB_SHA || null, ref: env.GITHUB_REF || null },
    target: origin, meteredInferenceEnabled: allowMetered,
    overallStatus: failed ? "DEGRADED" : verified ? "PARTIALLY_VERIFIED" : "NOT_VERIFIED",
    summary: { totalChecks: checks.length, verified, failed, notVerified: checks.length - verified - failed },
    checks,
    evidencePolicy: "No secrets, prompts, raw completions, or upstream error bodies are stored. Inference is represented by response character count and SHA-256 digest only.",
  };
}

async function main() {
  const report = await buildConnectivityMatrix(process.env);
  const output = process.env.CONNECTIVITY_MATRIX_OUTPUT || "live-ai-connectivity-matrix.json";
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(JSON.stringify({ outputPath: output, ...report }, null, 2) + "\n");
  if (report.overallStatus === "BLOCKED") process.exitCode = 2;
  else if (report.summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write("Live AI connectivity run failed safely: " + (error?.name || "Error") + "\n");
    process.exitCode = 1;
  });
}
