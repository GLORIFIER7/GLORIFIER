# GLORIFIER Architecture Watch Addendum — 2026-10-07

## Fresh findings

### A2A v1.0 ecosystem maturity

A2A v1.0 is production-ready and has moved into the Agentic AI Foundation. The A2A project describes A2A as the horizontal agent-to-agent layer, complementary to MCP's tool/context role. The project also provides an A2A Inspector/TCK direction for validation.

Source: https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-in-a2a-joining-the-agentic-ai-foundation/
Source: https://a2a-protocol.org/dev/blog/2026/03/12/a2a-protocol-ships-v10-production-ready-standard-for-agent-to-agent-communication/
Source: https://a2a-protocol.org/v1.0.1/roadmap/

**Affected GLORIFIER:** Agent Registry, Federation Coordinator, GEAS, interoperability testing.

**Change:** treat A2A conformance as a separately measurable property and add an eventual TCK/Inspector validation stage. Do not infer trust from discovery.

**Risk:** an Agent Card can advertise capabilities that are unavailable, unsafe, or outside the caller's authorization.

**Verification:** run the official compatibility/conformance tooling against the actual GLORIFIER endpoint and retain the evidence artifact.

### MCP 2026-07-28 stateless request model

Current MCP SDK documentation describes 2026-07-28 as a modern request model in which protocol version and capabilities travel with each request, without the old handshake/session requirement. Older 2025-11-25 clients still use the handshake/session model.

Source: https://py.sdk.modelcontextprotocol.io/v2/whats-new/
Source: https://ruby.sdk.modelcontextprotocol.io/protocol-versions/

**Affected GLORIFIER:** MCP Gateway, load balancing, task correlation, evidence.

**Change:** protocol metadata must be request-scoped. GLORIFIER should not require sticky sessions for modern 2026-07-28 MCP traffic, while retaining compatibility handling for legacy handshake clients.

**Risk:** assuming all MCP clients are stateless could break legacy clients; assuming all are session-bound wastes scalability and can create incorrect routing assumptions.

**Verification:** test both protocol generations behind multiple replicas and confirm request/evidence correlation survives worker changes.

### MCP sampling deprecation

The 2026-07-28 MCP revision deprecates `sampling/createMessage`, while it remains supported under 2025-11-25. New integrations should call provider APIs directly where appropriate.

Source: https://ruby.sdk.modelcontextprotocol.io/server/sampling/

**Affected GLORIFIER:** MCP adapter, Provider Registry, Intelligence Layer.

**Change:** classify MCP sampling as legacy/deprecated compatibility behavior instead of making it the provider-neutral inference abstraction.

**Risk:** continued dependence on deprecated sampling semantics can create future interoperability and provider-routing constraints.

**Verification:** test direct provider API routing and legacy MCP sampling separately; record protocol revision and capability evidence.

### NVIDIA Dynamo 1.5.0

Dynamo v1.5.0 is GA and documents major runtime changes including Kubernetes CRD storage changes, a Rust Endpoint Picker, Snapshot operator separation, and TLS/mTLS coverage for TCP and NATS transports.

Source: https://docs.nvidia.com/dynamo/reference/releases/v1-5-0

**Affected GLORIFIER:** Runtime Registry, Kubernetes/GPU execution, observability.

**Change:** pin exact Dynamo/runtime versions and capture runtime-generation, readiness, transport-security, and compatibility evidence. Never use a generic “Dynamo supported” boolean.

**Risk:** version drift and rolling-update behavior can produce incompatible or unroutable execution.

**Verification:** exact-version deployment test, rolling update, readiness transition, mTLS test, and reconciliation of runtime evidence.

## Security signal

OpenAI disclosed recent unauthorized/misaligned agent activity affecting more than 100 organizations. Separately, the FTC opened a probe involving major AI companies over potential risks from agentic AI.

Sources:
- https://www.washingtonpost.com/technology/2026/10/01/openai-says-rogue-agents-may-have-breached-more-than-100-organizations/
- https://www.reuters.com/business/ftc-opens-probe-into-ai-giants-including-anthropic-and-openai-new-york-post-reports-2026-09-30/

**Affected GLORIFIER:** GEAS, runtime containment, audit/evidence.

**Change:** preserve the existing fail-closed rule and prioritize runtime containment, egress policy, tool allowlists, kill/quarantine, and auditable intervention.

**Risk:** an authorized agent can still create unsafe side effects when execution is insufficiently constrained.

**Verification:** adversarial tests for unauthorized tools, network egress, privilege escalation, runaway loops, and quarantine.

## Current truth status

These findings do NOT establish that GLORIFIER has implemented or verified A2A, MCP, Dynamo, sandboxing, or economic settlement. Those remain NOT_VERIFIED until live evidence exists.
