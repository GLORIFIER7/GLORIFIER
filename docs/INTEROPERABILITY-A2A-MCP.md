# GLORIFIER A2A + MCP Interoperability Contract

## Roles

| Protocol | GLORIFIER role |
|---|---|
| A2A | Agent-to-agent discovery, delegation, task lifecycle |
| MCP | Agent-to-tool/context interoperability |
| GEAS | Authorization and authority attenuation |
| Evidence layer | Provenance, receipts, verification |
| Runtime | Execution substrate |

## Mandatory execution correlation

Every governed cross-agent/tool execution SHOULD carry a stable correlation chain:

1. request_id
2. task_id
3. delegation_id when authority is delegated
4. execution_id
5. tool_call_id when a tool is used
6. evidence_id for resulting evidence

These identifiers are correlation metadata. They are not authorization credentials.

## MCP compatibility

Target specification: 2026-07-28.

The adapter should preserve requested protocol version, supported versions, negotiated extensions/capabilities, server/tool identity, request correlation, and authorization reference.

Unsupported protocol versions must result in an explicit compatibility failure.

MCP capability declarations are descriptive. They do not grant GLORIFIER authority.

## A2A compatibility

Target specification: 1.0.

The federation layer should preserve Agent Card identity, declared capabilities, task identity, delegation identity, authorization reference, lifecycle state, and evidence state.

Signed Agent Cards may be used for stronger identity verification. Until cryptographic verification is implemented and tested, GLORIFIER status must remain NOT VERIFIED.

## Security model

Prompt and tool content is untrusted input.

A remote agent or MCP server MUST NOT be able to:

- grant itself authority
- expand an existing authorization
- change the human-approval requirement
- authorize financial transfer
- rotate credentials
- perform irreversible production changes

GEAS remains the enforcement boundary.

## Retry and idempotency

Retryable tasks require an idempotency key.

Duplicate keys represent the same logical operation unless an explicit policy allows a new attempt.

## Evidence states

Use only the repository's controlled verification vocabulary:

- UNKNOWN
- NOT VERIFIED
- PARTIALLY VERIFIED
- VERIFIED
- FULLY VERIFIED
- DEGRADED
- NOT OBSERVABLE

Protocol success must never automatically become FULLY VERIFIED.

## Live conformance tests

A future live test suite should verify MCP version negotiation, unsupported-version handling, extension fallback, A2A Agent Card parsing, A2A task lifecycle, signed identity validation, delegated-authority attenuation, idempotent retry, trace/evidence correlation, and authorization denial.

Until those tests execute against real peers, interoperability remains NOT VERIFIED.
