import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENGINEERING_WORKSPACE_LINKS,
  parseGitHubRepository,
  parseGitHubPullRequests,
} from './engineering-workspace.ts';

test('workspace destinations use fixed HTTPS URLs and preserve existing repository ownership', () => {
  assert.equal(ENGINEERING_WORKSPACE_LINKS.repository, 'https://github.com/GLORIFIER7/GLORIFIER');
  assert.equal(ENGINEERING_WORKSPACE_LINKS.editor, 'https://github.dev/GLORIFIER7/GLORIFIER');
  for (const destination of Object.values(ENGINEERING_WORKSPACE_LINKS)) {
    const url = new URL(destination);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
});

test('observes repository data only when returned for the intended repository', () => {
  assert.deepEqual(parseGitHubRepository({
    full_name: 'GLORIFIER7/GLORIFIER',
    default_branch: 'main',
    open_issues_count: 7,
    pushed_at: '2026-11-23T07:44:30Z',
  }), {
    name: 'GLORIFIER7/GLORIFIER',
    defaultBranch: 'main',
    openIssuesAndPullRequests: 7,
    pushedAt: '2026-11-23T07:44:30Z',
  });
  assert.equal(parseGitHubRepository({full_name:'someone/other',default_branch:'main'}), null);
  assert.equal(parseGitHubRepository({full_name:'GLORIFIER7/GLORIFIER',open_issues_count:-1}), null);
  assert.equal(parseGitHubRepository({full_name:'GLORIFIER7/GLORIFIER',open_issues_count:'7'}), null);
});

test('validates pull request API shape and never accepts fabricated counts', () => {
  assert.equal(parseGitHubPullRequests([{number: 1},{number: 2}]), 2);
  assert.equal(parseGitHubPullRequests([]), 0);
  assert.equal(parseGitHubPullRequests({message:'API rate limit exceeded'}), null);
  assert.equal(parseGitHubPullRequests([{number:'1'}]), null);
  assert.equal(parseGitHubPullRequests([{number:-2}]), null);
});
