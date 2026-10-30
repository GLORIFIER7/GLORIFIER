# GLORIFIER Complete AI Ecosystem — Implementation Baseline

Status: **PARTIALLY VERIFIED — source audit and implementation plan only.**
Audit date: 2026-10-30
Repository: `GLORIFIER7/GLORIFIER`
Base branch: `main`

## Objective

Deliver one governed AI operating system with four integrated surfaces:

1. **Multi-provider model bridge** — a canonical provider/model catalog and stable API contract across hosted APIs, inference routers, and explicitly configured self-hosted runtimes.
2. **Personal AI interface** — a usable chat workspace with provider/model selection, conversation history, clear availability/cost indicators, and truthful execution metadata.
3. **Autonomous agent fleet** — specialist agents, bounded task decomposition, durable task state, cancellation, retries, and auditable handoffs.
4. **Intelligent capacity management** — quota-aware routing, provider circuit breakers, concurrency and budget controls, caching, queueing, and graceful degradation.

GLORIFIER is the governance and orchestration layer. It does not replace model providers, create provider entitlements, bypass rate limits, or manufacture compute capacity.

## Source audit observations

The following observations were made by reading the default-branch source and package manifest. They are not runtime or production verification.

| Area | Observed source evidence | Implementation consequence |
|---|---|---|
| Provider inventory | `src/lib/ai/provider-discovery.ts` declares OpenAI, Gemini, Anthropic, Meta, xAI, Mistral, DeepSeek, Groq, Together, Fireworks, OpenRouter, Hugging Face, LLMsRelay, NVIDIA, and Ollama. | Treat these as integration definitions, not proof of live access. |
| Execution registry | `src/lib/ai/registry.ts` builds Gemini and Anthropic adapters plus OpenAI-compatible adapters. Qwen is present in this registry but absent from the discovery definitions. | Reconcile discovery and execution from one canonical registry; reject entries without a compatible adapter. |
| Provider probes | Discovery generally checks provider model-list endpoints; NVIDIA has a separate inference probe. | Distinguish endpoint reachable, credential accepted, model listed, and inference completed. |
| Failover | Registry has bounded retry/cooldown logic and a governed-only policy. | Preserve explicit fallback policy; improve structured error classification, Retry-After handling, idempotency, and cross-instance state. |
| Agent tasks | `src/lib/agent-runtime.ts` stores tasks in a module-level `Map`. | Replace process-local task persistence before claiming durable or multi-instance execution. |
| Agent sessions | `src/lib/ai/agent-harness.ts` stores sessions in a module-level `Map`. | Define durable session storage, expiry, ownership, and concurrency semantics. |
| Personal AI UI | `src/components/AiBrokerConsole.tsx` has a fixed model selector and calls `/api/ai/broker-chat`. | Replace static choices with server-returned eligible models and explicit selection/fallback UX. |
| Runtime target | `README.md` and `src/worker.ts` describe Cloudflare Workers as the target, while the README says the migration remains incomplete. | Keep the Worker-native route boundary; do not assume Node-only modules or infinite daemons run in Workers. |

## Target architecture

```text
Personal AI Workspace
  | conversations, model selection, streaming, usage
  v
GLORIFIER API / Control Plane
  | identity, policy, capability checks, audit, approvals
  +--> Canonical Model Registry
  |      +--> Native provider adapters
  |      +--> OpenAI-compatible adapters
  |      +--> Inference-router adapters
  |      +--> Explicit self-hosted adapters
  |
  +--> Capacity and Routing Engine
  |      +--> health / quota / cooldown / concurrency
  |      +--> budget / cache / retry / queue decisions
  |
  +--> Agent Orchestrator
         +--> bounded specialist tasks
         +--> durable queue and task state
         +--> cancellation / idempotency / dead-letter handling

Persistent state + evidence + observability
  |
GEAS policy and human approval remain authoritative at every privileged boundary.
```

## Canonical provider contract

Every adapter must implement a versioned, provider-neutral contract with:

- Provider ID, model ID, endpoint class, and adapter version.
- Declared capabilities backed by model-specific evidence: chat, streaming, tool calling, structured output, image/audio input, and context limits.
- Explicit configuration, authentication, authorization, availability, quota, and inference states.
- Normalized request/response, usage, finish reason, tool-call, and error schemas.
- Request deadline, bounded payload size, cancellation, correlation ID, and secret-redacted diagnostics.
- No implicit provider or model substitution when the user selected a specific model, unless the request policy explicitly permits governed fallback.

A model-list endpoint returning HTTP 200 is not an inference test. A configured key is not proof of authorization. A provider-level feature is not proof that every model supports that feature.

## Personal AI workspace requirements

- Server-provided provider/model catalog; show only eligible options as selectable.
- Clear states: available, unconfigured, authentication failed, quota exhausted, rate limited, degraded, and not verified.
- User-selected provider/model preference retained per conversation.
- Explicit fallback notice identifying the actual provider/model used.
- Streaming where the selected adapter and runtime support it.
- Conversation history with tenant/owner isolation, retention controls, and deletion semantics.
- Usage and estimated cost only when returned by trusted provider usage/billing data; mark estimates as estimates.
- Accessible responsive UI, keyboard operation, and reduced-motion support.
- No provider secrets in browser code, URLs, local storage, telemetry, or client-visible error payloads.

