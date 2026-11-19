# GLORIFIER AI Intelligence Radar and Engineering Blueprint

**Review date:** 2026-11-19 (Asia/Vientiane)  
**Repository baseline:** GLORIFIER7/GLORIFIER main at `ada67818ef80a503408884904ce7a6efab0e35fe`  
**Document status:** source-backed architecture synthesis and prioritized adoption plan  
**Change boundary:** documentation only; no provider was called, no inference was run, no dependency was installed, and no production setting was changed.

## Executive decision

GLORIFIER should treat AI as an evidence-to-action engineering discipline, not as a catalogue of model names or a race to install more agent frameworks. The durable advantage is a provider-neutral intelligence fabric governed by one control plane: identity, policy, budget, memory/data boundaries, execution state, verification, and human authority remain independent of whichever model happens to be strongest this month.

No review can literally capture the entire internet. This radar is a curated, time-bounded synthesis of official standards, security guidance, protocol specifications, research publications, and primary engineering documentation available on 2026-11-19. It deliberately separates established specifications, evolving guidance, vendor-specific examples, research results, and GLORIFIER implementation evidence. Source discovery is not implementation proof.

**Strategic direction:** preserve GLORIFIER's existing GEAS, provider registry, Specialist Council, persistent Autopilot ledger, native task graph, A2A/MCP interfaces, NEURAL service, and evidence model. Improve them through current external findings. Do not create a second mission ledger, identity authority, scheduler, provider router, or policy engine.

## 1. Research method and evidence rules

Sources were prioritized in this order:

1. Standards bodies, protocol specifications, public-sector guidance, and recognized security frameworks.
2. Official project documentation and release records for implementation details.
3. Peer-reviewed papers and benchmark publications for measured research results.
4. Vendor architecture guidance as useful patterns, not as neutral proof that a product is best.

Every proposed adoption must identify the exact source/version, the target GLORIFIER component, the problem it solves, its cost and risk, and a verification method. A source page, model card, benchmark score, provider model-list response, successful build, or local mock is not proof of production readiness.

Use GLORIFIER's evidence states and preserve the distinctions:

- **Declared:** present in documentation or configuration.
- **Implemented:** code and tests exist for a defined contract.
- **Observed:** a current runtime or external system returned evidence.
- **Verified:** reproducible evidence proves a narrowly scoped claim.
- **Unknown / Not verified:** evidence is missing, stale, inaccessible, or insufficient.

## 2. AI capability map: what the system should understand

### 2.1 Models are task capabilities, not permanent rankings

The model landscape includes general-purpose language models, reasoning-oriented models, code-specialized models, multimodal models, embedding models, rerankers, speech models, image/video models, and smaller or open-weight models. Model families also differ in architecture and serving characteristics, including dense and mixture-of-experts designs, context limits, quantization options, tool-use behavior, structured-output support, and hardware requirements.

GLORIFIER should not maintain a single universal 'best model' score. For each provider/model/version, maintain a capability record with:

- exact provider, model identifier, endpoint class, adapter version, and observation timestamp;
- supported input/output modalities and payload limits;
- tool calling, structured output, streaming, cancellation, and context-window claims;
- authentication, region/data-residency, retention, training-use, and privacy constraints where documented;
- current availability, quota/rate-limit status, request deadlines, and provider error taxonomy;
- usage returned by the provider, price metadata and source timestamp, and whether a figure is a quote, estimate, or reconciled charge;
- task-specific evaluation results, safety results, and known limitations.

A provider's advertised feature is not proof that every model version supports it. A configured credential is not proof of authorization; a model-list endpoint is not proof that inference works; one successful response is not proof of semantic equivalence with another provider.

### 2.2 Agent architectures should be selected by workload

Current architecture guidance describes several recurring patterns: a single agent/tool loop, deterministic sequential workflows, parallel fan-out/fan-in, coordinator/supervisor routing, graph workflows, and bounded iterative refinement. They are complementary, not interchangeable.

GLORIFIER should select the least complex pattern that satisfies the job:

- Use deterministic code or a single agent for bounded, well-specified work.
- Use sequential workflows when each stage depends on the prior stage and the process is stable.
- Use parallel execution only for independent read-only work with a bounded concurrency ceiling and a deterministic synthesis step.
- Use a coordinator and specialists when task decomposition genuinely needs adaptive routing.
- Use the existing persistent DAG for prerequisites, durable checkpoints, cancellation, and reconciliation.
- Use iterative critique/refinement only with explicit quality criteria, maximum attempts, timeouts, and budget limits.

