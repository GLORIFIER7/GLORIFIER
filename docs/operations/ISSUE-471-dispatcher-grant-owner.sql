-- OWNER-ONLY activation template, NOT a migration or scheduler command.
-- Run with the existing authorized Neon schema-owner connection only after
-- protected integration, signed-main readback and explicit grant approval.
-- psql -v mission_id='mission-coding-<64 hex>' -v base_sha='<40 hex>' -f <this-file>
-- No replacement of existing grants; no grant issued to the dispatcher itself.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
WITH decoded AS (
  SELECT *, CASE WHEN pg_input_is_valid(payload->>'objective', 'jsonb')
    THEN (payload->>'objective')::jsonb ELSE NULL END AS objective
  FROM public.glorifier_autopilot_missions WHERE id = :'mission_id'
), eligible AS (
  SELECT id, requester, statement_timestamp() + interval '2 hours' AS expiry
  FROM decoded
  WHERE id = :'mission_id' AND id ~ '^mission-coding-[a-f0-9]{64}$'
    AND requester = 'github:32674233' AND status = 'blocked' AND version = 1
    AND payload->>'title' = 'GitHub fix #471' AND payload->'dispatcher' IS NULL
    AND lease_owner IS NULL AND lease_expires_at IS NULL
    AND :'base_sha' ~ '^[a-f0-9]{40}$'
    AND jsonb_typeof(payload->'objective') = 'string'
    AND jsonb_typeof(objective) = 'object'
    AND objective->>'sourceSnapshotSha' = :'base_sha'
    AND objective->>'repository' = 'GLORIFIER7/GLORIFIER'
    AND objective->>'intent' = 'fix'
    AND objective->>'executionAuthorized' = 'false'
    AND objective->'target'->>'kind' = 'issue'
    AND objective->'target'->>'number' = '471'
    AND objective->'target'->'headSha' = 'null'::jsonb
)
INSERT INTO public.digital_me_dispatcher_grants (mission_id,base_sha,envelope,expires_at)
SELECT id, :'base_sha', jsonb_build_object(
  'repository','GLORIFIER7/GLORIFIER','delegationId','digital-me-grant-' || substr(id,16),
  'contextId',id,'base',:'base_sha','recipeId','dispatcher-receipt-limit',
  'delegator',requester,'principal','digital-me',
  'capabilities',jsonb_build_array('digital-me.prepare-repair','digital-me.publish-draft'),
  'resourceScopes',jsonb_build_array('GLORIFIER7/GLORIFIER'),
  'dataScopes',jsonb_build_array('public-source'),'maxRisk','low','maxValue',0,'currency','USD',
  'expiresAt',to_char(expiry AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'revocable',true,'humanApprovalRequired',false),expiry
FROM eligible
ON CONFLICT (mission_id,base_sha) DO NOTHING
RETURNING mission_id,base_sha,expires_at;
COMMIT;
-- Exactly one returned row is required for a newly issued grant. Zero is not success.
-- Revocation is a separate explicit schema-owner action. Never replace a revoked grant.
