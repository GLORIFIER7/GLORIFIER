# Live AI connectivity matrix

The `Live AI Connectivity Matrix` GitHub Actions workflow separates repository-level contract tests from live authenticated probes.

## Coverage

- OpenAI, Gemini, Anthropic, and NVIDIA Nemotron authenticated model-catalog requests.
- Optional bounded inference calls for the configured providers.
- GLORIFIER provider registry observation and an optional two-provider AI Council request.
- Authenticated, read-only A2A `ListTasks` plus the public Agent Card.
- MCP 2026-07-28 `server/discover`, `tools/list`, and a read-only `github_get_repository` call.
- GLORIFIER Neural `/api/neural/health` and `/api/neural/ready` endpoints.

Provider failover deliberately remains `NOT_VERIFIED`: the existing registry has bounded retry/fallback behavior and regression coverage, but no dedicated owner-authenticated live failover canary currently exists.

## Required GitHub configuration

Add only the secrets for integrations intended to be tested:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `NVIDIA_API_KEY`
- `GLORIFIER_LIVE_PROBE_BEARER_TOKEN`: a short-lived, least-privilege owner or internal-service bearer accepted by GLORIFIER for AI Council and A2A read access. Never commit this value or put it in a URL.

Optional Actions variables:

- `OPENAI_MODEL`, `OPENAI_BASE_URL`
- `GEMINI_MODEL`
- `ANTHROPIC_MODEL`
- `NVIDIA_MODEL`, `NVIDIA_BASE_URL`
- `NVIDIA_AUTHORIZED=true`, only after NVIDIA inference has been explicitly authorized.

The workflow can be run without provider secrets. Missing credentials are reported as `NOT_CONFIGURED`; this is not a provider failure.

## Running

1. Open Actions → Live AI Connectivity Matrix → Run workflow.
2. Keep `allow_metered_probes=false` for non-inference connectivity checks.
3. Set `allow_metered_probes=true` only when the owner explicitly authorizes short inference calls and possible provider charges. The workflow performs at most one short generation request per configured provider (up to four), plus two AI Council participant generations and, when both participants succeed, one synthesis generation. The total upper bound is seven short generation calls.
4. Download the `glorifier-live-ai-connectivity-*` artifact. It records UTC observation time, commit/ref, endpoint stages, HTTP status, latency, safe request IDs, model identifiers, and response digests.

## Evidence labels

- `VERIFIED`: a live authenticated inference or live protocol operation returned a valid response.
- `AUTHENTICATED_API_ACCESS`: the authenticated model catalogue succeeded; inference was not run.
- `NOT_CONFIGURED`: a required secret or bearer was absent.
- `BLOCKED_BY_POLICY`: provider-specific authorization was not enabled.
- `PARTIALLY_VERIFIED`: only part of a protocol sequence or Council diversity condition succeeded.
- `DEGRADED_OR_NOT_CONFIGURED`: the Neural health/readiness endpoint returned a fail-closed 503.
- `NOT_VERIFIED`: no qualifying live evidence was collected.

## Safety and scope

Provider keys, bearer tokens, prompts, raw completions, and upstream error bodies are never written to the evidence file. Inference output is represented only by its character count and SHA-256 digest. Responses are capped at 1 MB and requests time out after 15 seconds.

A2A checks only the Agent Card and authenticated read-only `ListTasks`; they do not create tasks. MCP probes only discovery, tool listing, and the repository read tool. These checks do not establish full A2A or MCP TCK conformance, streaming, cancellation, external multi-agent execution, or business authority.

Provider failover requires a separate owner-authorized, bounded live canary before it can be marked verified. Do not infer live failover from mocked or unit tests.