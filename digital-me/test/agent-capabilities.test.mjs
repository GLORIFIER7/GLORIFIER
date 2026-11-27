import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COLLABORATORS, INTENTS, getCollaborator, selectCollaborators, devinReviewLink } from '../src/agent-capabilities.mjs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const ready = { credentialConfigured: true, paidInferenceRequired: false, evidence: 'VERIFIED' };
const sha = 'a'.repeat(40);

test('registry covers every requested AI with unique ids and no write authority', () => {
  const ids = COLLABORATORS.map((c) => c.id);
  assert.deepEqual([...ids].sort(), ['claude', 'codex', 'copilot', 'devin', 'gemini', 'gpt', 'nemotron', 'neon']);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of COLLABORATORS) {
    assert.equal(c.writeAuthority, 'none');
    assert.equal(c.defaultEvidence, 'NOT VERIFIED');
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.intents));
    assert.ok(c.intents.every((i) => INTENTS.includes(i)));
  }
});

test('every referenced source exists and declared credentials are used there', () => {
  for (const c of COLLABORATORS) {
    if (c.integration === 'source-integrated') assert.ok(c.sources.length > 0, c.id);
    for (const path of c.sources) assert.ok(existsSync(new URL(path, root)), `${c.id}: ${path}`);
    const text = c.sources.map(read).join('\n');
    for (const env of c.credentialEnv) assert.ok(text.includes(env), `${c.id}: ${env}`);
  }
});

test('provider ids match the provider discovery registry', () => {
  const discovery = read('src/lib/ai/provider-discovery.ts');
  for (const c of COLLABORATORS.filter((x) => x.providerId)) assert.match(discovery, new RegExp(`\\{id:'${c.providerId}'`), c.id);
});

test('fails closed without observations and never authorizes execution', () => {
  for (const intent of INTENTS) {
    const r = selectCollaborators(intent);
    assert.equal(r.status, 'NO_ELIGIBLE_COLLABORATOR');
    assert.deepEqual(r.selected, []);
    assert.equal(r.executionAuthorized, false);
    assert.equal(r.paidInferenceAuthorized, false);
    assert.equal(r.approvalAuthorized, false);
    assert.equal(r.mergeAuthorized, false);
    assert.ok(!r.denied.some((d) => d.id === 'neon'));
  }
});

test('selects only verified, credentialed, zero-budget, source-integrated collaborators for the intent', () => {
  const all = Object.fromEntries(COLLABORATORS.map((c) => [c.id, ready]));
  assert.deepEqual(selectCollaborators('explain', all).selected, ['claude', 'gpt', 'gemini', 'nemotron']);
  const review = selectCollaborators('review', all);
  assert.deepEqual(review.selected, ['claude', 'codex', 'gpt', 'gemini', 'nemotron']);
  assert.deepEqual(review.denied, [{ id: 'copilot', reason: 'not-integrated' }, { id: 'devin', reason: 'advisory-link-only' }]);
});

test('each missing guarantee produces a specific denial', () => {
  const cases = [
    [undefined, 'not-observed'],
    [{ ...ready, credentialConfigured: 'true' }, 'credential-not-configured'],
    [{ ...ready, paidInferenceRequired: undefined }, 'zero-budget-not-proven'],
    [{ ...ready, paidInferenceRequired: true }, 'zero-budget-not-proven'],
    [{ ...ready, evidence: 'PARTIALLY VERIFIED' }, 'evidence-not-verified'],
  ];
  for (const [observation, reason] of cases) {
    const r = selectCollaborators('plan', { claude: observation });
    assert.deepEqual(r.denied.find((d) => d.id === 'claude'), { id: 'claude', reason });
  }
  assert.deepEqual(selectCollaborators('explain', { codex: ready }).denied.find((d) => d.id === 'codex'), { id: 'codex', reason: 'intent-unsupported' });
});

test('rejects unknown intents and inherited observation keys', () => {
  for (const intent of ['deploy', 'approve', 'merge', '', undefined, 'PLAN']) assert.deepEqual(selectCollaborators(intent, {}), { status: 'IGNORED' });
  const inherited = Object.create({ claude: ready });
  assert.deepEqual(selectCollaborators('plan', inherited).selected, []);
});

test('Devin Review link is advisory, canonical and strictly validated', () => {
  assert.deepEqual(devinReviewLink({ repository: 'GLORIFIER7/GLORIFIER', pullNumber: 1071, headSha: sha }), {
    url: 'https://devinreview.com/GLORIFIER7/GLORIFIER/pull/1071', pullNumber: 1071, headSha: sha, advisory: true, approval: false, evidence: 'NOT VERIFIED',
  });
  for (const input of [
    { repository: 'other/repo', pullNumber: 1, headSha: sha },
    { repository: 'glorifier7/glorifier', pullNumber: 1, headSha: sha },
    { repository: 'GLORIFIER7/GLORIFIER', pullNumber: '1071', headSha: sha },
    { repository: 'GLORIFIER7/GLORIFIER', pullNumber: 0, headSha: sha },
    { repository: 'GLORIFIER7/GLORIFIER', pullNumber: 1.5, headSha: sha },
    { repository: 'GLORIFIER7/GLORIFIER', pullNumber: 1, headSha: 'A'.repeat(40) },
    { repository: 'GLORIFIER7/GLORIFIER', pullNumber: 1, headSha: 'abc' },
    undefined,
  ]) assert.equal(devinReviewLink(input), null);
  assert.equal(getCollaborator('devin').integration, 'advisory-link-only');
  assert.equal(getCollaborator('unknown'), null);
});