## Autonomous agent fleet requirements

- Agent cards describe capabilities and policy scopes; they must not hard-code runtime status as active.
- Durable task lifecycle: queued, running, waiting-approval, completed, failed, cancelled, and expired.
- Durable session state with ownership, expiry, context limits, and recovery after worker restart.
- Bounded decomposition, concurrency, retries, deadlines, and output size.
- Idempotency keys for retried task submissions and side-effect boundaries.
- Cancellation and dead-letter handling.
- Tool access is capability-scoped and default-deny for privileged actions.
- Human approval remains mandatory for merge, deployment, secret mutation, purchases, transfers, signing, minting, and other irreversible or consequential actions.
- Agent output is not evidence until independently checked against a source or test.

## Intelligent capacity management

The scheduler should rank eligible provider/model candidates using:

1. Explicit user preference and task capability requirements.
2. Current inference availability and authentication/authorization state.
3. Quota/rate-limit state and Retry-After.
4. Latency and recent reliability observations.
5. Request deadline, concurrency, and queue depth.
6. User/team budget and provider cost metadata where available.
7. Data handling and trust policy.

Required behavior:

- Respect provider rate limits, billing limits, terms, and access controls.
- Never rotate credentials, create accounts, or evade quotas to obtain capacity.
- Use bounded exponential backoff with jitter only for retryable errors.
- Do not retry non-idempotent tool actions unless idempotency is guaranteed.
- Persist/share circuit-breaker state across runtime instances where the selected storage supports it.
- Cache only policy-approved, non-sensitive results with explicit keys, TTL, and invalidation.
- Queue or report unavailable when no eligible capacity remains; never synthesize success.
- Expose capacity, usage, error, latency, queue-age, and cost metrics with provenance.

## Persistence and runtime decisions

- Keep Cloudflare Workers as the intended public execution/control-plane target, subject to route-by-route compatibility tests.
- Evaluate Cloudflare Queues, Workflows, and Durable Objects for asynchronous work, durable coordination, and shared rate/circuit state; select each primitive only after a concrete design and tests.
- Use one explicitly declared authoritative database for each data domain. Do not assume Neon and Supabase are synchronized and do not introduce unreviewed dual writes.
- Prefer existing approved Supabase operational infrastructure where schema, RLS, credentials, and runtime access are verified. Neon quota/access constraints remain a separate blocker until rechecked.
- Keep self-hosted inference opt-in and explicitly configured. A local Ollama definition does not prove a model runtime exists or is reachable from the Worker.

## Delivery sequence and acceptance gates

### Phase 0 — Baseline and contracts
- [ ] Reconcile provider discovery and execution inventories.
- [ ] Inventory all chat, provider, agent, task, and session routes.
- [ ] Define canonical schemas and evidence states.
- [ ] Map current GEAS policies and approval boundaries.
- [ ] Record runtime and database ownership decisions.

### Phase 1 — Provider bridge
- [ ] Add failing tests before behavior changes.
- [ ] Unify provider definitions and adapter registration.
- [ ] Normalize errors, usage, capabilities, and model metadata.
- [ ] Add provider/model-specific contract tests.
- [ ] Test timeout, malformed response, 401/403, 402, 429, 5xx, cancellation, and redaction.
- [ ] Prove real inference only through approved, bounded probes; otherwise report NOT VERIFIED.

### Phase 2 — Personal AI
- [ ] Add server-backed model catalog and capability filtering.
- [ ] Implement honest provider/model selection and fallback disclosure.
- [ ] Add conversation persistence, ownership, retention, and streaming contracts.
- [ ] Add accessibility and reduced-motion checks.
- [ ] Verify client bundle and network responses contain no provider secrets.

### Phase 3 — Agent fleet
- [ ] Replace process-local task/session state with durable storage/queue contracts.
- [ ] Add idempotency, cancellation, bounded concurrency, and recovery tests.
- [ ] Derive agent status from observed runtime evidence.
- [ ] Verify approval enforcement at every privileged tool/action boundary.

### Phase 4 — Capacity engine
- [ ] Add structured quota/error classification and Retry-After support.
- [ ] Add bounded routing, shared circuit state, concurrency, and deadline controls.
- [ ] Add budget/cost visibility and privacy-safe caching.
- [ ] Verify no hidden fallback, quota bypass, or duplicate billable side effects.

### Phase 5 — Operational assurance
- [ ] Run focused tests and the repository's full required CI suite.
- [ ] Run security, dependency, secret-redaction, and API contract checks.
- [ ] Verify staging integrations with explicitly authorized credentials.
- [ ] Publish timestamped, scoped evidence for each provider, model, route, and agent runtime.
- [ ] Require human review before merge or production release.

## Definition of done

The ecosystem is complete only when each enabled provider/model has current evidence, the UI displays the actual selected model and truthful execution status, agent tasks survive runtime restarts, capacity controls behave under deterministic failure tests, security boundaries pass, and release gates are green.

A growing provider count is not the objective. Reliable eligible capacity, truthful failover, durable orchestration, and owner-controlled execution are the objective.

## Scope and safety

This branch contains an implementation baseline document only. It does not modify runtime code, secrets, provider accounts, databases, billing, or production infrastructure. No deployment, merge, purchase, transfer, signing, or irreversible action is authorized by this plan.
