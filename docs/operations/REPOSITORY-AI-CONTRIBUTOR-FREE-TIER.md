# GLORIFIER Repository AI Contributors — Free-Only Operating Policy

**Status:** Implementation candidate on a draft PR. The contributor pool remains disabled until an owner supplies current account-specific attestations and server-side provider credentials. No provider is considered connected or free-eligible merely because its adapter exists.

## Objective

Allow multiple AI providers to independently review and contribute to public GLORIFIER repository maintenance through GEAS-governed missions and draft pull requests.

The repository contribution path is strictly free-only:

- Paid inference budget: USD 0 per month.
- Paid-inference authorization: false.
- General external-data egress: false.
- Repository public-code egress: separately enabled by an explicit owner setting.
- Provider/model selection: exact and explicit; no generic auto-router and no paid fallback.
- Provider requests: individually reserved against attested per-minute and per-day request and token limits.
- Source edits: inspected existing files only, at most two per mission, on an isolated Autopilot branch.
- Pull requests: draft only.
- Merge, production deployment, package publication, credential changes, and financial actions: not authorized.

This permission covers public repository source and review material only. It does not authorize sending private customer data, credentials, environment variables, security secrets, private code, or production records to external model providers.

## Supported provider pool

Provider adapters already present in GLORIFIER include:

| Provider | Free eligibility accepted by this policy | Default state |
|---|---|---|
| Google Gemini | Official Gemini API Free Tier, exact model/project eligible, billing disabled | Not eligible until attested |
| NVIDIA NIM / Nemotron | Active NVIDIA Developer Program entitlement, prototype/non-production use only | Not eligible until attested |
| Anthropic Claude | Positive, current promotional API credits with invoicing, pay-as-you-go and top-up disabled | Not eligible until attested |
| xAI Grok | Positive, current promotional API credits with invoice billing and top-up disabled | Not eligible until attested |
| OpenAI GPT | Positive, current promotional API credits; ChatGPT subscription access is not API credit | Not eligible until attested |
| Meta Llama | Existing local runtime, reviewed model license, no rented/cloud compute, no external egress | Not eligible until attested |
| Groq | Current account on its Free developer plan with model-specific limits | Not eligible until attested |
| OpenRouter | Exact :free model ID or openrouter/free; Free account request ceilings enforced | Not eligible until attested |
| Hugging Face | Free-user monthly inference grant only, currently capped by policy at USD 0.10; no pay-as-you-go | Not eligible until attested |
| Ollama | Existing local runtime only; no rented GPU or paid inference endpoint | Not eligible until attested |
| Mistral, Qwen, DeepSeek, Together, Fireworks, LLMsRelay | Current documented free plan or explicit promotional grant, verified for the account | Not eligible until attested |
| Cloudflare Workers AI | Authoritative Workers Free plan read, exact model free eligibility, and account-wide hard quota cap | Not eligible until attested |

A provider adapter, model catalog entry, API key, HTTP 200 model-list response, or a developer-console screenshot alone does not prove that a particular inference is free. Each provider requires a fresh owner attestation. The policy deliberately records this as owner-attested-not-vendor-verified, not as independent vendor verification.

Provider-specific rules are intentionally conservative:

- ChatGPT Free/Go/Plus/Pro app access is separate from OpenAI API billing. A ChatGPT plan does not automatically supply API credits.
- Claude Free or Pro app access is not a Claude API free tier. Claude API participation requires an active API-credit grant.
- xAI's $0 usage tier is a spend threshold, not a free API allowance. The API itself is priced; a real promotional grant is required.
- Llama weights may be available to download, but inference still consumes compute. The policy permits only already-owned local hardware/runtime with no incremental cloud-compute cost.
- NVIDIA Developer Program NIM is limited to eligible prototype/development use under its terms; it is not production NIM authorization.
- OpenRouter participation is restricted to :free models or openrouter/free and is further capped at 20 requests per minute and 50 per day.
- Hugging Face participation is limited to the documented Free-user monthly credit grant, not purchased credits or pay-as-you-go.

## Owner-controlled GitHub App writing identity

All Autopilot repository writes use one dedicated GitHub App owned by the `GLORIFIER7` account. AI providers never receive GitHub credentials and never write directly to GitHub. The App installation token is the single official author identity for Autopilot branches, commits, and draft pull requests.

Create the App in the GitHub account settings for `GLORIFIER7`, then configure only these repository permissions:

