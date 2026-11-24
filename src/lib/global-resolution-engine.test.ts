import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./global-resolution-engine.ts', import.meta.url), 'utf8');

test('global-resolution conflict target matches the partial unique index predicate', () => {
  assert.match(
    source,
    /CREATE UNIQUE INDEX IF NOT EXISTS glorifier_global_resolution_source_idx ON glorifier_global_resolution_cases\s*\(source_finding_id\)\s*WHERE source_finding_id IS NOT NULL/i,
    'source_finding_id must be protected by the documented partial unique index',
  );

  assert.match(
    source,
    /ON CONFLICT\s*\(source_finding_id\)\s*WHERE source_finding_id IS NOT NULL\s+DO NOTHING/i,
    'the INSERT conflict target must include the partial-index predicate so PostgreSQL can infer it',
  );
});


test('public-interest cases enter the evidence queue separately from commercial cases', () => {
  assert.match(source, /'public-interest-review'/);
  assert.match(source, /NOT EXISTS\s*\(SELECT 1 FROM glorifier_global_resolution_cases/s);
  assert.match(source, /contributionMode: publicInterest \? 'public-interest-review' : 'commercial'/);
  assert.match(source, /Public-interest review cases cannot enter execution or settlement/);
});
