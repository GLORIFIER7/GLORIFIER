import * as admissionSqlstate from './coding-repair-recipe.mjs';

const recipes = new Map([[admissionSqlstate.recipeId, admissionSqlstate]]);

export async function prepareDispatcherCandidate(checkout, { missionId, base, recipeId }) {
  const recipe = recipes.get(recipeId);
  if (!recipe) throw Error('REPAIR_RECIPE_NOT_REVIEWED');
  if (typeof missionId !== 'string' || !/^mission-coding-[a-f0-9]{64}$/.test(missionId)) {
    throw Error('REPAIR_MISSION_INVALID');
  }

  const files = recipe.readRepairFiles(checkout, base);
  const proof = await recipe.verifyCandidate(checkout, base);
  if (proof.outcome === 'already-applied') return { status: 'already-applied' };

  const manifest = recipe.deriveRepair(files);
  if (proof.outcome !== 'candidate-created' || proof.candidateDigest !== manifest.digest) {
    throw Error('REPAIR_PROOF_MISMATCH');
  }

  return Object.freeze({
    missionId,
    base,
    recipeId,
    status: 'candidate-created',
    digest: manifest.digest,
    changes: Object.freeze(manifest.changes.map(change => Object.freeze(change))),
    baselinePassed: true,
    redReproduced: true,
    greenPassed: true,
  });
}

/** Run in a second isolated checkout of trusted source, with mission inputs from GEAS. */
export async function verifyDispatcherCandidate(checkout, request, candidate) {
  if (!candidate || candidate.status !== 'candidate-created' ||
      candidate.missionId !== request.missionId || candidate.base !== request.base ||
      candidate.recipeId !== request.recipeId || candidate.baselinePassed !== true ||
      candidate.redReproduced !== true || candidate.greenPassed !== true) return false;
  try {
    const expected = await prepareDispatcherCandidate(checkout, request);
    return expected.status === 'candidate-created' && expected.digest === candidate.digest &&
      JSON.stringify(expected.changes) === JSON.stringify(candidate.changes);
  } catch {
    return false;
  }
}