More agents do not automatically produce better results. Fan-out increases model calls, aggregate spend, latency variance, synchronization complexity, and the number of failure paths. Consensus is not a substitute for evidence or authorization.

### 2.3 Tool and agent protocols have distinct jobs

- **MCP** is the model/agent-to-tool and context integration boundary. Treat server discovery, tool schemas, authorization, origins, and every invocation as capability-scoped.
- **A2A** is the agent-to-agent discovery, task, delegation, and artifact exchange boundary. Remote agents remain untrusted until identity, signing, scope, replay protection, and authorization are verified.
- **OpenAPI/HTTPS, webhooks, and event contracts** remain appropriate for ordinary service-to-service integration.
- **Agent definitions and project instructions** are configuration inputs. They do not grant permissions.

Pin and test exact protocol revisions. 'Supports MCP' or 'supports A2A' is not a sufficient conformance statement; transport, auth, lifecycle operations, streaming, errors, and version negotiation must be tested separately.

### 2.4 Retrieval, memory, and evidence are different data classes

Retrieval-augmented generation (RAG) combines indexed data with generation. Useful techniques include metadata filtering, hybrid lexical/vector retrieval, reranking, source-aware chunking, access-control filtering before retrieval, and answer grounding with source references. Graph retrieval can help when relationships and multi-hop traversal matter, but it is not automatically superior to simpler retrieval.

Agent memory is not the system of record. Memory is a convenience layer for contextual continuity; evidence is a traceable record of what a source or system actually established; policy is an authoritative decision. Do not collapse these layers.

Any GLORIFIER memory/retrieval adapter must enforce tenant, requester, mission, and role boundaries; data classification; source provenance and content hashes; timestamps; retention, expiry, and deletion; secret/PII screening; poisoning tests; and explicit conflict handling. Retrieved text remains untrusted data and must never become executable policy.

### 2.5 Multimodal AI needs explicit routing and data controls

Image, audio, video, and document understanding should be represented as separate capabilities with their own limits and quality tests. A model's text capability does not imply vision, audio, video, or document capability. Multimodal requests may have different payload, latency, privacy, and cost characteristics.

Before multimodal inputs enter an agent workflow, classify the content, validate file type and size, scan for unsafe payloads, record source provenance, and decide whether extraction can be handled by deterministic parsers before invoking a model. Preserve the original artifact or a content digest where policy permits; keep extracted text and model interpretation separate.

## 3. Security: assume an agent can be manipulated

OWASP's 2026 agentic guidance and MITRE ATLAS reinforce that AI security is an end-to-end control problem, not a prompt-writing problem. Relevant threat classes include goal hijacking and indirect prompt injection; misuse of tools; identity or privilege abuse; compromised skills, plugins, models, or datasets; unexpected code execution; memory/context poisoning; insecure inter-agent communication; cascading failures; over-trust by humans; and rogue or misconfigured agents.

GLORIFIER should enforce defense in depth:

1. **Identity:** every human, service, model adapter, agent, worker, and remote peer has a distinct principal. Bind delegated work to the requesting principal and tenant.
2. **Capability authorization:** tools and data are default-deny. Grant narrow, short-lived capabilities for one action and target; never pass an owner's ambient credentials into a model or plugin.
3. **Untrusted-data isolation:** web pages, email, documents, issue text, PR descriptions, model output, tool output, and retrieved memories are data, not instructions. Preserve source labels and prevent untrusted content from rewriting policy or task authority.
4. **Execution isolation:** use sandboxing, resource ceilings, exact-host egress allowlists, filesystem/process boundaries, and secret isolation. A prompt filter alone is insufficient.
5. **Action-chain controls:** validate tool arguments, destination, operation sequence, idempotency, risk tier, and approval immediately before execution.
6. **Federation controls:** authenticate peers, sign messages, bind audience and scope, enforce expiry and replay protection, screen outbound/inbound data, and support revocation.
7. **Resilience:** impose maximum iterations, delegation hops, concurrency, payload size, token usage, time, and cost. Quarantine uncertain side effects rather than replaying them.
8. **Human control:** approvals bind to the exact action, parameters, target, policy version, and expiry. High-impact, irreversible, financial, legal, security-sensitive, or production-destructive actions remain human-authorized.
9. **Assurance:** run prompt-injection, tool-abuse, privilege-escalation, data-leakage, memory-poisoning, supply-chain, and multi-agent red-team tests continuously.

OWASP's Agent Control Standard is worth evaluating as a portable runtime-control pattern. Its existence or a project's self-declared profile is not proof of independent conformance; GLORIFIER should map concepts to GEAS and require observable tests before claiming adoption.

