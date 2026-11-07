# GEAS OpenTelemetry GenAI runtime crosswalk (proposal)

Status: **recommendation / analysis only**. The OpenTelemetry GenAI agent-span conventions are currently marked **Development**. This document maps the public convention to GEAS telemetry design; it does not assert that GLORIFIER emits conformant spans, exports telemetry successfully, or has independently verified runtime observability.

## Authoritative sources

- [OpenTelemetry GenAI agent and framework spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md)
- [OpenTelemetry GenAI attribute registry notice](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
- [OpenTelemetry semantic-conventions repository](https://github.com/open-telemetry/semantic-conventions-genai)

The core OpenTelemetry attribute registry states that GenAI attributes have moved to the dedicated GenAI semantic-conventions repository. The agent-span document describes create-agent, invoke-agent client/internal, planning, and tool-execution spans. Its current status is Development, so the source content hash and observation time must be retained and the conventions must not be represented as stable without a later release/status check.

## Proposed GEAS mapping

| OpenTelemetry convention | Proposed GEAS mapping | Runtime evidence required | Limitation |
| --- | --- | --- | --- |
| `gen_ai.operation.name` | Normalized operation type such as `create_agent`, `invoke_agent`, `invoke_workflow`, `plan`, or tool execution | Exported span with exact operation name, parent/child relationship, and observation timestamp | A code constant or test fixture is not runtime telemetry. |
| `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.version` | Stable agent identity and version in the GEAS agent registry | Runtime span attributes reconciled to the deployed agent manifest and identity record | Avoid ephemeral in-memory instance IDs and high-cardinality names. |
| `gen_ai.provider.name`, `gen_ai.request.model`, `server.address`, `server.port` | Provider/model/endpoint routing evidence | Exported span attributes reconciled to the actual observed endpoint and provider response metadata | A configured provider or proxy address does not prove which upstream model actually served the request. |
| `gen_ai.conversation.id` and trace context | Conversation/session correlation across agent, model, and tool spans | Trace graph with stable correlation identifiers and verified propagation across process boundaries | Do not use conversation IDs as authorization credentials or expose them in public metrics. |
| Invoke-agent, plan, and execute-tool spans | Agent lifecycle and governed-action trace graph | Parent/child spans, tool-call outcome, error status, and links to policy decision/evidence IDs | A trace alone does not prove that policy enforcement occurred before the action. |
| `gen_ai.input.messages`, `gen_ai.system_instructions`, tool arguments/results | Sensitive-content evidence references, not default span payloads | Explicit opt-in, data classification, redaction, retention, and access-control evidence | These fields can contain prompts, secrets, personal data, and tool output; avoid recording raw content by default. |

## Runtime verification contract

A GEAS runtime-verification result should require all of the following before it can be promoted beyond analysis:

1. A real trace export from the deployed process, bound to the exact deployment or runtime revision.
2. Collector/exporter identity, endpoint, transport security, and authentication evidence.
3. Resource attributes identifying service, environment, version, and deployment revision.
4. Span-graph checks for agent invocation, planning where observable, model calls, and tool execution.
5. Correlation propagation across asynchronous and cross-process boundaries.
6. Error and timeout observations, including exporter failure and dropped-span behavior.
7. Sampling, redaction, retention, and access-control evidence for sensitive GenAI attributes.
8. Exact source content hash and convention status/version used by the verifier.

A successful local unit test or syntactically valid span fixture proves only that the verifier accepts the fixture. It does not prove that the deployed runtime emits, exports, retains, or protects telemetry.

## Current GLORIFIER evidence boundary

The existing GEAS OpenTelemetry runtime contract tests validate supplied evidence structures. They do not independently connect to a deployed collector, authenticate an exporter, inspect a production trace backend, or prove cross-provider semantic equivalence. Therefore:

- OpenTelemetry runtime conformance: **NOT VERIFIED**
- Production GenAI span export: **NOT VERIFIED**
- Cross-agent and cross-provider correlation: **NOT VERIFIED**
- Sensitive-attribute redaction and retention: **NOT VERIFIED**

The source registry update improves the scanner's reference precision only. It does not change these runtime statuses.
