import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/huggingface-space-deploy.yml', import.meta.url), 'utf8');
const prepareStart = workflow.indexOf('- name: Prepare Docker Space source');
const publishStart = workflow.indexOf('- name: Publish source to Hugging Face Space');

assert.ok(prepareStart >= 0, 'deployment workflow must define its source-preparation step');
assert.ok(publishStart > prepareStart, 'source preparation must precede publication');

const prepare = workflow.slice(prepareStart, publishStart);
const publish = workflow.slice(publishStart);

assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+deploy_space:\s*\n\s+description:/, 'Space publishing must be available only through an explicit manual-dispatch input');
assert.match(
  workflow,
  /deploy_space:\s*\n\s+description:[^\n]*\n\s+required:\s*true\n\s+type:\s*boolean\n\s+default:\s*false/,
  'manual Space publishing must default to disabled',
);
assert.match(
  workflow,
  /deployment-disabled:\s*\n\s+if:\s+\$\{\{\s*github\.ref != 'refs\/heads\/main'\s*\|\|\s*inputs\.deploy_space != true\s*\|\|\s*vars\.HF_SPACE_DEPLOY_ENABLED != 'true'\s*\|\|\s*vars\.HF_SPACE_ID == ''\s*\}\}/,
  'the no-deployment path must cover every missing authorization or configuration condition',
);
assert.match(
  workflow,
  /deploy-space:\s*\n\s+if:\s+\$\{\{\s*github\.ref == 'refs\/heads\/main'\s*&&\s*inputs\.deploy_space == true\s*&&\s*vars\.HF_SPACE_DEPLOY_ENABLED == 'true'\s*&&\s*vars\.HF_SPACE_ID != ''\s*\}\}/,
  'publishing must require main, explicit dispatch approval, and both repository configuration values',
);
assert.doesNotMatch(workflow, /^\s{2}push\s*:/m, 'push events must not trigger external Space publishing');
assert.doesNotMatch(workflow, /^\s{2}pull_request\s*:/m, 'pull requests must not trigger external Space publishing');

assert.match(prepare, /git lfs install --local/, 'the target Space checkout must install Git LFS filters');
assert.match(prepare, /git lfs track "\*\.jpg" "\*\.jpeg" "\*\.png"/, 'image assets must be tracked as LFS pointers before staging');
assert.ok(prepare.indexOf('git lfs track') > prepare.indexOf('rsync -a'), 'LFS tracking must apply after repository files are copied into the target checkout');

assert.match(publish, /credential_file="\$RUNNER_TEMP\/hf-space-credentials"/, 'the publish step must initialize its temporary credential-file path');
assert.match(publish, /git add -A/, 'the publish step must stage the prepared source');
assert.match(publish, /git -c credential\.helper="store --file=\$credential_file" lfs push origin HEAD/, 'LFS objects must use the temporary credential helper');
assert.match(publish, /git -c credential\.helper="store --file=\$credential_file" push origin HEAD:main/, 'branch push must use the temporary credential helper');
assert.ok(
  publish.indexOf('credential_file=') < publish.indexOf('credential.helper'),
  'the temporary credential-file path must be initialized before it is used',
);
assert.ok(
  publish.indexOf(' lfs push origin HEAD') < publish.indexOf(' push origin HEAD:main'),
  'LFS objects must be uploaded before publishing the branch ref',
);
assert.doesNotMatch(publish, /HF_SPACE_WRITE_TOKEN[^\n]*git|auth_header/, 'the write token must not be embedded in git command arguments');
assert.match(publish, /trap 'rm -f "\$credential_file"' EXIT/, 'temporary credentials must be removed when the publish step exits');

console.log('Hugging Face Space binary-asset deployment contract tests passed');
