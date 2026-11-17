import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const installerPath = fileURLToPath(new URL('./install-token-economizer.sh', import.meta.url));
const installer = await readFile(installerPath, 'utf8');
const guide = await readFile(new URL('../docs/integrations/token-economizer.md', import.meta.url), 'utf8');

test('pins the official upstream source to an immutable reviewed commit', () => {
  assert.match(installer, /https:\/\/github\.com\/microsoft\/TokenEconomizer\.git/);
  assert.match(installer, /UPSTREAM_COMMIT="b57d03f81585a18b936a0eaecbd1eb51cdcecf71"/);
  assert.match(installer, /checkout --detach "\$UPSTREAM_COMMIT"/);
});

test('requires Python 3.10+ and installs the Codex plugin from the pinned checkout', () => {
  assert.match(installer, /sys\.version_info\s*>=\s*\(3,\s*10\)/);
  assert.match(installer, /codex plugin marketplace add "\$INSTALL_DIR"/);
  assert.match(installer, /codex plugin add tokeneconomizer@tokeneconomizer/);
  assert.match(installer, /config set microskills=envfacts toolprune=propose loopguard=off/);
});

test('keeps default setup model-call-free and prevents automatic tool removal', () => {
  assert.match(installer, /microskills=envfacts/);
  assert.match(installer, /toolprune=propose/);
  assert.match(installer, /loopguard=off/);
  assert.doesNotMatch(installer, /microskills=on|microskills=envfacts\+distiller|toolprune=auto|loopguard=nudge|loopguard=on/);
  assert.doesNotMatch(installer, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|NVIDIA_API_KEY/);
});

test('keeps the installer isolated from repository remote writes and deployment', () => {
  assert.doesNotMatch(installer, /git push|gh pr |gh workflow|wrangler deploy|vercel --prod|firebase deploy|merge_pull_request/i);
  assert.match(guide, /local Codex/i);
  assert.match(guide, /not a GitHub Actions integration/i);
  assert.match(guide, /not a promise of GLORIFIER cost savings/i);
});

test('installer shell syntax is valid', () => {
  const result = spawnSync('bash', ['-n', installerPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