- **Contents:** Read and write.
- **Pull requests:** Read and write.
- **Metadata:** Read-only (required by GitHub).

Do not grant administration, Actions, deployments, secrets, packages, issues, organization administration, or other permissions. Install the App on **only** `GLORIFIER7/GLORIFIER`. Do not install it across all repositories.

Set these values in the backend's server-side secret/environment manager, never in a committed file, workflow YAML, issue, pull request, or chat:

~~~dotenv
GLORIFIER_GITHUB_APP_ID=<numeric GitHub App ID>
GLORIFIER_GITHUB_APP_INSTALLATION_ID=<numeric installation ID for GLORIFIER7/GLORIFIER>
GLORIFIER_GITHUB_APP_PRIVATE_KEY=<App PEM private key; store newlines securely>
GLORIFIER_GITHUB_APP_SLUG=<exact GitHub App slug>
~~~

The runtime verifies the authenticated App ID, App owner (`GLORIFIER7`), configured slug, App-level permission set, installation scope, token expiry, and installation-token permission set. The only accepted write permissions are `contents:write` and `pull_requests:write`; optional `metadata:read` is allowed, and any other permission blocks the writer. It requests an installation token restricted to the single `GLORIFIER` repository with those two explicit permissions. App responses are read through a bounded stream; oversized responses are cancelled. Any mismatch blocks the write. Tokens are short-lived and are not logged or persisted.

The App slug's bot login (for example, `<app-slug>[bot]`) is the official GitHub writer. Each AI mission records the AI CEO provider/model and each successful specialist provider/model in the draft PR's visible attribution section and machine-readable provenance comment. This is runtime-reported attribution, not a provider-signed claim that a particular model authored the output.

The legacy `GLORIFIER_GITHUB_WRITE_TOKEN` personal-token path is not accepted for Autopilot writes. Do not create or configure a personal access token as a fallback. A configured App is still not proof that an installation is active until the runtime successfully validates it during a write.

## Required server-side settings

The backend must receive the following settings through its existing secret/environment manager. Do not put secrets into source files, issue comments, PR text, workflow YAML, or this conversation.

~~~dotenv
GLORIFIER_REPOSITORY_AI_FREE_ONLY=true
GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS=true
GLORIFIER_MONTHLY_AI_BUDGET_USD=0
GLORIFIER_PAID_INFERENCE_AUTHORIZED=false
GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=false
GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON=<owner-attested provider JSON>
~~~

The repository public-code egress setting is a narrow permission for explicitly selected public GLORIFIER source and mission text. It does not turn on general external-data egress. The paid-inference authorization flag must remain false.

Provider credentials use the provider adapters' existing server-side environment names, for example GEMINI_API_KEY, NVIDIA_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, OPENAI_API_KEY, HF_TOKEN, and GROQ_API_KEY. Configure only credentials that the corresponding provider has entitled for the stated free/promotional mode. Never add these values as repository variables or commit them.

The attestation JSON is not a credential store. It contains only plan evidence and quota limits. Example shape (illustrative only; replace all values with real account-console observations):

~~~json
[
  {
    "providerId": "gemini",
    "mode": "vendor-free-tier",
    "status": "owner-attested",
    "modelId": "gemini-2.5-flash",
    "endpointUrl": "https://generativelanguage.googleapis.com",
    "evidenceUrl": "https://ai.google.dev/gemini-api/docs/rate-limits",
    "attestedAt": "2026-11-16T14:00:00.000Z",
    "expiresAt": "2026-11-16T16:00:00.000Z",
    "planName": "Free",
    "monthlyPaidSpendLimitUsd": 0,
    "autoTopUpEnabled": false,
    "payAsYouGoEnabled": false,
    "paidFallbackEnabled": false,
    "monthlyInvoicingEnabled": false,
    "billingEnabled": false,
    "modelFree": true,
    "requestsPerMinute": 10,
    "requestsPerDay": 100,
    "maxTokensPerDay": 60000,
    "maxInputTokens": 12000,
    "maxOutputTokens": 2048
  }
]
~~~

Those example quota values are not a recommendation or a statement of your account's actual Gemini limits. Enter the exact current values displayed by the provider for the specific key, project, model, and account.

Attestations expire after 24 hours and cannot be set more than seven days into the future. Re-read the provider console when renewing. If the limit, billing mode, model entitlement, or credit balance cannot be confirmed, leave that provider out.


