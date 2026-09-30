# GEAS Architecture Controls v1.1

This module makes the GEAS refinements executable without granting autonomous irreversible authority.

## Controls

- **Canonical action identity:** security-relevant action fields are deterministically hashed for human approval binding.
- **Evidence records:** evidence has an explicit truth level, state, source, observation time, producer, authority and content hash.
- **API asset registry:** endpoints can be inventoried with authentication, authorization, scope, exposure and evidence metadata.
- **Verification:** verification status is derived from explicit checks and evidence; missing evidence never becomes verification.
- **RFC 9457-compatible errors:** API failures expose stable machine-readable problem fields while retaining normal HTTP status semantics.

## Safety boundary

These controls are advisory/governance infrastructure. They do not deploy infrastructure, merge code, change credentials, move funds, trade assets, or bypass authorization.
