import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [guardian, systemHealth, infrastructureHealth, geminiReview, ci] = await Promise.all([
  read('../.github/workflows/glorifier-code-guardian.yml'),
  read('../.github/workflows/system-health-guardian.yml'),
  read('../.github/workflows/infrastructure-health.yml'),
  read('../.github/workflows/gemini-pr-review.yml'),
  read('../.github/workflows/ci.yml'),
]);

test('Code Guardian calls paid providers only after shared owner-authorized manual dispatch', () => {
  assert.match(guardian, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+allow_paid_inference:[\s\S]*?default:\s*false[\s\S]*?type:\s*boolean/);
  assert.match(guardian, /source scripts\/ai-fleet-authorization\.sh/);
  assert.match(guardian, /glorifier_ai_maintenance_authorized "\$EVENT_NAME" "\$MANUAL_PAID_INFERENCE_AUTHORIZATION" "\$OWNER_ACTOR_ID" "\$RUN_ATTEMPT"/);
  assert.match(guardian, /EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/);
  assert.match(guardian, /MANUAL_PAID_INFERENCE_AUTHORIZATION:\s*\$\{\{\s*inputs\.allow_paid_inference\s*\}\}/);
  assert.match(guardian, /OWNER_ACTOR_ID:\s*\$\{\{\s*github\.actor_id\s*\}\}/);
  assert.match(guardian, /RUN_ATTEMPT:\s*\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(guardian, /GUARDIAN_PROVIDER:\s*\$\{\{\s*steps\.authorization\.outputs\.enabled == 'true' && vars\.GUARDIAN_PROVIDER \|\| 'none'\s*\}\}/);
  assert.match(guardian, /OPENAI_API_KEY:\s*\$\{\{\s*steps\.authorization\.outputs\.enabled == 'true' && secrets\.OPENAI_API_KEY \|\| ''\s*\}\}/);
  assert.match(guardian, /GEMINI_API_KEY:\s*\$\{\{\s*steps\.authorization\.outputs\.enabled == 'true' && secrets\.GEMINI_API_KEY \|\| ''\s*\}\}/);
  assert.doesNotMatch(guardian, /OPENAI_API_KEY:\s*\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/);
  assert.doesNotMatch(guardian, /GEMINI_API_KEY:\s*\$\{\{\s*secrets\.GEMINI_API_KEY\s*\}\}/);
});

test('Code Guardian uses deterministic locked dependencies and non-persistent checkout credentials', () => {
  assert.match(guardian, /fetch-depth:\s*1[\s\S]*?persist-credentials:\s*false/);
  assert.match(guardian, /package-manager-cache:\s*false/);
  assert.match(guardian, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(guardian, /npm install --ignore-scripts/);
});

test('Code Guardian scheduled checks are throttled while push and manual checks remain available', () => {
  assert.match(guardian, /schedule:\s*\n\s+- cron:\s*"17 \*\/4 \* \* \*"/);
  assert.match(guardian, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(guardian, /workflow_dispatch:/);
});

test('full build guardian runs hourly because infrastructure health owns rapid probes', () => {
  assert.match(systemHealth, /cron:\s*"17 \* \* \* \*"/);
  assert.match(infrastructureHealth, /cron:\s*"\*\/5 \* \* \* \*"/);
});

test('Gemini PR review is manual-only and retains its owner and paid-inference gate', () => {
  const events = geminiReview.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] ?? '';
  assert.match(events, /workflow_dispatch:/);
  assert.doesNotMatch(events, /pull_request/);
  assert.match(geminiReview, /github\.event_name == 'workflow_dispatch'/);
  assert.match(geminiReview, /vars\.GLORIFIER_GEMINI_PAID_INFERENCE_AUTHORIZED == 'true'/);
  assert.match(geminiReview, /github\.actor_id == '32674233'/);
  assert.match(geminiReview, /github\.run_attempt == 1/);
});

test('GitHub Actions governance tests are required by GLORIFIER CI', () => {
  assert.match(ci, /node --test scripts\/github-actions-governance\.test\.mjs/);
});