Each provider attestation must include an `endpointUrl` that matches the actual configured adapter endpoint. Public providers are restricted to the provider's approved HTTPS host; custom hosts, redirects, credentials in URLs, query strings, and fragments are rejected. Meta Llama and Ollama local modes are restricted to loopback HTTP endpoints only (`localhost`, `127.0.0.1`, or `::1`); private LAN, public-cloud, and rented GPU endpoints are not accepted. The endpoint is re-read and revalidated before every inference request. Cloudflare Workers AI remains explicitly ineligible until an authorized Billing Read and an approved authoritative account-attestation mechanism exist; an owner-supplied boolean is not sufficient.

## Usage enforcement

Before each repository AI call, GLORIFIER:

1. Re-reads the server-side owner-attested provider pool and exact configured model ID, including the exact endpoint actually resolved by the provider adapter.
2. Rejects the call if the attestation is stale, expired, missing, malformed, or unsupported.
3. Rejects the call if any paid top-up, pay-as-you-go, paid fallback, monthly invoice, or non-zero paid budget setting is detected.
4. Checks the full message payload for common credential patterns and withholds unsafe/oversized source text.
5. Computes a conservative UTF-8 byte upper bound for the prompt and rejects it if it exceeds the attested input limit.
6. Atomically reserves one request in both the current UTC minute and current UTC day, plus the input upper bound and full maximum output allowance, in the persistent PostgreSQL table glorifier_repository_provider_usage.
7. Calls the exact provider/model/endpoint with its attested maximum output token count, with provider-internal retries disabled. There is no provider fallback.
8. Records a reservation before the API call. Failed calls remain counted conservatively; reservations are not refunded to avoid quota-reset abuse.

The persistent quota ledger requires GLORIFIER's configured PostgreSQL database. If the DB, budget table, transaction, quota reservation, provider key, model, or attestation is unavailable, that provider call is blocked. Vendor-side free-plan restrictions and billing-disabled settings remain mandatory in addition to this local ledger.

The byte-based input upper bound is deliberately conservative. It is a local guard, not a vendor token-count measurement. Provider usage counters and account quota pages remain authoritative.

## Contribution workflow

The intended flow is:

Owner-attested free provider pool -> GEAS mission authorization -> provider-specific specialist review -> AI CEO plan -> source inspection -> credential screening -> durable quota reservation -> isolated branch -> bounded file updates -> independent GitHub readback -> draft PR

All eligible providers can contribute one independent specialist analysis per mission (up to sixteen providers). Provider/model attribution is retained in findings. Multiple responses are not treated as consensus; disagreements and missing evidence remain visible.

Each repository mission can edit at most two already-inspected files under the existing Autopilot allowlist. The plan must create one isolated branch from main, re-read inspected files on that branch, update only those files with their inspected content hashes, and end by creating a draft PR.

The following remain disabled:

- direct writes to main;
- automatic PR approval or merge;
- automatic deployment;
- automatic npm/package publication;
- arbitrary command/shell execution;
- credential or environment-file edits;
- paid-provider fallback or automatic top-ups;
- external financial, blockchain, contractual, or irreversible actions.

## Evidence and verification

The focused checks are:

~~~sh
npm run test:repository-contributor-policy
npm run test:repository-provider-budget
npm run test:github-app-auth
npm run test:autopilot-github-write
npm run test:autopilot-execution-fabric
npm run test:autopilot-orchestrator
npm run test:specialist-council
npm run lint
~~~

Passing the tests proves the local policy and quota-reservation code only. It does not prove any provider account has a free entitlement, any API key is valid, a real model request succeeded, or a production deployment is active.

## Official account references

Use each provider's live console as the source of the account-specific limit. Public reference documentation:

- Gemini Free Tier and model rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- NVIDIA NIM developer/prototype access: https://docs.api.nvidia.com/nim/docs/product
- Anthropic API billing and usage: https://platform.claude.com/docs/en/api/rate-limits
- xAI API models and pricing: https://docs.x.ai/docs/models
- OpenAI API billing: https://help.openai.com/en/articles/8264644-how-can-i-set-up-prepaid-billing
- Meta Llama downloads and license: https://ai.meta.com/resources/models-and-libraries/llama-downloads/
- Groq account rate limits: https://console.groq.com/docs/rate-limits
- OpenRouter free models and pricing: https://openrouter.ai/pricing
- Hugging Face Inference Providers pricing: https://huggingface.co/docs/inference-providers/pricing

Provider pricing, credits, eligibility, and quotas can change. Re-attest before enabling a provider and whenever a provider's account or plan changes.
