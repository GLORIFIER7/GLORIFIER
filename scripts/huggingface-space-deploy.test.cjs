const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

test('Hugging Face deployment is manually gated and source publication is safe', () => {
  const projectPage = readFileSync(join(__dirname, '../public/project.html'), 'utf8');
  const sitemap = readFileSync(join(__dirname, '../public/sitemap.xml'), 'utf8');
  
  assert.match(
    projectPage,
    /GLORIFIER — Governed intelligence for business/,
    'the existing GitHub Pages project source must remain in the repository',
  );
  assert.match(
    sitemap,
    /https:\/\/glorifier7\.github\.io\/GLORIFIER\/project\.html/,
    'the existing public GitHub Pages project URL must remain listed in the sitemap',
  );
  
  const workflow = readFileSync(join(__dirname, '../.github/workflows/huggingface-space-deploy.yml'), 'utf8');
  const prepareStart = workflow.indexOf('- name: Prepare Docker Space source');
  const publishStart = workflow.indexOf('- name: Publish source to Hugging Face Space');
  const deployStart = workflow.indexOf('  deploy-space:');
  
  assert.ok(prepareStart >= 0, 'deployment workflow must define its source-preparation step');
  assert.ok(publishStart > prepareStart, 'source preparation must precede publication');
  assert.ok(deployStart >= 0, 'deployment workflow must define its publish job');
  
  const prepare = workflow.slice(prepareStart, publishStart);
  const publish = workflow.slice(publishStart);
  const deployJob = workflow.slice(deployStart);
  
  assert.match(
    workflow,
    /^on:\s*\n\s{2}workflow_dispatch:\s*$/m,
    'Space publishing must be available only through manual dispatch without caller-controlled inputs',
  );
  assert.doesNotMatch(workflow, /^\s{4}inputs:/m, 'deployment authorization must not be supplied through workflow-dispatch inputs');
  assert.doesNotMatch(workflow, /inputs\.|deploy_space/, 'the workflow must not use dispatch inputs as an authorization control');
  assert.match(
    workflow,
    /deployment-disabled:\s*\n\s+if:\s+\$\{\{\s*github\.ref != 'refs\/heads\/main'\s*\|\|\s*vars\.HF_SPACE_APPROVAL_GATE_CONFIGURED != 'true'\s*\|\|\s*vars\.HF_SPACE_DEPLOY_ENABLED != 'true'\s*\|\|\s*vars\.HF_SPACE_ID == ''\s*\}\}/,
    'the no-deployment path must cover non-main dispatches and missing deployment configuration',
  );
  assert.match(
    workflow,
    /deploy-space:\s*\n\s+if:\s+\$\{\{\s*github\.ref == 'refs\/heads\/main'\s*&&\s*vars\.HF_SPACE_APPROVAL_GATE_CONFIGURED == 'true'\s*&&\s*vars\.HF_SPACE_DEPLOY_ENABLED == 'true'\s*&&\s*vars\.HF_SPACE_ID != ''\s*\}\}/,
    'publishing must require main and both repository-controlled configuration values',
  );
  assert.match(
    deployJob,
    /environment:\s*\n\s+name:\s*huggingface-space-production\s*\n\s+url:\s+https:\/\/huggingface\.co\/spaces\/\$\{\{\s*vars\.HF_SPACE_ID\s*\}\}/,
    'publishing must use the dedicated GitHub deployment environment',
  );
  assert.match(
    workflow,
    /Configure required reviewers for this environment in Settings/,
    'the deployment environment must explicitly document its required-reviewer configuration',
  );
  assert.match(
    workflow,
    /Set HF_SPACE_APPROVAL_GATE_CONFIGURED=true only after confirming that protection is active/,
    'the separate approval attestation must not be enabled until required reviewers are configured',
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
  
});
