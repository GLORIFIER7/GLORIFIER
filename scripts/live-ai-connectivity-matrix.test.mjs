import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateLiveAiEnvironment, verifyLiveAiEnvironment } from "./verify-live-ai-probe-environment.mjs";
import { isValidMcpToolResult, normalizeHttpsOrigin, parseModelIds, probeA2A, probeProvider } from "./live-ai-connectivity-matrix.mjs";

test("normalizes the single approved GLORIFIER Pages origin", () => {
  assert.equal(normalizeHttpsOrigin("https://glorifier.pages.dev/"), "https://glorifier.pages.dev");
});

test("rejects unapproved or unsafe public origins", () => {
  for (const value of ["http://glorifier.pages.dev", "https://example.com", "https://user:pass@glorifier.pages.dev", "https://glorifier.pages.dev/app", "https://glorifier.pages.dev?token=x", "https://glorifier.pages.dev/#x"]) {
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

test("MCP 2026-07-28 read-only tool success requires an explicit complete result", () => {
  assert.equal(isValidMcpToolResult({ result: { resultType: "complete", content: [{ type: "text", text: "repository read" }] } }), true);
  assert.equal(isValidMcpToolResult({ result: { resultType: "input_required", content: [{ type: "text", text: "approval required" }] } }), false);
  assert.equal(isValidMcpToolResult({ result: { resultType: "task", content: [{ type: "text", text: "task created" }] } }), false);
  assert.equal(isValidMcpToolResult({ result: { content: [{ type: "text", text: "ambiguous result" }] } }), false);
  assert.equal(isValidMcpToolResult({ result: { resultType: "complete", content: [], isError: false } }), false);
  assert.equal(isValidMcpToolResult({ result: { resultType: "complete", content: [{ type: "text" }], isError: true } }), false);
  assert.equal(isValidMcpToolResult({ error: { code: -32603, message: "failed" } }), false);
});

test("authenticated A2A v1 probe sends the required version header", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", headers: new Headers(init?.headers || {}) });
    if (String(url).endsWith("/.well-known/agent-card.json")) {
      return new Response(JSON.stringify({ supportedInterfaces: [{ protocolVersion: "1.0" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: "live-list-tasks", result: { tasks: [] } }), { status: 200 });
  };
  try {
    const result = await probeA2A("https://glorifier.pages.dev", "test-token");
    assert.equal(result.status, "VERIFIED");
    const rpc = calls.find((call) => call.url.endsWith("/api/a2a/v1"));
    assert.ok(rpc);
    assert.equal(rpc.headers.get("a2a-version"), "1.0");
    assert.equal(rpc.headers.get("authorization"), "Bearer test-token");
  } finally { globalThis.fetch = original; }
});

test("secret-bearing live probe is gated to main and a protected environment", () => {
  const workflow = readFileSync(".github/workflows/live-ai-connectivity.yml", "utf8");
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /vars\.LIVE_AI_PROBE_ENABLED == 'true'/);
  assert.match(workflow, /repository-level release switch/);
  assert.match(workflow, /preflight proves the configured reviewer and main-only rules/);
  assert.doesNotMatch(workflow, /environment adds an independent human-approval gate/);
  assert.match(workflow, /environment:\s*live-ai-probe/);
  assert.match(workflow, /ref:\s*\$\{\{\s*github\.sha\s*\}\}/,
    "secret-bearing probes must check out the exact workflow-dispatch SHA");
  assert.match(workflow, /preflight:/);
  assert.match(workflow, /needs:\s*preflight/);
  assert.match(workflow, /verify-live-ai-probe-environment\.mjs/);
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


test("live AI environment preflight requires explicit independent protection", () => {
  const validEnvironment = {
    name: "live-ai-probe",
    can_admins_bypass: false,
    protection_rules: [{
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [{ type: "User", reviewer: { id: 123 } }],
    }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
  const validPolicies = { total_count: 1, branch_policies: [{ id: 1, name: "main" }] };
  const valid = evaluateLiveAiEnvironment(validEnvironment, validPolicies);
  assert.equal(valid.ok, true);
  assert.equal(valid.reviewerCount, 1);
  assert.deepEqual(valid.branchAllowlist, ["main"]);

  assert.equal(evaluateLiveAiEnvironment(null, validPolicies).ok, false,
    "missing environments must fail closed instead of being auto-created");
  assert.equal(evaluateLiveAiEnvironment({
    ...validEnvironment,
    protection_rules: [],
  }, validPolicies).ok, false, "a reviewer gate is mandatory");
  assert.equal(evaluateLiveAiEnvironment({
    ...validEnvironment,
    protection_rules: [{ ...validEnvironment.protection_rules[0], reviewers: [] }],
  }, validPolicies).ok, false, "at least one independent reviewer is mandatory");
  assert.equal(evaluateLiveAiEnvironment({
    ...validEnvironment,
    protection_rules: [{ ...validEnvironment.protection_rules[0], prevent_self_review: false }],
  }, validPolicies).ok, false, "the requester must not approve their own run");
  assert.equal(evaluateLiveAiEnvironment({
    ...validEnvironment,
    can_admins_bypass: true,
  }, validPolicies).ok, false, "administrators must not bypass the environment reviewer gate");
  assert.equal(evaluateLiveAiEnvironment({
    ...validEnvironment,
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
  }, validPolicies).ok, false, "the policy must explicitly restrict deployment branches");
  assert.equal(evaluateLiveAiEnvironment(validEnvironment, {
    total_count: 2,
    branch_policies: [{ id: 1, name: "main" }, { id: 2, name: "release/*" }],
  }).ok, false, "only main may deploy to the live probe environment");
  assert.equal(evaluateLiveAiEnvironment(validEnvironment, {
    total_count: 101,
    branch_policies: [{ id: 1, name: "main" }],
  }).ok, false, "an incomplete paginated branch-policy response must fail closed");
});
test("live AI environment preflight encodes owner and repository path segments", async () => {
  const original = globalThis.fetch;
  const requests = [];
  const validEnvironment = {
    name: "live-ai-probe",
    can_admins_bypass: false,
    protection_rules: [{
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [{ type: "User", reviewer: { id: 123 } }],
    }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    requests.push(parsed.pathname);
    const payload = parsed.pathname.endsWith("/deployment-branch-policies")
      ? { total_count: 1, branch_policies: [{ id: 1, name: "main" }] }
      : validEnvironment;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await verifyLiveAiEnvironment({
      token: "test-token",
      repository: "owner#unsafe/repo?name",
      apiUrl: "https://api.github.com",
    });
    assert.equal(result.ok, true);
    assert.ok(requests.includes("/repos/owner%23unsafe/repo%3Fname/environments/live-ai-probe"));
    assert.ok(requests.includes("/repos/owner%23unsafe/repo%3Fname/environments/live-ai-probe/deployment-branch-policies"));
  } finally {
    globalThis.fetch = original;
  }
});
