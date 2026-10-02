# GLORIFIER Architecture Watch — 2026-10-02

## Executive assessment

The architecture remains directionally sound: provider-neutral orchestration, explicit authorization, evidence boundaries, and truthful provider failure are still good foundations. The highest-value changes are interoperability and state-model refinements, not replacing the Governance Kernel.

## Findings

### 1. MCP has materially changed

**Evidence:** MCP 2026-07-28 is the current stable revision. The specification moved the core toward stateless operation, added an extensions framework, cacheable list results, and a formal deprecation policy. The MCP Tasks extension defines durable asynchronous task handles with `tasks/get`, `tasks/update`, and `tasks/cancel`.

Sources:
- https://modelcontextprotocol.io/specification
- https://tasks.extensions.modelcontextprotocol.io/
- https://plan.modelcontextprotocol.io/matrix

**Affected GLORIFIER components:** Governed A2A Runtime, Mediator, Provider/Capability Registry, task lifecycle.

**Proposed change:** Treat MCP as a versioned interoperability adapter rather than assuming one session model. Add protocol-version negotiation and capability/extension metadata to the GLORIFIER protocol registry. Map MCP Tasks to GLORIFIER task states without making MCP the internal source of truth.

**Risk:** Medium. Incorrect protocol-version assumptions can cause interoperability failures or unsafe fallback behavior.

**Verification required:** Conformance tests against MCP 2026-07-28, including stateless requests, extension discovery, task lifecycle, authorization, and negative tests for unsupported versions.

**Status:** Recommendation only. No runtime protocol behavior changed in this watch.

### 2. MCP Skills creates a useful provider-neutral workflow artifact

**Evidence:** The MCP Skills extension allows servers to publish structured workflow instructions alongside tools/resources/prompts.

Source: https://skills.extensions.modelcontextprotocol.io/specification/stable/skills

**Affected components:** Capability Registry, Specialist Council, Agent profiles, A2A/MCP adapter.

**Proposed change:** Represent skills as discoverable, versioned capabilities with provenance and authorization scope. A skill must describe intent and required capabilities, but must never grant authority by itself.

**Risk:** Low-to-medium. Treating instructions as authority could create prompt-injection or privilege-escalation paths.

**Verification required:** Tests proving that skill metadata cannot bypass policy, identity, approval, or execution controls.

**Status:** Recommendation only.

### 3. Agentic inference is becoming an infrastructure orchestration problem

**Evidence:** NVIDIA Dynamo 1.0 is an open-source inference framework for distributed serving and supports vLLM, SGLang, TensorRT-LLM, Kubernetes, Slurm, NVIDIA and AMD GPUs, with KV-aware routing, disaggregated serving, cache management, and autoscaling.

Source: https://docs.nvidia.com/dynamo/

**Affected components:** NVIDIA architecture, Compute plane, Provider Registry, observability, cost/latency governance.

**Proposed change:** Keep NVIDIA Dynamo behind a provider-neutral Inference Fabric interface. Model routing should express requirements such as latency budget, context size, accelerator compatibility, locality, and cost rather than selecting NVIDIA-specific primitives at the Governance Kernel layer.

**Risk:** Medium. Vendor-specific routing can become an accidental hard dependency.

**Verification required:** Same workload exercised through at least two inference backends, with equivalent governance/evidence semantics and measured latency/cost telemetry.

**Status:** Recommendation only.

### 4. Long-running tasks should be first-class, durable objects

**Evidence:** MCP Tasks formalize asynchronous work and durable task state; OpenAI's agent tooling also emphasizes long-horizon agent execution and controlled sandboxed environments.

Sources:
- https://tasks.extensions.modelcontextprotocol.io/
- https://openai.com/index/the-next-evolution-of-the-agents-sdk/

**Affected components:** A2A Runtime, Permanent Orchestrator, evidence/audit layer.

**Proposed change:** Extend the internal task contract with idempotency key, deadline, cancellation state, attempt metadata, policy snapshot/version, and an explicit distinction between execution completion and evidence verification.

**Risk:** Low if additive. Medium if existing task consumers assume completion implies truth.

**Verification required:** Retry, duplicate-delivery, timeout, cancellation, crash-recovery, and evidence-linkage tests.

