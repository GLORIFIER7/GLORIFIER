# GLORIFIER Remote-Input and Runtime Security Requirements

## Evidence: NVIDIA Dynamo 1.5.1

NVIDIA's official Dynamo 1.5.1 release notes, published October 6, 2026, document bounds on client-supplied multimodal input and remote media downloads, DNS address pinning between validation and connection, explicit opt-in for ambient proxy use, and an allowed directory for local SGLang diffusion references.

References:
- https://docs.nvidia.com/dynamo/v1.5.1/reference/releases/v1-5-0
- https://docs.nvidia.com/dynamo/v1.5.1/reference/compatibility

This is evidence about Dynamo's release, not evidence that GLORIFIER deploys Dynamo or has the same implementation.

## Requirements for GLORIFIER fetch paths

Any component that fetches URLs or media supplied by a user, agent, provider, or external document SHOULD:

- validate destination addresses and connect only to the validated address;
- preserve TLS hostname verification against the requested hostname;
- reject loopback, private, link-local, and cloud-metadata destinations by default;
- revalidate every redirect target;
- enforce byte, media-dimension, redirect-count, concurrency, and time limits;
- make proxy use explicit and auditable;
- treat caller-provided paths and MIME types as untrusted;
- avoid exposing internal-fetch bypass flags to untrusted callers.

These are requirements, not claims that existing GLORIFIER fetch paths already implement them.

## Runtime compatibility record

Record the exact runtime release, backend and backend version, CUDA, minimum driver, GPU family, operating system, architecture, deployment target, and evidence reference. Do not infer compatibility from a vendor or backend name alone.

NVIDIA's Dynamo 1.5.1 compatibility matrix lists tested combinations. Check it before declaring any specific combination compatible.

## Verification plan

Run authorized tests in an isolated environment for:

1. DNS answer changes between validation and connection;
2. redirects to private, link-local, loopback, and metadata destinations;
3. proxy routing and proxy-policy enforcement;
4. oversized inline data and remote downloads;
5. malformed media and out-of-range dimensions;
6. timeouts, cancellation, and bounded concurrency.

Tests must not target third-party systems. Missing test evidence means NOT_VERIFIED.

## Agent containment requirements

Reported agent incidents are a reason to require—not assume—default-deny egress, per-task budgets, tool allowlists, isolated credentials, audit correlation, and an operator-controlled stop/quarantine mechanism. The stop mechanism must not depend on the agent's cooperation.

A kill/quarantine control is not VERIFIED until a controlled canary demonstrates that it blocks new actions, interrupts active work where supported, and produces auditable evidence.

## Governance boundary

GEAS remains the authorization boundary. Runtime isolation and network policy enforce constraints but do not grant business authority. A provider sandbox is not a substitute for GLORIFIER authorization, and a successful request is not proof of an independently verified outcome.
