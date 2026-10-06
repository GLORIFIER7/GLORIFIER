# GLORIFIER Architecture Watch Addendum — 2026-10-06

Fresh evidence confirms five actionable directions: Dynamo 1.5.0 requires exact runtime compatibility tuples; Dynamo Kubernetes routing distinguishes generations and readiness from stickiness; A2A v1.0 supports signed Agent Cards and is under AAIF; MCP 2026-07-28 changes request/session semantics and deprecates sampling/createMessage; OpenAI's Agents SDK emphasizes sandboxed execution separated from compute.

## Actions

1. Runtime Compatibility: record runtime, backend, model, accelerator, CUDA, driver, deployment target, health, and evidence as separate fields. Risk: dependency drift. Verify against authoritative compatibility matrices.
2. Generation-aware inference: record runtime generation and readiness separately from workload identity; never infer session stickiness from capacity routing. Verify with rolling-update tests.
3. A2A identity: keep Agent Card identity separate from GEAS authority; add cryptographic verification only after real signature/expiry/revocation tests. Status: NOT VERIFIED.
4. MCP interoperability: retain explicit protocol revision/capability metadata; support modern stateless request routing without assuming legacy sticky sessions; treat deprecated sampling as compatibility risk. Verify against 2025-11-25 and 2026-07-28 peers.
5. Runtime containment: keep governance independent of sandbox/runtime; make containment evidence-bearing. Verify filesystem, network, tool, resource, and termination boundaries.

## Sources

NVIDIA Dynamo compatibility: https://docs.nvidia.com/dynamo/v1.5.0/reference/compatibility
A2A v1.0: https://a2a-protocol.org/dev/blog/2026/03/12/a2a-protocol-ships-v10-production-ready-standard-for-agent-to-agent-communication/
A2A AAIF: https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/
MCP SDK changes: https://py.sdk.modelcontextprotocol.io/en/latest/whats-new/
MCP sampling: https://ruby.sdk.modelcontextprotocol.io/server/sampling/
OpenAI Agents SDK: https://openai.com/index/the-next-evolution-of-the-agents-sdk/

No credentials, authorization bypasses, irreversible production changes, or financial actions are included. Live conformance and runtime deployment remain NOT VERIFIED.