## 4. Evaluation: measure systems, not demos

Generative systems are probabilistic, so ordinary unit tests alone cannot establish output quality. GLORIFIER needs a layered evaluation program:

- **Contract tests:** schemas, auth, rate limits, timeouts, cancellation, retries, idempotency, output size, and error normalization.
- **Golden task sets:** representative GLORIFIER tasks with known expected outputs, source evidence, and unacceptable behaviors.
- **End-to-end agent evaluations:** task completion, correct tool selection, correct delegation, dependency handling, policy compliance, and verified outcomes.
- **Grounding evaluations:** factual correctness against source evidence, citation accuracy, retrieval precision/recall, stale-source handling, and explicit abstention when evidence is absent.
- **Security evaluations:** direct/indirect prompt injection, data exfiltration, unsafe tool sequences, privilege escalation, poisoning, and unauthorized side effects.
- **Operational evaluations:** p50/p95 latency, timeout rate, retry rate, task recovery, cancellation, queue age, tokens, cost, and provider availability.
- **Human calibration:** periodically compare automated graders with human reviews; do not use a model judge as the sole authority for consequential decisions.

Store evaluation datasets, expected results, grader versions, model/provider revisions, test artifacts, and regression thresholds in GLORIFIER-controlled versioned assets. Use deterministic checks wherever possible; use model-based grading only for qualitative dimensions and calibrate it against human labels.

Important lifecycle note: OpenAI's current deprecation page states that its Evals dashboard/API/graders became read-only on 2026-10-31 and are scheduled to shut down on 2026-11-30. GLORIFIER should therefore own a portable evaluation corpus and runner rather than make the system dependent on one provider's hosted evaluation product. The platform's trace-grading concepts remain useful as design input.

Benchmarks such as SWE-Bench Pro are useful for comparing research capabilities on defined task sets, but benchmark results do not prove GLORIFIER's performance on its own repository, customer workflows, or production environment. Maintain a private, versioned GLORIFIER task corpus and report the exact model, harness, tool permissions, environment, and commit tested.

## 5. Observability and economic truth

An agent run should be reconstructable from linked records: request, authenticated principal, mission, agent identity, provider/model/adapter revision, policy decision, task graph step, tool invocation, evidence artifact, verification, and business outcome.

Capture structured events for model calls, tool calls, agent creation/invocation, handoffs, retries, guardrail decisions, task lifecycle, and failures. Useful dimensions include trace ID, mission ID, agent ID, provider/model, operation, tool name, policy decision reference, duration, token usage when actually returned, retry count, and outcome state.

OpenTelemetry's GenAI semantic conventions provide a useful cross-framework vocabulary for inference and tool execution. The GenAI agent/tool convention pages reviewed here are still marked Development; use an adapter over a versioned GLORIFIER telemetry contract and do not present the upstream fields as stable until their status changes.

Never log API keys, tokens, private keys, raw sensitive prompts, or unnecessary customer content. Do not store hidden chain-of-thought. Store concise action summaries, tool arguments after redaction, policy decisions, outputs needed for evidence, and content digests. Telemetry must not become a shadow database of secrets.

Cost accounting must distinguish provider-reported token usage, billable usage, estimated cost, invoice charges, reconciled charges, and verified business outcomes. Missing usage is unknown, not zero. Route only among eligible models using capability, policy, data handling, measured quality, availability, latency, quota, and the owner's budget. Never evade quotas or silently substitute a model the user did not authorize.

Self-hosted serving projects such as vLLM show the value of continuous batching, KV-cache management, prefix caching, quantization, and speculative decoding. Those optimizations are relevant only when GLORIFIER has an authorized workload, suitable hardware, measured demand, and a full operating-cost model. Open weights do not mean free inference; GPUs, electricity, storage, maintenance, security, and egress still have costs.

## 6. Governance and regulatory awareness

NIST AI RMF and its Generative AI Profile provide a lifecycle-oriented way to organize governance, mapping, measurement, and management of AI risks. NIST's Agent Standards Initiative adds an important emerging focus on agent identity, authentication, delegation, and security evaluation.

The EU AI Act is jurisdiction- and intended-use-dependent. The European Commission's current timeline states that most AI Act rules and applicable enforcement began on 2026-08-02; the current published timeline identifies 2027-12-02 for certain stand-alone high-risk systems and 2028-08-02 for high-risk AI embedded in regulated products. Applicability depends on intended purpose and context, not merely on calling a feature 'AI'. This radar is engineering guidance, not legal advice; obtain qualified legal assessment where GLORIFIER's market, customers, or use case create obligations.

