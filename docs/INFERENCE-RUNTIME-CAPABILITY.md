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
