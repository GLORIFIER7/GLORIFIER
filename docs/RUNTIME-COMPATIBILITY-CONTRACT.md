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

## NVIDIA Dynamo example

Dynamo v1.5.0 is a concrete example of why versioned compatibility matters. NVIDIA publishes backend, CUDA, driver, GPU, OS, and architecture compatibility for each release. GLORIFIER should therefore record an exact runtime tuple rather than a generic NVIDIA Dynamo supported flag.

This repository does not claim that any Dynamo runtime is deployed or verified.

## Governance boundary

Compatibility evidence is informational. It does not grant authority, credentials, production access, financial permissions, or deployment approval.

## Verification

A future runtime verifier may collect runtime and backend versions, accelerator and driver metadata, protocol support, health/readiness evidence, deployment target, and timestamped provenance. The verifier must fail closed when required evidence is missing.
