# GLORIFIER Unified Organization Identity

## Purpose

GLORIFIER uses a **domain-first, provider-neutral organizational identity**.

The domain is the stable organizational namespace. Hosting, source control, database, AI providers, email providers, and deployment platforms remain replaceable infrastructure underneath that identity.

This follows the permanent GLORIFIER role models:

- **Internet:** interoperable namespace, discovery, routing, distributed services, explicit trust boundaries.
- **Linux/Unix:** modular components, stable interfaces, replaceability, least privilege, observability, truthful failure.

## Zero-budget operating model

The architecture does **not** require a paid mailbox or Google Cloud.

If GLORIFIER controls a domain:

```
GLORIFIER
└── canonical domain
    ├── website
    ├── application
    ├── API
    ├── documentation
    ├── status
    └── organizational email
```

Email can initially use a forwarding/routing service instead of a paid mailbox. A forwarding address is an organizational address, but it is not the same thing as a full hosted mailbox.

The domain itself must still be registered and controlled. If the organization does not yet control the desired domain, the system must remain explicit about that state and must not claim ownership.

## Canonical identity

The application uses these environment variables:

- `GLORIFIER_CANONICAL_DOMAIN`
- `GLORIFIER_ORG_EMAIL`
- `GLORIFIER_EMAIL_MODE`
- `GLORIFIER_EMAIL_FORWARDING_TARGET`
- `GLORIFIER_DOMAIN_STATUS`
- `GLORIFIER_PUBLIC_URL`

The default email mode is `forwarding`.

Example when the domain is actually controlled:

```
GLORIFIER_CANONICAL_DOMAIN=glorifier.com
GLORIFIER_ORG_EMAIL=johnpaularlos28@glorifier.com
GLORIFIER_EMAIL_MODE=forwarding
GLORIFIER_EMAIL_FORWARDING_TARGET=<existing inbox>
GLORIFIER_DOMAIN_STATUS=verified
GLORIFIER_PUBLIC_URL=https://glorifier.com
```

Do not put a real forwarding target or secret into source control.

## Identity boundaries

Authentication and organization identity are different layers:

```
Domain identity
      │
      ├── GitHub organization
      ├── Vercel deployment
      ├── Railway services
      ├── Neon/PostgreSQL
      └── Email routing
               │
               ▼
        Application authentication
               │
               ▼
        Authorization / capabilities
               │
               ▼
        Human final authority
```

Owning a domain does not authorize an agent to act.

Authenticating an account does not authorize every operation.

Connecting a service does not grant unlimited access.

## Provider-neutral infrastructure

The canonical identity must survive provider substitution:

- Vercel can be replaced.
- Railway can be replaced.
- Neon can be replaced.
- AI providers can be replaced.
- Email routing can be replaced.
- GitHub can be replaced.

Changing infrastructure must not require changing the organization's conceptual identity.

## Implementation state

The repository now contains a centralized identity model at:

`src/lib/identity/glorifier-identity.ts`

The backend can expose the non-secret identity state through:

`GET /api/identity`

The endpoint must never expose email-routing credentials, API keys, OAuth secrets, database credentials, or private tokens.

## Migration sequence

1. Control the desired domain.
2. Verify DNS ownership.
3. Create an organizational forwarding address or mailbox.
4. Verify SPF/DKIM/DMARC when the selected mail service supports them.
5. Set the GLORIFIER identity environment variables in the deployment environment.
6. Verify the domain in GitHub and other platforms where domain verification is supported.
7. Point the website/API subdomains to the selected hosting services.
8. Keep provider credentials separate from the canonical identity.
9. Record the identity configuration as evidence in the connection/governance layer.
10. Upgrade from forwarding to a paid mailbox only when operational needs or revenue justify it.

## Non-fabrication rule

Until domain ownership and the email route are actually configured, GLORIFIER must report:

- domain: not configured / not verified
- email: not configured
- routing: not configured

It must **not** claim that `johnpaularlos28@glorifier.com` exists merely because the address has been selected as the desired future identity.

## Goal

**One organizational identity, many replaceable services.**

GLORIFIER's identity belongs to the organization; infrastructure providers are implementation choices.
