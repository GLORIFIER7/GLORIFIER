# GLORIFIER Architecture Watch — 2026-10-09

## Executive summary

The highest-value fresh signal is not another orchestration framework: the ecosystem is converging on a distinct agent-runtime security boundary, and recent inference-runtime fixes demonstrate why untrusted media/network inputs must be handled as a security surface. GLORIFIER should keep GEAS as the business-authorization control plane and make runtime containment a separate, testable enforcement layer.

This watch is based on official NVIDIA Dynamo release/compatibility documentation and the official NVIDIA OpenShell and Docker Agent repositories. Competitor features are reference architectures, not proof that GLORIFIER already has equivalent capabilities.

## Finding 1 — NVIDIA Dynamo v1.5.1 adds security-relevant runtime changes

**Evidence:** NVIDIA's release notes list v1.5.1 dated 2026-10-06. The patch adds bounded multimodal inputs, changes handling of remote media references, pins validated media fetches to the checked destination address to address DNS-answer changes, and tightens proxy/local-file behavior. The compatibility matrix specifies exact supported backends and per-backend CUDA/driver requirements.

Sources:
- https://docs.nvidia.com/dynamo/v1.5.1/reference/compatibility
- https://docs.nvidia.com/dynamo/v1.5.0/reference/releases/v1-5-0

**Affected GLORIFIER components:** Runtime Compatibility Contract, tool/network egress gateway, MCP tool adapters, media/file fetchers, GEAS policy evidence.

**Proposed change:** Treat remote URLs, redirects, local file references, and multimodal payloads as untrusted. Require DNS-rebinding-resistant fetch behavior, deny redirects to private/link-local/metadata destinations, enforce byte/time/type/dimension limits, and record any proxy exception. Record exact runtime patch versions rather than a generic Dynamo capability.

**Risk:** Server-side request forgery, internal metadata access, local file disclosure, denial of service, or silent compatibility drift.

**Verification required:** controlled tests for DNS answer changes, redirects to private destinations, oversized/slow payloads, proxy policy, local path traversal, and exact runtime readiness/inference. No production runtime is claimed.

## Finding 2 — NVIDIA OpenShell provides a concrete sandbox reference architecture

**Evidence:** The official NVIDIA/OpenShell repository describes separate gateway, supervisor, and sandbox trust boundaries; policy-enforced filesystem, network, process, and provider access; and endpoint-bound credential injection. Its Kubernetes deployment path is explicitly described as experimental/under active development in the repository documentation.

Sources:
- https://github.com/NVIDIA/OpenShell
- https://github.com/NVIDIA/OpenShell/blob/main/architecture/sandbox.md

**Affected GLORIFIER components:** GEAS, runtime containment, secrets/provider adapter, network egress, audit/evidence.

**Proposed change:** Evaluate OpenShell as an optional runtime adapter/prototype rather than embedding its policy engine as the source of GLORIFIER authorization. GEAS should issue a scoped authorization decision; the runtime should enforce filesystem/process/network/provider restrictions; evidence should bind the authorization reference to the actual runtime policy and execution.

**Risk:** Mistaking a runtime sandbox for business authorization, or adopting an experimental Kubernetes path without threat-model and operational review.

**Verification required:** benign canary tests for filesystem isolation, process restrictions, denied egress, endpoint-bound credentials, policy-change review, kill/quarantine, and audit correlation. Test the exact release and compute driver used. Until run, runtime containment remains NOT_VERIFIED.

## Finding 3 — Docker Agent illustrates portable, provider-neutral agent packaging

**Evidence:** The official Docker Agent repository documents declarative YAML agent definitions, multi-agent delegation, MCP toolsets, multiple model providers, and publishing/consuming agents through OCI registries.

Source:
- https://github.com/docker/docker-agent

**Affected GLORIFIER components:** Capability Registry, agent packaging, provider adapters, MCP Gateway, federation handoff.

**Proposed change:** Keep a small provider-neutral agent/task contract and consider a future import/export adapter for declarative agent manifests. Map imported capabilities into GLORIFIER's authorization/evidence model; never import permissions, credentials, or trust from a third-party manifest by default.

**Risk:** Tool/permission sprawl, manifest supply-chain risk, provider-specific behavior hidden behind common syntax, and untrusted OCI artifacts.

**Verification required:** schema validation, image/artifact provenance, signature policy, explicit permission diff, provider-error preservation, and sandboxed conformance tests. No Docker Agent integration is implemented by this document.

## Finding 4 — A2A/MCP, identity, authorization, and containment must remain distinct

**Evidence:** The existing GLORIFIER contracts correctly distinguish A2A agent-to-agent coordination from MCP tool/context interoperability, and the verification matrix still requires live protocol tests and cryptographic identity evidence.

**Affected GLORIFIER components:** Agent Card, A2A/MCP Gateway, GEAS, verification evidence registry.

**Proposed change:** Keep protocol version, cryptographic identity, GEAS authorization, runtime containment, and task outcome as separate claims. Do not infer one from another.

**Risk:** A discovered or signed agent could still request an unauthorized action; a conformant protocol implementation could still be unsafe.

**Verification required:** live A2A v1.0 conformance, signed-card trust/expiry/revocation checks, MCP tests for each declared protocol revision, and negative authorization tests. These remain NOT_VERIFIED absent retained test evidence.

## Finding 5 — Provider neutrality requires explicit semantics, not merely a shared API shape

**Evidence:** Docker Agent's broad provider support illustrates growing demand for multi-provider agent execution. It does not prove identical tool-call, streaming, refusal, usage, or error semantics across providers.

**Affected GLORIFIER components:** Provider Registry, normalization adapters, task state machine, cost/metering, evaluation harness.

**Proposed change:** Maintain a shared internal contract for task intent, structured outputs, streaming events, tool calls, cancellation, retries/idempotency, errors, token/usage records, and provenance while retaining raw provider-native responses/errors for audit.

**Risk:** False equivalence, silent loss of provider-specific refusal/error behavior, duplicate side effects on retries, and incorrect cost accounting.

**Verification required:** a versioned task corpus, explicit acceptance thresholds, repeated runs, error/refusal tests, idempotency tests, and usage reconciliation. Semantic equivalence and billing reconciliation remain NOT_VERIFIED.

## Changes made in this watch

- Updated docs/RUNTIME-COMPATIBILITY-CONTRACT.md to reference Dynamo v1.5.1 and document remote-fetch, DNS rebinding, proxy, payload-limit, and local-path verification requirements.
- Added this dated architecture-watch report with evidence, affected components, proposed changes, risks, and verification criteria.

These are documentation/contract improvements only. They do not establish live runtime behavior or change any operational verification status.

## Still recommendation-only / NOT_VERIFIED

- A2A v1.0 live conformance and signed Agent Card verification.
- MCP 2025-11-25 and 2026-07-28 live conformance.
- Production runtime sandbox/quarantine.
- Kubernetes/GPU deployment and NVIDIA Dynamo deployment.
- OpenShell or Docker Agent integration.
- Cross-provider semantic-equivalence testing.
- Provider billing reconciliation.
- Independently verified economic outcomes.

No credentials were added, no authorization was bypassed, no infrastructure was deployed, and no financial or irreversible production action was taken.
