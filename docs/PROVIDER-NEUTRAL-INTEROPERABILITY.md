# GLORIFIER Provider-Neutral Interoperability

GLORIFIER owns orchestration and governance semantics. Providers, models, agent frameworks, inference engines, and tool protocols are replaceable capabilities.

## Protocol separation

- A2A: agent-to-agent discovery, delegation, task interaction, and results.
- MCP: agent/application-to-tool, resource, and prompt interoperability.
- Provider API adapters: model-specific request/response translation.
- Governance Kernel: authorization, policy, identity, authority attenuation, approval, and evidence requirements.
- Evidence layer: provenance, receipts, verification state, and externally observable outcomes.

A2A and MCP are complementary rather than interchangeable.

## Capability registry

Provider and framework entries should declare protocol versions, transport, modalities, tool-call semantics, streaming, structured output, authentication mode, authorization scope, rate/quota constraints, observability hooks, compatibility evidence, and lifecycle/deprecation state.

Capability declaration does not grant authority.

## Semantic portability

GLORIFIER should normalize provider-specific differences into internal contracts for task intent, tool invocation, structured output, streaming events, errors, usage/metering, evidence, cancellation, retries, and idempotency.

Adapters must preserve provider-native errors rather than translating every failure into success.

## Version and deprecation discipline

Provider and protocol versions must be explicit. Deprecated or end-of-life interfaces should be represented as compatibility risks, not silently substituted.

## Verification boundary

A provider integration is not FULLY_VERIFIED because configuration exists. Verification requires a real, authorized test request and evidence appropriate to the integration.

No credentials belong in Agent Cards, schemas, documentation examples, or source control.
