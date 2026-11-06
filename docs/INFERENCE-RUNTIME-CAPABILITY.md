# Provider-Neutral Inference Runtime Capability

GLORIFIER treats inference infrastructure as a replaceable execution substrate.

## Logical model
Capability -> Runtime -> Provider -> Model -> Accelerator

Example:
text-generation -> distributed-inference -> NVIDIA -> model-X -> GPU

The governance layer authorizes the capability/task. The runtime layer decides how an authorized capability is executed.

## Runtime capability record
A future provider/runtime registry entry SHOULD expose:
- runtime_id
- provider_id
- model_id
- backend
- accelerator
- deployment_target
- region
- supported_protocols
- context_limit
- latency_class
- cost_class
- health_status
- last_verified_at

## Current ecosystem examples
NVIDIA Dynamo documents interoperability with vLLM, SGLang and TensorRT-LLM and deployment across Kubernetes, Slurm and local environments.

Source: https://docs.nvidia.com/dynamo/

OpenAI's Agents SDK exposes an application-owned runtime model with tools, MCP, orchestration, guardrails, human review and observability.

Source: https://developers.openai.com/api/docs/guides/agents/sdk

## Non-goals
This document does NOT authorize:
- autonomous financial activity
- autonomous credential rotation
- irreversible production changes
- bypassing GEAS
- treating provider health as evidence of task correctness

## Implemented source status — 2026-11-06

The NEURAL monorepo migration branch now contains an optional self-hosted vLLM adapter at `services/neural/app/providers/vllm.py`.

- The adapter targets an OpenAI-compatible vLLM `/v1` API and requires an explicitly configured HTTPS base URL, an exact HTTPS origin allowlist, API key, and model ID.
- Runtime registration requires `GLORIFIER_PROVIDER=vllm` and `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`; inference separately requires `GLORIFIER_ENABLE_INFERENCE=true`.
- It supports authenticated model-catalogue readiness and bounded, non-streaming chat completions. Redirects are disabled. Unsafe or mismatched origins fail closed.
- Contract tests cover origin validation, configuration and consent gates, readiness, inference wiring, redirect mode, and prompt bounds.

**Evidence status:** PARTIALLY VERIFIED. On PR #672 commit `35085d6b7cf9f54f55afe32177935ed04c01c6d8`, GitHub Actions completed the NEURAL service tests on Python 3.11 and 3.12, Ruff, dependency audit, container build, runtime image database-driver check, and disposable PostgreSQL migration/RLS/least-privilege checks successfully. A subsequent workflow bootstrap correction and its test expectation update are being revalidated on the newer PR head.

**Not verified:** no GPU instance or Kubernetes cluster has been provisioned; no vLLM model server or TLS gateway has been deployed; no live GPU-backed inference has been performed; no NVIDIA Dynamo deployment or multi-node scheduling is evidenced. The adapter is an integration capability, not proof of available compute.
