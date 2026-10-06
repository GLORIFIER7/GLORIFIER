# GLORIFIER Architecture Watch — 2026-10-06

## Evidence-backed findings

### 1. NVIDIA Dynamo 1.5.0 is GA

NVIDIA's v1.5.0 documentation specifies tested backend versions, CUDA versions, minimum drivers, GPU families, operating systems, architectures, and breaking changes.

Affected component: Compute / Runtime Compatibility / Provider Registry.

Change: represent exact runtime tuples and compatibility evidence instead of vendor-level support flags.

Risk: version drift can break inference, deployment, or GPU scheduling.

Verification: collect exact runtime metadata and compare against the authoritative compatibility matrix.

Current status: recommendation only; no NVIDIA runtime deployment is claimed.

### 2. A2A and MCP have distinct interoperability roles

The A2A specification describes A2A as agent-to-agent interoperability and MCP as agent-to-tool/resource interoperability.

Affected component: A2A/MCP Gateway, Agent Registry, Provider/Capability Registry.

Change: keep protocol roles separate and expose explicit protocol metadata in capability records.

Risk: conflating protocols can create incorrect routing, authorization, or interoperability assumptions.

Verification: protocol conformance tests against each declared version.

### 3. Agentic systems increase the importance of runtime controls

Current enterprise agent architectures increasingly emphasize autonomous execution and controls around what agents may do.

Affected component: GEAS / Runtime Security / Observability.

Change: formalize containment, egress, tool allowlists, resource limits, kill/quarantine, and audit requirements as controls.

Risk: an authorized agent can still create unsafe side effects if runtime controls are absent.

Verification: controlled adversarial tests demonstrating denied tools, denied egress, resource limits, and auditable intervention.

## Obsolete assumptions to avoid

- Provider configured does not mean provider verified.
- Protocol supported does not mean protocol conformant.
- Model available does not mean model semantically equivalent.
- Runtime installed does not mean runtime compatible.
- Task completed does not mean outcome verified.
- Agent discovered does not mean agent trusted.

## Implemented in this repository

- Added runtime compatibility contract documentation.
- Added provider-neutral interoperability contract documentation.
- Added security/governance guardrails.
- Added this evidence/status watch record.
- Extended Agent Card metadata for runtime compatibility semantics.
- Extended task envelope metadata for runtime and evidence references.
- Added CI validation for JSON contracts.

## Not implemented / recommendation only

- Live A2A conformance.
- Live MCP conformance.
- Cryptographic Agent Card signatures.
- Production runtime sandboxing.
- Kubernetes/GPU deployment.
- NVIDIA Dynamo deployment.
- Provider billing reconciliation.
- Cross-provider semantic-equivalence testing.
- Autonomous financial execution.

No credentials, authorization bypasses, irreversible changes, or financial actions are part of this change.
