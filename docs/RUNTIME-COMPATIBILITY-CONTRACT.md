# GLORIFIER Runtime Compatibility Contract

## Purpose

GLORIFIER must treat an AI runtime as a versioned, observable capability, not as a vendor label. A provider, model, inference engine, accelerator, driver, protocol, or deployment target is not considered compatible merely because it is named in configuration.

## Runtime identity

Every executable AI runtime SHOULD be representable by:

- runtime_id
- runtime_version
- provider
- model_id
- inference_backend
- backend_version
- accelerator
- cuda_version when applicable
- driver_version when applicable
- deployment_target
- protocols
- health_status
- compatibility_status
- verified_at
- evidence_reference

## Status semantics

FULLY_VERIFIED means the exact runtime combination has current evidence covering the required compatibility dimensions.

VERIFIED means the declared compatibility has sufficient evidence for the stated scope.

PARTIALLY_VERIFIED means some dimensions are evidenced but one or more required dimensions remain unverified.

NOT_VERIFIED means compatibility is declared but evidence is absent.

DEGRADED means a required component is unhealthy or unavailable.

NOT_OBSERVABLE means the environment cannot provide the evidence needed to determine status.

Unknown values must never be converted into success.

## NVIDIA Dynamo version note (checked 2026-10-09)

NVIDIA Dynamo v1.5.1 was released on 2026-10-06. Its published compatibility matrix lists tested SGLang 0.5.18, TensorRT-LLM 1.3.0rc25, and vLLM 0.28.0 combinations, with backend-specific CUDA/driver requirements, supported GPU families, operating systems, and architectures. v1.5.1 adds input limits and hardening for multimodal remote media fetches, including pinning the resolved address used for a validated fetch; it also changes proxy and local-file policy behavior.

Consequences for GLORIFIER:

- Record the exact patch release and complete runtime tuple; do not treat v1.5.0 and v1.5.1 as interchangeable.
- Treat user-controlled URLs, media references, and local file references as untrusted inputs.
- For remote fetches, validate the resolved destination and connect to the validated address; defend against DNS rebinding and redirects into private/link-local/metadata ranges.
- Apply explicit byte, time, redirect, MIME/type, and decoded-dimension limits.
- Keep egress policy and any proxy exception explicit and auditable.

Authoritative references:
- https://docs.nvidia.com/dynamo/v1.5.1/reference/compatibility
- https://docs.nvidia.com/dynamo/v1.5.0/reference/releases/v1-5-0

This repository does not claim that any Dynamo runtime is deployed or verified.

## Governance boundary

Compatibility evidence is informational. It does not grant authority, credentials, production access, financial permissions, or deployment approval.

## Verification

A future runtime verifier may collect runtime and backend versions, accelerator and driver metadata, protocol support, health/readiness evidence, deployment target, and timestamped provenance. The verifier must fail closed when required evidence is missing.

For any network fetcher, verification should include:
1. DNS rebinding/answer-change simulation;
2. redirect-to-private-address denial;
3. oversized response and slow-response limits;
4. proxy policy behavior;
5. local-path traversal denial;
6. retained security-test evidence.

A documentation entry or version pin alone is not evidence of a deployed, safe runtime.
