# NVIDIA Megatron Core — GLORIFIER adoption boundary

**Status: architecture/control-plane adoption only. No Megatron code is vendored, no training runtime is provisioned, and no training job is submitted by this change.**

## Decision

Adopt NVIDIA Megatron Core as an optional, separately hosted **distributed model-training framework**. Do not register it as an inference provider and do not place its CUDA/PyTorch stack inside the NEURAL Cloudflare Worker.

The upstream [NVIDIA/Megatron-LM repository](https://github.com/NVIDIA/Megatron-LM) contains two related pieces:

- **Megatron-LM**: reference training examples and preconfigured training scripts.
- **Megatron Core**: composable, GPU-optimized transformer and distributed-training building blocks for custom training frameworks.

The upstream project documents tensor, pipeline, data, expert and context parallelism, mixed precision (FP16, BF16, FP8 and FP4), distributed checkpointing, and a Python 3.12+ / PyTorch 2.6.0+ recommended environment. Confirm the exact release-specific runtime, CUDA, driver, GPU and model compatibility before deployment; do not infer compatibility from the framework name alone.

## Placement in GLORIFIER

```text
Human Owner
    |
GEAS — dataset approval, authorization, budget ceiling, audit policy
    |
GLORIFIER AI CEO / Specialist Council
    |
Training job specification and evidence contract
    |
Separate GPU-hosted training environment (future integration)
    |
NVIDIA Megatron Core
    |
Versioned checkpoint + training provenance
    |
Independent evaluation, security and compatibility gates
    |
Human/GEAS-approved model registry promotion
    |
Existing inference plane: NVIDIA NIM / Nemotron / Dynamo / other providers
```

Training and inference are separate capabilities. Megatron produces or updates model checkpoints; it does not replace NVIDIA NIM, Nemotron, Dynamo, NEURAL's inference adapters, or GLORIFIER's provider registry.

## What this repository change adopts

- A separate `training` plane in the NVIDIA architecture snapshot.
- A distinct `components.megatron` capability record. `NVIDIA_MEGATRON_ENABLED=true` records an explicit enablement declaration only; it does not prove a GPU, scheduler, runner, credentials, or endpoint exists. The component remains `verified: false`.
- GEAS policy text requiring an explicitly authorized GPU runner, approved dataset, pinned runtime and resource ceiling before training.
- A checkpoint promotion rule requiring provenance, integrity, security, quality and inference-compatibility evaluation before a trained model can enter the inference registry.
- Regression tests for the separate training plane, default-off behavior, and non-verified status.

## Deliberately not adopted

- No copy or submodule of the complete Megatron-LM repository.
- No Megatron/PyTorch/CUDA package added to the NEURAL service dependencies.
- No assumption that Cloudflare Workers can run GPU training workloads.
- No Kubernetes, Slurm, GPU cluster, image, storage, model weights, dataset, or training credentials provisioned.
- No new network endpoint or undocumented job-submission protocol invented.
- No model training, checkpoint creation, inference, production deployment, or paid compute started.

## Required gates before a training runner can be implemented

1. **Compute and compatibility:** an owner-authorized GPU allocation; exact GPU model/count/memory, host OS and architecture, driver, CUDA, PyTorch, Python, Megatron release and immutable container image digest.
2. **Dataset governance:** dataset owner and license, source/version/hash, permitted purpose, privacy classification, retention policy, preprocessing provenance and explicit approval. Unknown or disallowed data is rejected.
3. **Job constraints:** pinned base-model revision, configuration hash, bounded steps/epochs, sequence length, GPU-hours and cost ceiling, concurrency limit, timeout, cancellation and operator stop path.
4. **Isolation and egress:** dedicated training environment, least-privilege credentials, default-deny network egress, allowlisted model/data/checkpoint stores, no secrets in job logs, and auditable job identity.
5. **Checkpoint controls:** immutable checkpoint location, content digest, source/job provenance, malware and artifact checks, evaluation results, model license review, and rollback path.
6. **Promotion:** training success is not model correctness. Require independent evaluation and an explicit GEAS/owner approval before model-registry promotion or inference traffic.

## Configuration and evidence semantics

The example configuration defaults `NVIDIA_MEGATRON_ENABLED=false`. Setting it to `true` changes only the architecture snapshot's `configured` declaration. It must not be interpreted as an operational readiness check.

Until the separate GPU runner and all required gates exist, report Megatron runtime availability, GPU capacity, training execution, checkpoints, and production model promotion as **NOT VERIFIED**. This adoption change adds no spend and does not change production configuration.

## Upstream references

- [NVIDIA Megatron-LM and Megatron Core](https://github.com/NVIDIA/Megatron-LM)
- [Megatron Core developer guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/index.html)
- [Megatron Core installation guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/get-started/install.html)
- [Megatron Core parallelism guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html)
