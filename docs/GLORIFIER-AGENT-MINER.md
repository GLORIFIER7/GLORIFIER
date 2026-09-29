# GLORIFIER Agent Miner

Agent Miner is a 24x7 provider-neutral mining intelligence and authorized-compute coordinator.

AI models provide analysis, planning, anomaly detection, provider health, and verification. AI models do not themselves provide Bitcoin hashrate. Physical proof-of-work requires an explicitly authorized compute worker.

## Operating loop

HEALTH → OBSERVE → ANALYZE → PLAN → QUEUE → EXECUTE (AUTHORIZED ONLY) → VERIFY → RECORD → IMPROVE → REPEAT

## Safety boundaries

- Physical mining compute is disabled by default.
- No wallet custody.
- No automatic fund movement.
- No guaranteed-return claims.
- No fabricated mining rewards or verified revenue.
- Only explicitly authorized compute workers may execute proof-of-work.
- Provider failure degrades the agent instead of silently claiming success.

## 24x7 operation

On the long-lived Railway worker, set AGENT_MINER_DAEMON=true. Optionally set AGENT_MINER_INTERVAL_MS (minimum 60 seconds; default 5 minutes).

Persistent economic evidence should be written to the authoritative Neon ledger before being called verified.

## Model federation

OpenAI, Gemini, Anthropic, OpenRouter, and authorized local models are represented as intelligence providers. Adding a model does not create physical mining capacity; compute workers are a separate capability class.
