import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('server startup explicitly handles the startServer promise', () => {
  const source = read('server.ts');
  assert.ok(source.includes('void startServer().catch((error: unknown) => {'));
});

test('Drive governance handles the effect fetch and awaits the post-export refresh', () => {
  const source = read('src/components/DriveGovernanceTab.tsx');
  assert.ok(source.includes('void fetchDriveFiles();'));
  assert.ok(source.includes('await fetchDriveFiles();'));
});

test('Gmail governance marks its effect fetch as intentionally detached', () => {
  const source = read('src/components/GmailGovernanceTab.tsx');
  assert.ok(source.includes('void fetchEmails();'));
});

test('flagged numeric inputs use the Number static parsing methods', () => {
  const files = [
    'src/components/AiModelsCollaborationManagement.tsx',
    'src/components/AiBrokerConsole.tsx',
    'src/components/FootprintManager.tsx',
    'src/components/WithdrawModal.tsx',
  ];
  for (const path of files) {
    const source = read(path);
    const unqualified = source
      .replaceAll('Number.parseInt(', '')
      .replaceAll('Number.parseFloat(', '');
    assert.equal(unqualified.includes('parseInt('), false, path);
    assert.equal(unqualified.includes('parseFloat('), false, path);
  }
});
