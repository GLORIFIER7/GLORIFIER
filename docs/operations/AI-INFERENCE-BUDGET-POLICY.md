# GLORIFIER AI inference budget policy

**Policy status:** Adopted in PR #895; runtime source merged in PR #896; response-parsing and inference-opt-in follow-up tests are in Draft PR #897. Production inference remains disabled.  
**Monthly paid-inference budget:** USD 0.00  
**Permitted mode:** Cloudflare Workers AI only, on a verified Workers Free plan, with fail-closed behavior  
**Authority:** Human owner retains approval for any budget increase, paid-provider use, or external data-egress expansion.

## Non-negotiable controls

1. The monthly paid-inference budget is USD 0.00. No provider may incur usage charges, subscription upgrades, paid credits, or overage fees.
2. Paid-provider inference (OpenAI, Anthropic, Gemini paid endpoints, NVIDIA NIM, OpenRouter, vLLM on paid compute, and other metered external providers) remains unauthorized. Configured credentials are not permission to use them.
3. Do not create AI Gateway credit top-ups, auto-top-up rules, payment methods, Workers Paid upgrades, or other billable resources. Do not change billing settings as part of implementation.
4. No provider failover may cross from a free, explicitly allowlisted route to a paid route. On quota exhaustion, unknown pricing, missing account-plan evidence, or billing-control uncertainty, fail closed. Never silently fall back to a paid provider.
5. The only approved implementation candidate is the dedicated Cloudflare Workers AI binding, using the exact allowlisted model '@cf/google/gemma-4-26b-a4b-it'. The model identifier is pinned; unknown model identifiers are rejected.
6. The Workers AI path requires all of the following: GLORIFIER_ENABLE_INFERENCE=true, GLORIFIER_PROVIDER=cloudflare_workers_ai, GLORIFIER_WORKERS_PLAN=free, GLORIFIER_WORKERS_AI_FREE_ONLY=true, an actual AI binding, GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=false, and GLORIFIER_PAID_INFERENCE_AUTHORIZED=false. Any missing, malformed, or contradictory setting denies inference.
7. The value GLORIFIER_WORKERS_PLAN=free may be set only after an authorized Cloudflare billing-plan read proves the account is on Workers Free. A local declaration, documentation value, or model catalog entry is not proof of account plan.
8. Cloudflare documents a 10,000 Neurons/day Workers AI free allocation, resetting at 00:00 UTC. On Workers Free, usage beyond that daily free allocation requires an upgrade; it must not be enabled on Workers Paid because overage usage can be billed. Treat the account-wide Cloudflare Free limit as the hard cap and fail closed when the service reports quota exhaustion. Do not add a paid fallback.
9. The model's published token rates are usage accounting, not a waiver of the Neurons cap. The binding adapter limits prompts to 8,000 characters and outputs to 512 tokens. Do not run local Workers AI inference smoke tests or production inference from this automation. Mocked unit tests, local builds, and configuration validation are allowed. Cloudflare notes that local Workers AI development can also consume account usage.
10. Never log credentials, prompt contents, or sensitive business payloads for budget accounting. Record provider/model, usage units, timestamp, quota decision, and outcome only where safe.

## Runtime implementation status

The merged main source includes:
- A binding-only asynchronous Workers AI adapter with one exact model allowlist.
- A separate runtime gate that does not reuse paid-inference authorization or external-egress consent.
- Mocked tests for unknown model rejection, missing binding, non-Free plan rejection, paid-provider denial, bounded prompts/responses, and the explicit Workers AI route.

The follow-up Draft PR #897:
- Adds support for the pinned Gemma 4 chat-completion output shape, choices[0].message.content, while retaining the legacy response field.
- Adds a regression test proving inference remains disabled when GLORIFIER_ENABLE_INFERENCE=false.
- Uses a fake binding only; it does not send a real model request.

**Important enforcement limitation:** the current adapter checks the static GLORIFIER_WORKERS_PLAN environment string. It does not independently query Cloudflare billing or verify a signed, short-lived plan attestation. A static value is not sufficient proof. Keep the plan set to 'unverified', keep GLORIFIER_WORKERS_AI_FREE_ONLY=false, omit the AI binding, and keep inference disabled until a separately approved authoritative attestation mechanism is available.

The Workers AI binding is deliberately omitted from the production Wrangler configurations while account plan and model eligibility remain unverified. The production Workers currently have no AI binding, and inference, external egress, and paid-inference authorization remain false.

The source-level Python 3.11 and 3.12 matrices passed for merged PR #896. The parser and inference-opt-in follow-up tests in PR #897 must pass on its exact current head before review can proceed. DeepSource all-severity quality evidence is currently unavailable because the connected analysis quota is exhausted.

This source state is not production deployment evidence. No live free-plan verification, real-model smoke test, or production inference has been performed. Production inference remains DISABLED / FREE-ONLY PATH NOT VERIFIED.

## Current production billing/configuration evidence (2026-11-16)

- glorifier and glorifier-neural have inference, external egress, and paid-inference authorization flags set to false.
- Neither production Worker currently has a Workers AI binding.
- The NEURAL Worker has OpenAI and NVIDIA secret binding names, but binding-name presence does not prove credential validity or authorize use.
- AI Gateway credit balance was read as zero, no default payment method was present, and auto-top-up was read back as threshold=0, amount=0.
- The Workers subscription and billing-profile reads returned HTTP 403 because the connected Cloudflare OAuth identity lacks Billing Read permission. Therefore the actual Workers plan remains NOT VERIFIED. AI Gateway credit and top-up status do not establish the Workers subscription plan.
- The account model catalog includes the pinned Gemma 4 model, but catalog availability and model pricing do not prove a free-plan entitlement or an enforceable account-wide non-billable limit.
- No production inference, paid API call, top-up, plan upgrade, migration, or deployment has been performed or authorized by this implementation.

## Acceptance criteria

The implementation is complete only when all controls above are enforced in code, focused and full relevant tests pass on the exact candidate commit, the Workers Free plan and model eligibility are read back from Cloudflare with authorized Billing Read access, current daily quota and the hard non-billable limit are independently verified, and auto-top-up remains off.

Any real-model inference or production deployment requires a separate explicit owner authorization after those checks. This automation does not perform that inference or deployment. Do not call inference fully verified from configuration, CI, a binding declaration, or a mocked test alone.
