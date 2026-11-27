import type { Pool } from 'pg';
import { evaluateAuthorityChain, type AuthorityEnvelope } from './geas-reconciliation';

const REPOSITORY = 'GLORIFIER7/GLORIFIER';
const OWNER = 'github:32674233';
const MISSION_PREFIX = 'mission-coding-';
const GRANT_PREFIX = 'digital-me-grant-';
const DATA_SCOPE = 'public-source';
const CAPABILITIES = ['digital-me.prepare-repair', 'digital-me.publish-draft'] as const;

type GrantRequest = { repository: string; missionId: string; base: string };
type DispatcherEnvelope = AuthorityEnvelope & { repository: string; base: string; recipeId: string };

function includesExactly(values: unknown, expected: readonly string[]): boolean {
  return Array.isArray(values) && values.length === expected.length && expected.every(value => values.includes(value));
}

/** Read the owner-issued GEAS envelope afresh on every invocation, including publication fences. */
export function createDispatcherAuthorization(database: Pick<Pool, 'query'>) {
  return async function getAuthorization({ repository, missionId, base }: GrantRequest) {
    if (repository !== REPOSITORY || typeof missionId !== 'string' ||
        !/^mission-coding-[a-f0-9]{64}$/.test(missionId) ||
        typeof base !== 'string' || !/^[a-f0-9]{40}$/.test(base)) return null;

    const { rows } = await database.query<{ envelope: DispatcherEnvelope | null }>(
      'SELECT public.read_digital_me_dispatcher_grant($1, $2) AS envelope',
      [missionId, base],
    );
    const envelope = rows.length === 1 ? rows[0].envelope : null;
    const delegationId = GRANT_PREFIX + missionId.slice(MISSION_PREFIX.length);
    if (!envelope || typeof envelope !== 'object' || envelope.delegationId !== delegationId || envelope.contextId !== missionId ||
        envelope.repository !== repository || envelope.base !== base ||
        envelope.delegator !== OWNER || envelope.principal !== 'digital-me' ||
        'revokedAt' in envelope || 'parentDelegationId' in envelope ||
        envelope.revocable !== true || envelope.humanApprovalRequired !== false ||
        envelope.maxRisk !== 'low' || envelope.maxValue !== 0 || envelope.currency !== 'USD' ||
        typeof envelope.recipeId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(envelope.recipeId) ||
        typeof envelope.expiresAt !== 'string' || !Number.isFinite(Date.parse(envelope.expiresAt)) ||
        !includesExactly(envelope.capabilities, CAPABILITIES) ||
        !includesExactly(envelope.resourceScopes, [repository]) ||
        !includesExactly(envelope.dataScopes, [DATA_SCOPE])) return null;

    const allowed = CAPABILITIES.every(capability => evaluateAuthorityChain(envelope, {
      capability,
      resourceScope: repository,
      dataScope: DATA_SCOPE,
      risk: 'low',
    }).allowed);
    if (!allowed) return null;

    return {
      repository,
      missionId,
      base,
      recipeId: envelope.recipeId,
      grantId: delegationId,
      revoked: false,
      executionAuthorized: true,
      publicationAuthorized: true,
      maximumCostMicrousd: 0,
      expiresAt: envelope.expiresAt,
    };
  };
}
