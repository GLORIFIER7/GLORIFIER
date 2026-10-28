import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/huggingface-space-deploy.yml', import.meta.url), 'utf8');
const prepareStart = workflow.indexOf('- name: Prepare Docker Space source');
const publishStart = workflow.indexOf('- name: Publish source to Hugging Face Space');

assert.ok(prepareStart >= 0, 'deployment workflow must define its source-preparation step');
assert.ok(publishStart > prepareStart, 'source preparation must precede publication');

const prepare = workflow.slice(prepareStart, publishStart);
const publish = workflow.slice(publishStart);
assert.match(prepare, /git lfs install --local/, 'the target Space checkout must install Git LFS filters');
assert.match(prepare, /git lfs track "\*\.jpg" "\*\.jpeg" "\*\.png"/, 'image assets must be tracked as LFS pointers before staging');
assert.ok(prepare.indexOf('git lfs track') > prepare.indexOf('rsync -a'), 'LFS tracking must apply after repository files are copied into the target checkout');
assert.match(publish, /git add -A/, 'the publish step must stage the prepared source');
assert.match(publish, /git -c credential\.helper="store --file=\$credential_file" lfs push origin HEAD/, 'LFS objects must use the temporary credential helper');
assert.match(publish, /git -c credential\.helper="store --file=\$credential_file" push origin HEAD:main/, 'branch push must use the temporary credential helper');
assert.ok(
  publish.indexOf(' lfs push origin HEAD') <
    publish.indexOf(' push origin HEAD:main'),
  'LFS objects must be uploaded before publishing the branch ref',
);
assert.doesNotMatch(publish, /HF_SPACE_WRITE_TOKEN[^\n]*git|auth_header/, 'the write token must not be embedded in git command arguments');
assert.match(publish, /trap 'rm -f "\$credential_file"' EXIT/, 'temporary credentials must be removed when the publish step exits');
assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/, 'deployment must remain restricted to main pushes');
assert.doesNotMatch(workflow, /pull_request:/, 'pull request validation must not trigger an external Space deployment');

console.log('Hugging Face Space binary-asset deployment contract tests passed');
