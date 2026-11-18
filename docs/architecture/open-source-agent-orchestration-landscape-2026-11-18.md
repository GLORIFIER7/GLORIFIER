# Open-source agent-orchestration landscape and GLORIFIER extraction plan

**Assessment date:** 2026-11-18 (Asia/Vientiane)  
**Repository baseline:** `main` at `48b5ad60e34974d925e27a407571402a28ec00db`  
**Assessment type:** source and architecture review; no upstream code copied and no runtime dependency installed.

## Decision

**Keep GLORIFIER as the governing orchestration control plane. Extract proven design patterns, not entire competing frameworks.**

GLORIFIER already has a provider-neutral AI orchestrator, a Specialist Council, agent harness, capability authorization and GEAS policy, a persistent PostgreSQL-backed Autopilot mission ledger, a constrained execution fabric, A2A/MCP surfaces, and a separately deployable Python/NEURAL inference service. Installing several full frameworks would duplicate mission state, provider routing, policy, tool adapters, and scheduling while increasing dependency, storage, and operational cost.

The target architecture is a **native, framework-neutral workflow graph over the existing mission ledger**, with optional framework adapters behind explicit contracts. No framework may become a second source of truth or bypass GEAS, capability authorization, the evidence layer, or human approval.

This survey is broad but not an exhaustive audit of every project in the ecosystem. A November 2026 index lists hundreds of agent-running and orchestration tools; a separate curated directory covers 98 entries across frameworks, protocols, memory, platforms, observability, evaluations, benchmarks, and research. Both are discovery indexes, not proof that every listed project is production-ready. Recheck the upstream project, release, license, security posture, and exact feature before adopting a component.

## 1. Landscape map

### A. General-purpose agent and multi-agent frameworks

