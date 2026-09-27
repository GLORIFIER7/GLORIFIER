export const GLORIFIER_IDENTITY = {
  organization: 'GLORIFIER',
  canonicalDomain: String(process.env.GLORIFIER_CANONICAL_DOMAIN || '').trim().toLowerCase(),
  primaryEmail: String(process.env.GLORIFIER_ORG_EMAIL || '').trim().toLowerCase(),
  emailMode: String(process.env.GLORIFIER_EMAIL_MODE || 'forwarding').trim().toLowerCase(),
  emailForwardingTargetConfigured: Boolean(String(process.env.GLORIFIER_EMAIL_FORWARDING_TARGET || '').trim()),
  domainStatus: String(process.env.GLORIFIER_DOMAIN_STATUS || 'not-configured').trim().toLowerCase(),
  website: String(process.env.GLORIFIER_PUBLIC_URL || '').trim(),
  principles: [
    'Domain identity is independent from hosting/provider identity.',
    'Email routing is separate from application authentication.',
    'No paid mailbox is required for the architecture to operate.',
    'A domain must be controlled before an @domain address can be authoritative.',
    'Provider replacement must not change GLORIFIER organizational identity.',
    'Human owner remains final authority for consequential actions.'
  ] as const
} as const;

export function getGlorifierIdentity() {
  const identity = GLORIFIER_IDENTITY;
  const domainConfigured = Boolean(identity.canonicalDomain);
  const emailConfigured = Boolean(identity.primaryEmail);
  const domainOwnedOrVerified = ['owned', 'verified', 'active'].includes(identity.domainStatus);

  return {
    ...identity,
    ready: domainConfigured && emailConfigured && domainOwnedOrVerified,
    domainConfigured,
    emailConfigured,
    domainOwnedOrVerified,
    nextAction: !domainConfigured
      ? 'Set GLORIFIER_CANONICAL_DOMAIN after the organization controls its domain.'
      : !domainOwnedOrVerified
        ? 'Verify domain ownership/control before treating the domain as authoritative.'
        : !emailConfigured
          ? 'Configure GLORIFIER_ORG_EMAIL after an @domain mailbox or forwarding address exists.'
          : 'Identity configuration is ready.'
  };
}