Maintain a lightweight AI system inventory: purpose, users, affected parties, data classes, model/provider dependencies, human oversight, foreseeable failure modes, evaluations, monitoring, retention, and incident owner. Reassess it when the model, prompt, tool permissions, data source, or intended use changes.

## 7. Current GLORIFIER alignment from repository evidence

The current main branch and its architecture records already provide a strong base:

| GLORIFIER component | Repository evidence | Engineering implication |
|---|---|---|
| Provider-neutral model adapters and discovery | `src/lib/ai/registry.ts`, provider discovery and model-catalog tests | Keep one canonical capability contract; test each adapter/model revision independently. |
| NEURAL inference service | `services/neural/` and provider-specific adapters | Keep inference separately deployable and subject to explicit endpoint, egress, entitlement, and budget gates. |
| Specialist Council and AI CEO | AI orchestration and specialist-council modules | Use specialists only when the task graph benefits from decomposition; keep one accountable coordinator. |
| Durable Autopilot mission control | `src/lib/autopilot-mission-control.ts` and `AGENT_RUNTIME.md` | Preserve requester-scoped state, idempotency, optimistic versions, leases, approvals, evidence, and reconciliation. |
| Native task graph | `src/lib/autopilot-graph.ts` and `docs/architecture/native-agent-graph-engine.md` | Keep bounded graph size and concurrency; do not add another workflow engine by default. |
| GEAS governance and capability policy | `src/lib/governance/` and enterprise-control tests | Policy and human authority remain above models, agents, tools, and protocols. |
| A2A/MCP interoperability | `AGENT_RUNTIME.md`, MCP reference docs, and interoperability verification matrix | Local contracts are not full external conformance; exact-version TCK and independent-client evidence remain required. |
| Architecture-source intelligence | `src/lib/governance/geas-architecture-scientist.ts` and `docs/architecture/geas-authoritative-source-registry.json` | Continue curated primary-source monitoring; content matches remain research signals, not implementation proof. |
| GenAI telemetry | `docs/architecture/geas-otel-runtime-crosswalk.md` | Use an internal versioned telemetry contract and map to evolving OpenTelemetry conventions. |

Two important evidence boundaries remain visible in current repository documentation:

- The interoperability matrix marks full A2A 1.0.1 and MCP 2026-07-28 external conformance as NOT VERIFIED; the existence of local tests and workflows does not change that status.
- The [November 18 architecture landscape](open-source-agent-orchestration-landscape-2026-11-18.md) records the agent control registry in `src/lib/governance/agent-control-plane.ts` as process-local state. Do not treat that file alone as proof of durable cross-instance agent identity and authorization state.

The [Autopilot Cloudflare migration record](../operations/AUTOPILOT-CLOUDFLARE-MIGRATION.md) also states that the production free-plan entitlement is not independently verified and inference remains disabled in the described production configuration. This blueprint does not authorize model calls, external egress, paid inference, or new credentials.

Related existing architecture documents:

- [Universal AI Enterprise Operating Model](universal-ai-enterprise-operating-model.md)
- [AI Enterprise Operating Model](ai-enterprise-operating-model.md)
- [Complete AI Ecosystem Implementation Baseline](complete-ai-ecosystem-implementation-baseline.md)
- [Native Agent Graph Engine](native-agent-graph-engine.md)
- [GEAS OpenTelemetry Runtime Crosswalk](geas-otel-runtime-crosswalk.md)
- [Interoperability and Outcome Verification Matrix](../INTEROPERABILITY-AND-OUTCOME-VERIFICATION-MATRIX.md)
- [Autopilot Runtime Contract](../../AGENT_RUNTIME.md)

## 8. Prioritized engineering roadmap

### P0 — enforce the security boundary

- Reconcile agent identity, requester, tenant, capability, and delegated authority across every tool and agent path.
- Ensure external content and retrieved memories remain labelled untrusted data all the way through planning and tool execution.
- Add regression tests for prompt injection, tool misuse, memory poisoning, unauthorized delegation, replay, and secret/PII exfiltration.
- Verify runtime sandbox/quarantine, egress restrictions, resource ceilings, and emergency stop before enabling broader autonomous execution.
- Preserve the current zero-paid-inference default and exact provider/model/endpoint authorization.

### P1 — make quality measurable and portable

- Create a repository-owned evaluation corpus and runner for model selection, agent workflows, provider failover, retrieval grounding, safety, and coding tasks.
- Add trace correlation from mission to agent, provider, policy decision, tool, evidence, and final verification.
- Establish per-task model capability profiles and model deprecation/replacement tests.
- Extend durable agent identity/control state where process-local state is insufficient for multi-instance execution.
- Keep independent A2A and MCP conformance as explicit release gates, with exact protocol snapshots and recorded test reports.

