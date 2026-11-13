import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyGithubToolResult } from './autopilot-evidence-verifier.ts';

test('independent verifier confirms repository identity through a fresh GitHub REST read', async () => {
  const result = await verifyGithubToolResult(
    'github_get_repository',
    {},
    { id: 1377237797, full_name: 'GLORIFIER7/GLORIFIER', default_branch: 'main' },
    async (input) => {
      assert.equal(String(input), 'https://api.github.com/repos/GLORIFIER7/GLORIFIER');
      return Response.json({
        id: 1377237797,
        full_name: 'GLORIFIER7/GLORIFIER',
        default_branch: 'main',
      });
    },
  );
  assert.equal(result.verified, true);
  assert.equal(result.verifierId, 'github-rest-independent-read-v1');
  assert.match(result.sourceSha256, /^[a-f0-9]{64}$/);
});

test('independent verifier rejects repository results that do not match the source read', async () => {
  const result = await verifyGithubToolResult(
    'github_get_repository',
    {},
    { id: 1, full_name: 'attacker/other', default_branch: 'main' },
    async () => Response.json({
      id: 1377237797,
      full_name: 'GLORIFIER7/GLORIFIER',
      default_branch: 'main',
    }),
  );
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'independent-source-mismatch');
});

test('independent verifier checks file content rather than trusting the executor artifact', async () => {
  const expected = 'safe public README content\n';
  const result = await verifyGithubToolResult(
    'github_read_file',
    { path: 'README.md', ref: 'main' },
    { path: 'README.md', ref: 'main', content: expected },
    async (input) => {
      assert.equal(String(input), 'https://api.github.com/repos/GLORIFIER7/GLORIFIER/contents/README.md?ref=main');
      return Response.json({
        path: 'README.md',
        encoding: 'base64',
        content: btoa(expected),
      });
    },
  );
  assert.equal(result.verified, true);
});