| Project | Distinctive pattern worth extracting | GLORIFIER decision |
|---|---|---|
| [LangGraph](https://github.com/langchain-ai/langgraph) | Explicit state graphs, branching, subgraphs, checkpointing, resumable execution, human inspection and intervention | **Adopt the graph/checkpoint model.** Do not add a parallel LangGraph runtime until a measured gap requires it. |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | Sequential, concurrent, handoff and group-collaboration workflows; checkpoints, streaming, HITL, MCP/A2A and declarative agents | **Adopt workflow topology and versioned agent-definition patterns.** Keep GLORIFIER identity and authorization authoritative. |
| [Google ADK](https://github.com/google/adk-python) | Workflow nodes, routing, fan-out/fan-in, loops, retries, state, nested workflows and structured task delegation | **Adopt bounded fan-out/fan-in and typed task contracts.** Provider-neutrality remains mandatory. |
| [CrewAI](https://github.com/crewAIInc/crewAI) | Role-based Crews plus deterministic/event-driven Flows and conditional transitions | **Adopt role/task separation and event-driven flow design.** The existing Specialist Council remains the role registry. |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) | Agent-as-tool composition, explicit handoffs, input/output guardrails, sessions, tracing and sandbox-agent concepts | **Adopt handoff contracts, guardrail placement and trace semantics.** Do not make OpenAI a privileged control-plane provider. |
| [PydanticAI](https://github.com/pydantic/pydantic-ai) | Typed inputs/outputs, dependency injection, schema-validated tools, graph control flow, evals and integrations with durable engines | **Adopt strict schemas and typed result validation.** Reuse existing TypeScript/Python validation conventions; do not introduce a second domain model. |
| [Agno](https://github.com/agno-agi/agno) | Teams, workflows, durable background execution, API/MCP serving, authentication, role controls, human approvals and operational UI | **Adopt operational API, approval and resume/replay patterns.** Do not import its platform as a second control plane. |
| [AG2](https://github.com/ag2ai/ag2) | Hub-based agent networks, typed channels, write-ahead log, audit trail and explicit human-input hooks | **Adopt typed agent messages and append-only collaboration events.** Evaluate as an interoperability peer, not a replacement runtime. |
| [BeeAI Framework](https://github.com/i-am-bee/beeai) | Rule-driven governance, dynamic workflows, parallelism, retries, declarative definitions, OpenTelemetry and MCP/A2A | **Study deterministic policy separation and telemetry.** GEAS remains the source of authorization decisions. |
| [Dapr Agents](https://github.com/dapr/dapr-agents) | Durable workflows, virtual actors, pub/sub coordination, persisted state and service-discovery patterns | **Adopt actor lifecycle and recovery ideas where useful.** Avoid adding Dapr infrastructure solely to obtain these patterns. |
| [Strands Agents](https://github.com/strands-agents/sdk-python) | Model-driven agent loop, tool composition and multi-agent patterns | **Use as a provider/runtime reference.** Do not couple the orchestration core to AWS. |
| [Mastra](https://github.com/mastra-ai/mastra) | TypeScript-first agents and step-based workflows, typed schemas, suspension/resumption, streaming and replay | **Strong reference for TypeScript workflow ergonomics.** Check the license of each path: core is Apache-2.0, while `ee/` paths use a separate enterprise license. |
| [Hugging Face smolagents](https://github.com/huggingface/smolagents) | Small, model-agnostic tool/code-agent loop and sub-agent hierarchies | **Adopt minimal loop and tool-interface ideas.** Never treat its local Python executor as a security sandbox. |
| [CAMEL](https://github.com/camel-ai/camel) and [MetaGPT](https://github.com/FoundationAgents/MetaGPT) | Agent societies, structured roles, software-team decomposition and artifacts | **Use as research patterns for bounded specialist collaboration**, not as proof that agent consensus or generated artifacts are correct. |

### B. Data, retrieval and specialist agent frameworks

| Project | Best-fit capability | GLORIFIER decision |
|---|---|---|
| [LlamaIndex](https://github.com/run-llama/llama_index) | Document ingestion, retrieval, event-driven workflows and document-focused agents | Integrate behind a scoped retrieval adapter when a real document-grounding requirement exists. |
| [Haystack](https://github.com/deepset-ai/haystack) | Explicit, modular retrieval/generation pipelines and schema-validated agent state | Reuse pipeline composition and provenance patterns; do not replace the general mission engine with a RAG framework. |
| [TaskWeaver](https://github.com/microsoft/TaskWeaver) | Code-first data-analysis agents, session state and isolated execution | Consider only for a data-analysis workload with a separately verified sandbox. |
| [AgentScope](https://github.com/agentscope-ai/agentscope) | Multi-agent development, evaluation, hosting and memory | Evaluate for specialist experiments; keep all production actions behind GLORIFIER adapters. |
| [PraisonAI](https://github.com/MervinPraison/PraisonAI) | Declarative graphs with route/parallel/loop patterns and guardrails | Study its compact workflow-definition model; validate any schema independently. |

### C. Visual builders and application platforms

[Langflow](https://github.com/langflow-ai/langflow) and [Dify](https://github.com/langgenius/dify) are useful visual authoring/application platforms. Treat any exported flow as **untrusted workflow input**: validate its schema, tool scopes, data access, node types, resource limits, and license before importing. Their UI or platform status does not confer GEAS permissions. Do not deploy another standalone platform just to duplicate GLORIFIER's control plane.

### D. Durable workflow and task backends

[Temporal](https://github.com/temporalio/temporal), [DBOS](https://github.com/dbos-inc/dbos-transact), [Trigger.dev](https://github.com/triggerdotdev/trigger.dev), and [Hatchet](https://github.com/hatchet-dev/hatchet) provide patterns for durable functions, checkpointed tasks, retries, queues, waits/signals, concurrency control and workflow recovery.

**GLORIFIER decision:** compare these against the already implemented PostgreSQL mission ledger before adding infrastructure. A second scheduler, event store, database, or worker control plane is not justified by feature overlap alone. Reconsider only if measured requirements exceed the existing lease, retry, persistence, throughput, or operational envelope. Review license and self-hosting conditions per version; some workflow products commonly grouped in this category are source-available or fair-code rather than OSI open source.

### E. Memory and knowledge layers

[Mem0](https://github.com/mem0ai/mem0), [Graphiti](https://github.com/getzep/graphiti), and [Letta](https://github.com/letta-ai/letta) illustrate scoped memory, temporal facts, persistent agent state, and long-term knowledge.

**GLORIFIER decision:** memory is context, not evidence and not policy. Any future memory adapter must enforce requester/tenant/mission/role scopes, provenance, data classification, retention and deletion, source timestamps, and conflict handling. The authoritative mission ledger and evidence records remain separate from model-generated memory. Do not add another vector database without a measured retrieval gap and a reviewed data-governance plan.

### F. Protocols and interoperability

- **MCP:** agent-to-tool/context integration. Keep server discovery, tool schemas, origin checks, credentials, and each invocation capability-scoped.
- **A2A:** agent-to-agent discovery, task lifecycle, delegation, artifacts and remote handoff. Validate the exact protocol revision, authentication and conformance profile; a successful local test is not universal conformance.
- **AGNTCY:** evaluate its discovery, identity and secure-messaging work as an adjacent interoperability ecosystem, not a replacement for existing A2A/MCP contracts.
- **OpenWOP:** evaluate its durable workflow wire contract, suspend/resume, replay, idempotency and human-interrupt model. The upstream project says it is seeking its first independent implementation; therefore it is **research-only for GLORIFIER** until an independent host and GLORIFIER conformance tests exist.
- **ACP:** treat the older Agent Communication Protocol as historical lineage where the source documents it as superseded/merged into A2A; do not begin a new integration without an independently justified compatibility requirement.

MCP and A2A solve different seams; neither is, by itself, the durable workflow authority.

### G. Coding-agent and swarm platforms

The broader catalog also includes coding-agent runners, terminal/desktop agents, swarms, task routers, and agent-hosting infrastructure (for example OpenHands, Ruflo, OpenClaw and related projects). They are not interchangeable with a general-purpose workflow SDK. Evaluate isolation, permissions, repository scope, worktree/container boundaries, credential handling, command allowlists, and auditability before connecting any coding agent.

Existing GLORIFIER assessments already cover [EDDI](eddi-agent-workforce-adoption.md), [Ruflo](ruflo-capability-adoption.md), and [GitHub Agentic Workflows](github-agentic-workflows-adoption.md). Keep their current adoption boundaries; this document does not supersede them.

### H. Observability and evaluation

[Langfuse](https://github.com/langfuse/langfuse), [Arize Phoenix](https://github.com/Arize-ai/phoenix), and [Opik](https://github.com/comet-ml/opik) are useful references for model/tool traces, run trees, datasets, evaluation, and regression analysis.

**GLORIFIER decision:** standardize on correlated OpenTelemetry-style spans and evidence-linked run records before deploying a new observability platform. A trace shows what ran; it does not prove an action was authorized, correct, or economically settled. Preserve independent verifiers and outcome evidence.

## 2. What the inspected GLORIFIER source already contains

The repository baseline and the following source files were inspected on 2026-11-18:

| Existing component | Source evidence | Correct interpretation |
|---|---|---|
| Provider-neutral model routing | `src/lib/ai/orchestrator.ts`, `src/lib/ai/registry.ts` | Provider registry, capability/reliability/latency ranking and bounded failover logic exist in source. Runtime provider availability is configuration-dependent. |
| Specialist collaboration | `src/lib/ai/specialist-council.ts` | A large, domain-specific role catalogue and council execution path exist. Role declarations do not prove every specialist has a unique model, live endpoint, or independent expertise. |
| Persistent mission ledger | `src/lib/autopilot-mission-control.ts`, `database/migrations/20261115_001_glorifier_autopilot_missions.sql` | PostgreSQL-backed mission persistence, requester/idempotency scope, optimistic versions, worker leases, recovery states, step status and approval/evidence fields exist in source. |
| Governed mission execution | `src/lib/autopilot-orchestrator.ts` | Connects AI CEO policy, the Specialist Council, providers, A2A, capability authorization, GEAS, execution and the GitHub writer. |
| Constrained action adapter | `src/lib/autopilot-execution-fabric.ts` | Current Autopilot action mapping is a narrow set of GitHub read operations plus branch, inspected-file update and draft-PR operations. It is not a general unrestricted tool executor. |
| Agent sessions | `src/lib/ai/agent-harness.ts` | Session state can use PostgreSQL; memory fallback is explicit when durable storage is unavailable. Do not report fallback sessions as durable across process restarts. |
| Agent control registry | `src/lib/governance/agent-control-plane.ts` | The inspected registry uses a process-local `Map`; this file alone does not establish durable, cross-instance agent-identity state. |
| NEURAL inference runtime | `services/neural/app/orchestrator.py`, `services/neural/app/policy.py`, `services/neural/app/providers/registry.py` | Python provider adapters are explicit; inference is disabled unless opted in; action policy blocks financial, wallet-signing, minting, destructive and production-write task classes by default. |
| Interoperability | `AGENT_RUNTIME.md`, A2A and MCP conformance workflows | Protocol surfaces and tests exist. They do not prove all external agents, MCP servers or A2A peers are connected or conformant. |

At the time of the GitHub inspection, the repository default branch was `main` at the baseline SHA above, and the open-PR query returned zero open pull requests. This is a point-in-time repository observation, not a continuing status guarantee.

## 3. Highest-value patterns to absorb into the native GLORIFIER engine

1. **Typed workflow graph.** Add a versioned graph contract with node IDs, declared capability, typed input/output schema, `dependsOn` edges, deterministic condition expressions, effect classification, timeout, bounded retry policy, concurrency group, and terminal-state rules. Reject cycles, dangling references, duplicate IDs, unknown capabilities, and unsupported node types before execution.
2. **Deterministic graph runner.** Use the mission ledger as the durable state authority. Schedule only nodes whose dependencies have verified terminal outcomes; run independent read-only nodes concurrently under a hard per-mission limit; join only after all required upstream nodes have completed. Preserve a deterministic execution order for audit and replay.
3. **Checkpoint, event and replay model.** Persist every state transition, invocation identity, input/output digest, attempt, lease, approval, cancellation and evidence reference. Replay may reproduce orchestration decisions, but must never repeat an external side effect unless the effect is proven idempotent or a reconciled result authorizes continuation.
4. **Typed handoffs.** Give each specialist a bounded task contract with objective, context references, permitted tools/data scopes, expected output schema, timeout, and evidence requirement. Preserve individual findings, dissent and provenance; do not treat model agreement as verification.
5. **Guarded human interrupts.** Pause before any action that is high-risk, irreversible, financial, legal, security-sensitive, privacy-sensitive, production-destructive, or outside delegated scope. Store who approved what, when, for which exact action digest, and whether the approval is still valid.
6. **Protocol adapters.** Keep MCP tool calls and A2A remote-agent tasks behind the same capability/policy/evidence boundary. Enforce origin allowlists, authenticated identities, protocol-version negotiation, request-size limits, timeouts, replay protection, credential isolation and per-tool authorization.
7. **Sandbox isolation.** Run code execution, shell commands and untrusted agent-generated artifacts in a disposable isolated environment with resource limits, filesystem boundaries and outbound-network policy. Never treat an in-process Python executor or prompt instruction as a sandbox.
8. **Evaluation and traces.** Emit correlated run/node/provider/tool spans, token and cost observations when available, policy decisions, verifier results, and failure classification. Build deterministic fixture tests and adversarial tests; use model-based evaluators only as supplementary evidence.

## 4. Prioritized implementation sequence

| Priority | Work | Acceptance gate |
|---|---|---|
| P0 | Freeze the orchestration contract and map existing mission/API compatibility | Current mission records remain readable; no existing safety gate is weakened. |
| P1 | Add graph schema and static validator | Valid DAGs pass; cycles, unknown capabilities, invalid edges, unsafe effects and malformed schemas fail closed. |
| P2 | Add bounded DAG scheduling over the existing mission store | Dependency ordering, fan-out/fan-in, cancellation, leases, concurrency caps, timeouts, idempotency and crash recovery pass tests. |
| P3 | Add versioned typed specialist/handoff contracts and result validation | Each result is schema-checked, attributable to one role/provider/run, and linked to evidence; dissent is retained. |
| P4 | Complete MCP/A2A adapter boundary and conformance | Per-call authorization, exact-host restrictions, authentication, protocol versioning and negative conformance cases pass. |
| P5 | Prove sandbox and observability contracts | Untrusted code is isolated; traces are correlated; missing telemetry is UNKNOWN, never zero or healthy. |
| P6 | Benchmark before choosing external runtimes | A documented workload shows the native engine cannot meet durability, throughput, recovery, or maintenance targets before any new runtime/database is proposed. |

## 5. Non-adoption and security rules

- Do not install every framework, create one new agent per project, or run multiple overlapping schedulers.
- Do not copy source code without checking the precise license, notices, patents, dependencies, and path-level license exceptions. Prefer small, attributable, independently tested implementations of patterns over vendoring full repositories.
- Do not expose provider credentials to models, tools, browser clients, prompts, logs, or agent cards.
- Do not let remote frameworks, MCP servers, agent cards, workflow definitions, retrieved memories, or tool output grant themselves permissions.
- Do not use swarm voting, model self-evaluation, popularity, GitHub stars, or successful builds as evidence of a correct real-world outcome.
- Do not auto-merge, deploy, sign, mint, trade, transfer assets, rotate credentials, or mutate production state as part of this adoption.
- Preserve the owner's zero-budget preference: no paid hosted plans, new paid model path, cloud service, or usage commitment without separate authorization. Open-source software itself does not guarantee free model inference, hosting, storage, or operations.

## 6. Evidence boundary and next gate

This review is based on upstream project descriptions/repositories and source inspection of GLORIFIER's current main branch. It is an **architecture adoption assessment**, not a hands-on benchmark of all listed frameworks.

**Completed in this assessment:** repository baseline and open-PR query; source review of the listed GLORIFIER components; landscape classification; extraction decisions and an incremental acceptance plan.

**Not performed:** no upstream repository was cloned or vendored; no framework package was installed; no production runtime, external agent, MCP server, or new A2A peer was configured; no inference request or paid service was used; no migration, deployment, signing, transaction, or production write was performed. No execution or interoperability capability is marked newly verified by this document.

**Next engineering gate:** implement and test the typed DAG contract and bounded scheduler inside the existing Autopilot mission system. Keep external frameworks as optional adapters and reference implementations until a measured gap justifies them.

## Upstream discovery references

- [Awesome AI Agent Orchestration — curated frameworks, protocols, memory, platforms and evaluation tools](https://github.com/Awesome-llms-labs/awesome-AI-agent-orchestration)
- [Metrics-backed index of AI agent orchestration tools](https://github.com/erson/awesome-agent-orchestrators)
- [Open-source AI Agent Framework Comparison (Langfuse, updated 2026)](https://langfuse.com/blog/2025-03-19-ai-agent-comparison)
- [Open Workflow Orchestration Protocol (OpenWOP)](https://github.com/openwop/openwop)