**Status:** Recommendation only.

### 5. Agent-loop latency is now an architectural metric

**Evidence:** OpenAI reported substantial latency improvements by reducing network hops, caching reusable context, and using persistent connections for multi-step agent loops.

Source: https://openai.com/index/speeding-up-agentic-workflows-with-websockets/

**Affected components:** Mediator, Permanent Orchestrator, Provider Registry, Observability.

**Proposed change:** Track end-to-end agent-loop metrics separately from model inference latency: orchestration overhead, tool latency, provider queue time, TTFT, total tokens, retries, and evidence-processing time.

**Risk:** Low.

**Verification required:** Instrumentation must not change authorization semantics or leak secrets into traces.

**Status:** Recommendation only.

### 6. Provider-neutrality needs explicit feature normalization

**Evidence:** OpenAI, Google, Anthropic, NVIDIA and self-hosted stacks increasingly expose different agent harnesses, tools, sandboxes, context mechanisms, and asynchronous execution features.

Sources:
- https://openai.com/index/new-tools-for-building-agents/
- https://blog.google/innovation-and-ai/technology/developers-tools/google-io-2026-developer-highlights/
- https://docs.nvidia.com/dynamo/

**Affected components:** Provider Registry, Capability Registry, AI CEO, Mediator.

**Proposed change:** Separate capability identity from provider API shape. A capability should include required inputs/outputs, tool semantics, trust requirements, data locality, max context, latency/cost constraints, and evidence requirements. Provider adapters translate these into native APIs.

**Risk:** Medium. An overly generic abstraction can hide important provider differences.

**Verification required:** Contract tests for every provider adapter plus explicit capability-mismatch outcomes.

**Status:** Recommendation only.

## Security observations

1. **Signed handoffs:** Keep HMAC signing as an internal trust mechanism, but do not treat a valid signature as proof of authority or truth. Authorization and evidence remain separate checks.
2. **Replay resistance:** Nonces and expiry are good controls, but durable replay detection should be backed by persistent storage rather than process memory alone.
3. **Task isolation:** External task identifiers must be unguessable and access-controlled. MCP Tasks explicitly emphasizes non-enumerability; GLORIFIER should preserve that property.
4. **Provider credentials:** Continue server-side credentials only. Never place provider keys in client bundles, agent skill text, task payloads, logs, or evidence artifacts.
5. **Tool/skill trust:** Tool descriptions and skills are untrusted input. They must not grant permissions.
6. **Evidence boundary:** Completion, provider response, agent assertion, and verified external outcome remain distinct states.

## Obsolete or risky assumptions to retire

- “A synchronous model call is the normal unit of agent execution.” Long-running asynchronous tasks are now a standard interoperability concern.
- “MCP sessions are necessarily stateful.” The current MCP direction is stateless at the protocol layer.
- “Inference latency is the main agent latency.” Multi-hop orchestration and tool/API overhead can dominate fast models.
- “Provider compatibility means OpenAI-compatible HTTP.” Native APIs expose materially different capabilities; compatibility must be capability-based.

## GLORIFIER architecture decision

**Keep:** Governance Kernel → AI CEO → Permanent Orchestrator → Provider/Agent fabric → Evidence → Verification → Economic Truth.

**Strengthen:** add a Provider-Neutral Capability Contract and a Protocol Adapter layer:

Human Authority
→ Governance Kernel
→ AI CEO / Mediator
→ Capability Contract
→ Protocol Adapters (A2A / MCP / provider-native)
→ Provider & Agent Fabric
→ Durable Task Runtime
→ Evidence / Verification
→ Revenue & Economic Truth

The adapter layer must not become a second brain. It translates protocols and provider-specific capabilities while the GLORIFIER governance model remains authoritative.

## What changed in this repository

This watch is intentionally conservative. No credentials, authorization paths, financial logic, or provider-selection semantics were changed.

A documentation record for this architecture watch is being added on a dedicated branch. Runtime protocol migration remains a recommendation until conformance and E2E evidence are available.

## Verification gate

Do not mark any of the above as FULLY VERIFIED until there is concrete repository/production evidence for the corresponding behavior. In particular, A2A/MCP interoperability should be reported as **implemented/partially verified** until live conformance and authenticated end-to-end execution pass.
