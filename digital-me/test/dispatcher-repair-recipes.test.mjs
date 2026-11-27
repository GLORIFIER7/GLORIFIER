import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { recipeId } from '../src/coding-repair-recipe.mjs';
import { prepareDispatcherCandidate, verifyDispatcherCandidate } from '../src/dispatcher-repair-recipes.mjs';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const base = '0'.repeat(40);
const request = { missionId: 'mission-coding-' + 'a'.repeat(64), base, recipeId };

test('rejects unreviewed recipe IDs, invalid missions and an invalid source revision', async () => {
  await assert.rejects(() => prepareDispatcherCandidate(checkout, { ...request, recipeId: 'unreviewed' }), /RECIPE_NOT_REVIEWED/);
  await assert.rejects(() => prepareDispatcherCandidate(checkout, { ...request, missionId: 'fixture' }), /MISSION_INVALID/);
  await assert.rejects(() => prepareDispatcherCandidate(checkout, request), /SOURCE_CHANGED/);
});

test('claimed test proof cannot authorize a candidate without an independently checked source', async () => {
  assert.equal(await verifyDispatcherCandidate(checkout, request, {
    ...request, status: 'candidate-created', digest: '0'.repeat(64), changes: [],
    baselinePassed: true, redReproduced: true, greenPassed: true,
  }), false);
});
