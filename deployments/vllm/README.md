# GLORIFIER self-hosted vLLM worker

**Status: deployment template only — no GPU, Kubernetes cluster, ingress, secret, or live model endpoint is provisioned by this repository change.**

This deployment is a first single-GPU worker for the optional `vllm` provider in `services/neural`. It intentionally starts with one replica and a small model so the first real inference path can be measured before scaling.

## Architecture

`GLORIFIER-NEURAL` calls an HTTPS ingress hostname. The ingress forwards only the authenticated `/v1` path to a private Kubernetes `ClusterIP` service. Kubernetes schedules one vLLM Pod onto a node advertising `nvidia.com/gpu`. Model weights are cached on a persistent volume.

The manifest is based on the vLLM Kubernetes deployment guidance and uses the versioned `vllm/vllm-openai:v0.33.0` image tag. Pin the validated image digest in the deployment record before production rollout.

## Prerequisites

- An authorized Kubernetes cluster with at least one compatible NVIDIA GPU node.
- NVIDIA drivers and the NVIDIA Kubernetes Device Plugin; the node must advertise `nvidia.com/gpu`.
- An installed `nginx` Ingress controller (or a reviewed adaptation of the Ingress and NetworkPolicy to the chosen controller).
- A persistent-volume StorageClass that can provision a 20 GiB ReadWriteOnce volume.
- Public DNS for a hostname you control, plus a valid TLS certificate.
- An authorized compute allocation and an approved model/license review.

The example requests 1 GPU, 4 CPU cores and 16 GiB memory, with limits of 1 GPU, 10 CPU cores and 24 GiB memory. These are starting requests, not a claim that every GPU or model will fit. Profile GPU memory, throughput, latency and cost on the selected hardware before changing the model or concurrency.

## Create secrets outside Git

Do not commit API keys, model credentials, TLS private keys, or generated Secret manifests.

Create the namespace by applying the manifest once, then provision the two referenced secrets using your approved secret-management procedure:

- `glorifier-vllm-api`, key `api-key`: a strong, randomly generated inference API key.
- `glorifier-vllm-tls`: a TLS Secret with a certificate valid for `vllm.example.com`.

For a controlled non-production setup, the Kubernetes CLI equivalents are:

```bash
kubectl create namespace glorifier-ai --dry-run=client -o yaml | kubectl apply -f -
kubectl -n glorifier-ai create secret generic glorifier-vllm-api \
  --from-file=api-key=/secure/path/vllm-api-key
kubectl -n glorifier-ai create secret tls glorifier-vllm-tls \
  --cert=/secure/path/tls.crt --key=/secure/path/tls.key
kubectl apply -f deployments/vllm/kubernetes.yaml --dry-run=client
kubectl apply -f deployments/vllm/kubernetes.yaml
```

Create the secrets before the Deployment starts. Read the API key from a protected file or approved secret manager; do not pass its value as a command-line literal or commit it to shell history. Prefer an external secret manager or cert-manager for production. Replace `vllm.example.com` in the manifest with the approved hostname before applying it. The manifest's NetworkPolicy allows ingress only from the `ingress-nginx` namespace; adapt that selector only after reviewing the actual controller namespace and labels.

## GLORIFIER-NEURAL configuration

Set these values in the NEURAL runtime's secret/configuration manager, not in source control:

| Setting | Value |
|---|---|
| `GLORIFIER_PROVIDER` | `vllm` |
| `GLORIFIER_VLLM_BASE_URL` | `https://vllm.example.com/v1` |
| `GLORIFIER_VLLM_ALLOWED_ORIGIN` | `https://vllm.example.com` |
| `GLORIFIER_VLLM_MODEL` | `Qwen/Qwen3-0.6B` |
| `GLORIFIER_VLLM_API_KEY` | Same secret value as Kubernetes `api-key` |
| `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS` | `true`, only after egress is reviewed and explicitly authorized |
| `GLORIFIER_ENABLE_INFERENCE` | `true`, only after compute funding and inference use are authorized |
| `GLORIFIER_PAID_INFERENCE_AUTHORIZED` | `false` by default; `true` only after explicit owner authorization for the paid request |

The NEURAL Worker must be able to reach the HTTPS hostname. A private ClusterIP address is not reachable directly from Cloudflare Workers. Establish and test a properly authenticated, TLS-protected route before configuring the provider.

## Exposure and security boundaries

- The Ingress routes only `/v1`; it does not publish `/invocations`, `/pause`, `/resume`, or other operational endpoints.
- vLLM's API key protects the OpenAI-compatible API paths, but vLLM documents other unauthenticated endpoints. Do not expose the vLLM Pod or Service directly to the public internet; preserve the path restriction and restrict ingress-controller access.
- The Service is `ClusterIP`, and the NetworkPolicy admits inbound traffic only from the ingress-controller namespace.
- The API key is stored as a Kubernetes Secret and supplied through `VLLM_API_KEY`. Do not rely on that key alone if any additional route exposes the Pod.
- The manifest does not implement an outbound egress allowlist for model download. Review and constrain egress at the cluster/network layer and record which model registry and endpoints are allowed.
- Configure gateway rate limits, request-size limits, request timeouts, monitoring and an emergency disable path before production use.
- The one-replica `Recreate` strategy avoids temporarily scheduling two GPU-consuming Pods during an update. It is not high availability or autoscaling.

## Deployment verification gates

Do not mark this worker VERIFIED merely because Kubernetes accepts the YAML or the Pod becomes Ready.

1. Validate the manifest and record the cluster, Kubernetes version, GPU model, driver, CUDA/runtime compatibility, image digest and storage class.
2. Confirm the Pod is scheduled with one allocated `nvidia.com/gpu`; confirm the model loads and the process serves health.
3. Confirm HTTPS certificate validation and that only `/v1` is externally routed. Verify requests to `/invocations` and operational endpoints are not routed.
4. From the authorized NEURAL runtime, verify `GET /v1/models` using the configured key and confirm the exact served model ID.
5. Run one harmless, explicitly authorized inference request. Record request ID, provider/model, output status, latency, token counts if available, GPU utilization, and estimated/actual provider or compute cost.
6. Test shutdown/rollback and confirm the worker stops accepting new requests.

Until all required gates pass, report GPU deployment and live inference as **NOT VERIFIED**. Contract tests for the NEURAL adapter prove only the adapter behavior, not the existence or performance of this worker.

## Scale-out

This template is deliberately single-replica. Do not turn on replicas or autoscaling until a measured workload, GPU memory profile, queueing policy, concurrency limit, budget ceiling, and model-quality benchmark exist. Multi-node inference and large GPU fleets require a separately tested scheduler/runtime design such as NVIDIA Dynamo; no Dynamo deployment is implied here.

## Upstream references

- vLLM Kubernetes deployment: https://docs.vllm.ai/en/latest/deployment/k8s/
- vLLM Helm deployment: https://docs.vllm.ai/en/latest/deployment/frameworks/helm/
- vLLM serving CLI: https://docs.vllm.ai/en/latest/cli/serve/
- vLLM security limitations: https://docs.vllm.ai/en/latest/usage/security/
