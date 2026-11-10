# NVIDIA Dynamo runtime integration

## Status

**Adapter source: under review in GLORIFIER-NEURAL PR #67. Live Dynamo deployment: NOT VERIFIED.**

This integration makes GLORIFIER-NEURAL capable of calling an owner-operated NVIDIA Dynamo frontend. It does not install Dynamo, provision a GPU, create a Kubernetes cluster, download a model, or turn a remote endpoint into an authorized runtime.

The adapter uses the Dynamo OpenAI-compatible API:
- `GET /v1/models` for bounded, read-only model-catalogue readiness.
- `POST /v1/chat/completions` for bounded, non-streaming inference.

A successful models request is not evidence that inference works. A source test is not a live Dynamo deployment.

## Configuration contract

Configure these values in the Cloudflare Worker secret/environment manager or the local deployment secret manager. Do not commit credentials.

| Setting | Required value |
|---|---|
| `GLORIFIER_PROVIDER` | `nvidia_dynamo` |
| `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS` | `true`, only after the exact destination and egress policy have been approved |
| `GLORIFIER_ENABLE_INFERENCE` | Keep `false` until a real endpoint is ready and inference is separately authorized |
| `GLORIFIER_PAID_INFERENCE_AUTHORIZED` | `false` by default; set `true` only for separately owner-authorized paid inference |
| `NVIDIA_DYNAMO_BASE_URL` | Exact HTTPS API root, for example `https://dynamo.example.com/v1` |
| `NVIDIA_DYNAMO_ALLOWED_ORIGIN` | Exact HTTPS origin only, for example `https://dynamo.example.com` |
| `NVIDIA_DYNAMO_API_KEY` | Bearer credential for the approved ingress/authentication gateway |
| `NVIDIA_DYNAMO_MODEL` | Exact model ID returned by Dynamo's `/v1/models` endpoint |

The adapter rejects HTTP, URL credentials, query/fragment suffixes, non-`/v1` API paths, wildcard/mismatched origins, redirects, non-200 responses, malformed JSON, oversized responses, and prompts beyond its configured limit.

The ingress in front of Dynamo must actually validate the bearer credential and enforce TLS. Merely sending an Authorization header does not prove the Dynamo server or gateway enforces authentication. Do not expose an unauthenticated Dynamo frontend directly to the public internet.

Readiness is authorized by explicit external-egress consent. Inference requires external-egress consent, `GLORIFIER_ENABLE_INFERENCE=true`, and the separate `GLORIFIER_PAID_INFERENCE_AUTHORIZED=true` spend authorization. The spend authorization defaults to false. The provider is never selected automatically.

## NVIDIA compatibility baseline

Use NVIDIA's release-specific compatibility matrix before selecting an image/backend tuple. The following is a documented candidate baseline, not a claim about GLORIFIER's infrastructure:

| Dynamo release | Backend | Backend version | CUDA | Minimum Linux driver |
|---|---|---:|---:|---:|
| v1.6.0 | vLLM | 0.31.0 | 13.0 | 580.xx+ |
| v1.6.0 | SGLang | 0.5.21 | 13.0 | 580.xx+ |
| v1.6.0 | TensorRT-LLM | 1.3.0rc29 | 13.1 | 580.xx+ |

NVIDIA's v1.6.0 compatibility page lists NVIDIA Ampere, Ada Lovelace, Hopper, and Blackwell GPU architectures; Ubuntu 22.04/24.04; x86_64; and ARM64 on Ubuntu 24.04. The backend, CUDA, driver, GPU, OS, and architecture combination must be checked together. Do not mix a backend pin from one Dynamo release with another release's container or driver requirements.

For a Kubernetes deployment, NVIDIA's current installation guide requires Kubernetes 1.30 or later with GPU nodes, kubectl 1.30 or later, and Helm 3 or later. Run NVIDIA's pre-deployment check before installing the platform. A real GPU node must advertise allocatable NVIDIA GPU resources and pass a harmless GPU visibility canary.

## Verification sequence

1. **Pin the tuple.** Record Dynamo release and image digest, backend and backend version, model ID/revision, GPU model/architecture/count/memory, host OS/architecture, CUDA runtime, NVIDIA driver, Kubernetes version (if applicable), GPU Operator/device-plugin version, and scheduler/operator versions.
2. **Prove infrastructure.** Retain GPU inventory and `nvidia-smi`, node readiness, allocatable GPU resources, storage/network policy, deployment manifests, image digests, pod events, and scheduler placement. For Kubernetes, preserve the pre-deployment check output.
3. **Prove process health.** Verify the Dynamo frontend and worker readiness using the release-matched health checks and retained logs.
4. **Prove model availability.** Call authenticated `GET /v1/models` through the exact configured HTTPS origin. Confirm the exact configured model ID is present. Retain a redacted response and timestamp.
5. **Prove inference.** With an approved non-sensitive canary prompt, call non-streaming `POST /v1/chat/completions`. Verify the requested model, successful response schema, non-empty bounded output, request/correlation IDs, timeout behavior, and sanitized failures.
6. **Prove operations and security.** Test unauthorized requests, wrong origins, redirects, oversized bodies/responses, timeouts, cancellation, concurrency/resource ceilings, network egress restrictions, log redaction, and the operator stop/rollback path.
7. **Repeat and retain.** Run the exact-head CI suite and the authorized live smoke after deployment. Store immutable logs/reports and digests with commit SHA, timestamps, environment identity, and reviewer approval.

## Promotion policy

Keep the capability **NOT VERIFIED** until an authorized GPU-backed Dynamo deployment completes the full sequence above. Promote only the exact version/backend/hardware/deployment tuple supported by the retained evidence. A successful build, manifest validation, model-catalogue response, or adapter unit test alone is insufficient.

No deployment, credential creation, paid compute allocation, model download, public endpoint exposure, or production inference is performed by this repository change.

## NVIDIA references

- [Dynamo v1.6.0 compatibility matrix](https://docs.nvidia.com/dynamo/v1.6.0/reference/compatibility)
- [Dynamo local installation and system requirements](https://docs.nvidia.com/dynamo/v1.6.0/cli/installation/install-dynamo)
- [Dynamo Kubernetes installation guide](https://docs.nvidia.com/dynamo/v1.6.0/kubernetes/installation/install-dynamo)
- [Dynamo frontend API endpoints](https://docs.nvidia.com/dynamo/reference/components/frontend-configuration)
- [Dynamo frontend feature matrix](https://docs.nvidia.com/dynamo/v1.6.0/components/frontend)
