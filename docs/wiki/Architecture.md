# Architecture

## Design goal
GLORIFIER is an AI-neutral orchestration and governance layer intended to coordinate external intelligence providers and tools. It is not a claim that GLORIFIER replaces those providers.

## Target architecture
- **Control plane:** policy, routing, task coordination, audit records, and human approval boundaries.
- **Runtime:** Cloudflare Workers is the preferred target for API and edge execution.
- **Web experience:** a static public interface may be hosted separately, but must not be confused with the API runtime.
- **Data:** Supabase is the intended destination for basic operational data; Neon may remain during a controlled migration or for explicitly assigned workloads.
- **Providers and tools:** external AI models, blockchain networks, and connected services are dependencies, each requiring its own authentication, quota, and health checks.

## Evidence boundary
This is a target description, not a declaration that every component is implemented or connected. Record each component's actual endpoint, owner, deployment revision, health probe, and known limitations before marking it VERIFIED.

## Architectural requirements
1. Authenticate callers and authorize each operation server-side.
2. Keep provider credentials in managed secrets; never expose them to browser clients.
3. Apply timeouts, bounded retries, quotas, and safe error handling.
4. Log correlation IDs and outcomes without logging secrets or sensitive payloads.
5. Require human authorization for production changes and financial actions.
6. Document provider fallback behavior and distinguish a fallback from successful primary-provider operation.