### P2 — improve knowledge and modalities

- Introduce scoped memory/RAG only where a measured retrieval gap exists; enforce provenance, access filters, retention, deletion, and poisoning tests.
- Add modality-specific image/audio/video/document capability checks and evaluation sets.
- Evaluate open-weight and self-hosted inference only after measuring workload volume, hardware availability, total cost, maintenance burden, and security.
- Evaluate fine-tuning, distillation, or custom training only when a stable labelled corpus and measurable baseline justify it. Prefer prompt/schema improvements and retrieval first.

### P3 — expand business intelligence after reliability

- Translate customer workflows into outcome measures such as task completion, verified delivery, time saved, error reduction, and reconciled cost.
- Attribute model and agent usage to tenant, mission, workload, and business outcome without confusing estimates with revenue.
- Add new domain specialists and business integrations only behind the same identity, capability, audit, and verification contracts.

## 9. Adoption rules

1. One source of truth for identity, mission state, policy, and evidence.
2. Model/provider/framework neutrality; adapters may be replaced without rewriting governance.
3. No new dependency, database, scheduler, hosting tier, or paid service without a documented gap and cost/benefit review.
4. No model output can grant itself permission, approve its own action, or change a risk classification.
5. No auto-merge, production deployment, financial action, wallet signing, asset mint/transfer, credential rotation, or destructive operation from an autonomous loop.
6. Use exact model, protocol, dataset, tool, and source versions in evaluations and evidence.
7. A passing test proves only its tested scope and exact commit; it does not prove a live provider, deployment, or business outcome.
8. Keep the source radar current by revisiting authoritative sources on their review cadence and recording content hash, final URL, retrieved time, and applicability.

## 10. Primary sources reviewed

### Governance, security, and threat intelligence

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI RMF: Generative AI Profile (NIST AI 600-1)](https://doi.org/10.6028/NIST.AI.600-1)
- [NIST AI Agent Standards Initiative](https://www.nist.gov/super-intelligence/si-agent-standards-initiative)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [OWASP Securing Agentic Applications V2 (2026-11-10)](https://genai.owasp.org/resource/securing-agentic-applications-v2/)
- [OWASP Agent Control Standard](https://genai.owasp.org/resource/agent-control-standard-acs/)
- [MITRE ATLAS](https://atlas.mitre.org/)
- [Microsoft: Defend against indirect prompt injection attacks](https://learn.microsoft.com/en-us/security/zero-trust/sfi/defend-indirect-prompt-injection)
- [European Commission: Navigating the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act)

### Protocols and agent architecture

- [Model Context Protocol 2026-07-28 specification announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [A2A 1.0.1 source snapshot used by GLORIFIER's verification records](https://github.com/a2aproject/A2A/tree/3303592588e388e62e0f69f701af531d2f4e3991)
- [Linux Foundation: Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [Google Cloud: Choose a design pattern for your agentic AI system](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system/)
- [Microsoft Agent Framework overview](https://learn.microsoft.com/agent-framework/overview/)
- [AWS Well-Architected Agentic AI Lens](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/)

### Evaluation, observability, models, and inference

- [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI API deprecations](https://developers.openai.com/api/docs/deprecations)
- [OpenTelemetry GenAI client inference conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/client-inference.md)
- [OpenTelemetry GenAI tool execution conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/execute-tool.md)
- [SWE-Bench Pro, ICML/PMLR 2026](https://proceedings.mlr.press/v306/deng26f.html)
- [NVIDIA Nemotron model family](https://developer.nvidia.com/topics/ai/nemotron)
- [vLLM inference and serving documentation](https://github.com/vllm-project/vllm/tree/main/docs)

**Source interpretation note:** These sources inform design and research priorities. They do not certify GLORIFIER as compliant with a standard, secure against every attack, connected to an external protocol peer, entitled to a provider's free tier, or operational in production. Recheck each moving specification, model lifecycle, pricing page, and regulatory source before implementation.

## Review cadence

Revisit fast-moving model, provider, and protocol references at least every 7–14 days; security and interoperability guidance every 14 days; and governance standards/regulatory sources every 30 days or on a material update. Record the exact source revision and observation time. A stale source observation must not silently remain current.

**Final architecture principle:** GLORIFIER should absorb the world's best verified AI engineering knowledge into its own standards, tests, adapters, and evidence-backed decisions—not accumulate disconnected tools, frameworks, or unverified claims.
