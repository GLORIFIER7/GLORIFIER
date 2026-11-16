# GLORIFIER AI inference budget policy

**Policy status:** Proposed; not yet merged or deployed  
**Monthly inference budget:** USD 0.00  
**Permitted mode:** Free-only, fail-closed  
**Authority:** Human owner retains approval for any budget increase or external data-egress expansion.

## Non-negotiable controls

1. The monthly paid-inference budget is USD 0.00. No provider may incur usage charges, subscription upgrades, paid credits, or overage fees.
2. Keep `GLORIFIER_ENABLE_INFERENCE=false`, `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=false`, and `GLORIFIER_PAID_INFERENCE_AUTHORIZED=false` on production until a separately reviewed free-only inference adapter is implemented and verified.
3. Never enable paid-provider inference (OpenAI, Anthropic, Gemini paid endpoints, NVIDIA NIM, OpenRouter, or other metered external providers) under this policy. Configured credentials are not permission to use them.
4. Do not create AI Gateway credit top-ups, auto-top-up rules, payment methods, Workers Paid upgrades, or other billable resources. Do not change billing settings as part of implementation.
5. No provider failover may cross from a free, explicitly allowlisted route to a paid route. On quota exhaustion, unknown pricing, missing account-plan evidence, or billing-control uncertainty, fail closed and return a truthful unavailable/degraded result. Never silently fall back to a paid provider.
6. No inference request may be sent until the runtime budget guard has verified the route is allowlisted and the account's free quota is available. Do not use provider discovery/readiness probes that transmit prompts or user/business data.
7. Never log credentials, prompt contents, or sensitive business payloads for budget accounting. Record provider/model, usage units, timestamp, quota decision, and outcome only where safe.

## Permitted free-only path

Cloudflare Workers AI may be evaluated as the first free-only route, but it is **not approved for production inference yet**. Before enabling it:

- Verify the actual Cloudflare account plan and the model's eligibility on that plan.
- Verify current free allocation and per-model pricing from official Cloudflare sources.
- Bind Workers AI only to the specific Worker that needs it; do not expose an unrestricted model proxy.
- Allowlist exact free-plan models only. Reject all other model identifiers.
- Enforce a hard daily usage ceiling no greater than the documented free allocation (currently documented as 10,000 Neurons/day), with a conservative safety margin and durable, atomic accounting. If the quota store is unavailable or stale, reject inference.
- Enforce a monthly paid-spend ceiling of exactly USD 0.00. Any path that could create a charge must be blocked, not merely warned.
- Disable all auto-top-up and credit top-up functionality. Confirm the account setting is off using an authorized read before declaring it verified.
- Add tests proving: paid providers are denied; unknown models are denied; quota exhaustion blocks requests; accounting failure blocks requests; provider failover cannot escape the free allowlist; no top-up or billing mutation is invoked.
- Run focused tests, full relevant Worker tests, security review, preview verification, and obtain owner approval before a protected production deployment.

## Current known production baseline (2026-11-16)

- `glorifier` and `glorifier-neural` have inference, external egress, and paid-inference authorization flags set to `false`.
- The main Worker has no Workers AI binding.
- The NEURAL Worker has OpenAI and NVIDIA secret binding names, but the presence of a secret binding does not prove credential validity or authorize use.
- AI Gateway credit balance was previously observed as zero and no default payment method was reported. This does not establish the Cloudflare Workers plan or prove that all billing mechanisms are disabled.
- The account billing-plan read was blocked by missing Billing Read permission. Therefore plan and billing status remain **NOT VERIFIED**.
- No production inference, paid API call, top-up, plan upgrade, or deployment is authorized by this policy.

## Acceptance criteria

The implementation is complete only when all the controls above are enforced in code, tested, and observed in the deployed production configuration. Documentation or environment flags alone are not proof of a hard spend cap. Until then, report AI inference as **DISABLED / FREE-ONLY PATH NOT YET VERIFIED**.
