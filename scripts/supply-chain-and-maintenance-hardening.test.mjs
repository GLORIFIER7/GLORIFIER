import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyUnifiedDiff } from './apply-unified-diff.mjs';
import './octopus-deploy-task-output.test.mjs';
import './package-metadata-validation.test.mjs';

const agaveSources = [
  readFileSync(new URL('../.github/workflows/glorifier-solana-devnet-reconcile.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-solana-devnet-resume.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-solana-devnet.yml', import.meta.url), 'utf8'),
];
const agaveSha256 = '5fc8684f7430038105fde953d4308ed56addf627f658daa61709f345448247ee';

for (const [index, source] of agaveSources.entries()) {
  test('Agave Devnet workflow ' + (index + 1) + ' verifies the exact downloaded archive before extraction', () => {
    assert.ok(source.includes(agaveSha256));
    assert.match(source, /curl --fail --show-error --silent --location --proto '=https' --tlsv1\.2/);
    assert.ok(source.includes('"$ARCHIVE_URL" --output "$ARCHIVE"'));
    assert.ok(source.includes("printf '%s  %s\\n' \"$ARCHIVE_SHA256\" \"$ARCHIVE\" | sha256sum --check --strict"));
    assert.ok(source.includes('tar -xjf "$ARCHIVE"'));
    const checksumIndex = source.indexOf('sha256sum --check --strict');
    const extractionIndex = source.indexOf('tar -xjf "$ARCHIVE"');
    assert.ok(checksumIndex >= 0 && extractionIndex > checksumIndex, 'the exact verified archive must be extracted after checksum validation');
    assert.doesNotMatch(source, /sh -c "\$\(curl[^"]*release\.anza\.xyz/);
  });
}

const codexWorkflow = readFileSync(
  new URL('../.github/workflows/codex-gemini-review.yml', import.meta.url),
  'utf8',
);
const geminiWorkflow = readFileSync(
  new URL('../.github/workflows/gemini-collaborator.yml', import.meta.url),
  'utf8',
);
const geminiDevelopmentWorkflow = readFileSync(
  new URL('../.github/workflows/gemini-development.yml', import.meta.url),
  'utf8',
);
const foundryWorkflows = [
  readFileSync(new URL('../.github/workflows/glorifier-bnb-testnet-deploy.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-sepolia-rpc-check.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-testnet-deploy.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-contracts.yml', import.meta.url), 'utf8'),
];

function assertPinnedAction(source, action, sha) {
  const activeReferences = source.split(/\r?\n/).map((line) => ({ line, normalized: line.trim().replace(/^ -\s+/, '').replace(/^-\s+/, '') })).filter(({ normalized }) => normalized.startsWith('uses: ' + action + '@'));
  assert.ok(activeReferences.length > 0, 'expected an active uses: entry for ' + action);
  for (const { line, normalized } of activeReferences) {
    const actual = normalized.split(/\s+#/, 1)[0].trim();
    assert.equal(actual, 'uses: ' + action + '@' + sha, 'unexpected or mutable action reference: ' + line.trim());
  }
}

test('Codex action is pinned to its reviewed immutable commit', () => {
  assertPinnedAction(codexWorkflow, 'openai/codex-action', 'bdf19a4a223ec2549a3e2274a0cf61556bc07675');
});

test('Gemini action is pinned to its reviewed immutable commit', () => {
  assertPinnedAction(geminiWorkflow, 'google-github-actions/run-gemini-cli', 'f77273f4c914e4bf38440cf36a0369cb64a37489');
});

test('all four Foundry workflow actions are pinned to the reviewed immutable commit', () => {
  for (const source of foundryWorkflows) {
    assertPinnedAction(source, 'foundry-rs/foundry-toolchain', 'dba66c27052e63476d886f22216e119ba7e615bf');
  }
});

const maintenanceSources = [
  readFileSync(new URL('../scripts/continuous-improvement-agent.mjs', import.meta.url), 'utf8'),
  readFileSync(new URL('../scripts/code-guardian.mjs', import.meta.url), 'utf8'),
];

for (const source of maintenanceSources) {
  test('AI maintenance agent applies diffs through stdin without writing a patch file', () => {
    assert.match(source, /applyUnifiedDiff/);
    assert.doesNotMatch(source, /\/tmp\/glorifier-/);
    assert.doesNotMatch(source, /writeFileSync|writeFile\(/);
  });
}

const tokenSources = [
  readFileSync(new URL('../solana/revoke-token2022-metadata-authority.mjs', import.meta.url), 'utf8'),
  readFileSync(new URL('../solana/revoke-token2022-metadata-pointer.mjs', import.meta.url), 'utf8'),
];

for (const source of tokenSources) {
  test('Token-2022 revocation script resolves modules through the workflow-provided NODE_PATH', () => {
    assert.match(source, /createRequire\(import\.meta\.url\)/);
    assert.doesNotMatch(source, /GLORIFIER_TOKEN2022_NODE_MODULES_DIR/);
    assert.doesNotMatch(source, /\/tmp\/glorifier-token2022-js/);
  });
}

test('Mainnet Token-2022 runner provides NODE_PATH from its private dependency directory', () => {
  const source = readFileSync(new URL('../solana/deploy-token2022-mainnet.sh', import.meta.url), 'utf8');
  assert.match(source, /mktemp -d/);
  assert.match(source, /chmod 700/);
  assert.match(source, /export GLORIFIER_TOKEN2022_NODE_MODULES_DIR/);
  assert.match(source, /export NODE_PATH="\$GLORIFIER_TOKEN2022_NODE_MODULES_DIR\/node_modules"/);
  assert.match(source, /trap .*rm -rf.*GLORIFIER_TOKEN2022_NODE_MODULES_DIR.* EXIT/);
  assert.match(source, /npm install --prefix "\$GLORIFIER_TOKEN2022_NODE_MODULES_DIR"/);
  assert.doesNotMatch(source, /npm install --prefix \/tmp\/glorifier-token2022-js/);
});

test('applyUnifiedDiff forwards a validated diff over stdin without creating files', () => {
  const patch = 'diff --git a/src/example.ts b/src/example.ts\n';
  let invocation;
  const expected = { ok: true, output: '' };
  const result = applyUnifiedDiff(patch, (command, args, options) => {
    invocation = { command, args, options };
    return expected;
  });

  assert.equal(result, expected);
  assert.equal(invocation.command, 'git');
  assert.deepEqual(invocation.args, ['apply', '--whitespace=fix', '--recount']);
  assert.equal(invocation.options.input, patch);
});

test('applyUnifiedDiff returns a failed git-apply result unchanged', () => {
  const failed = { ok: false, output: 'patch rejected' };
  const result = applyUnifiedDiff(
    'diff --git a/src/example.ts b/src/example.ts\n',
    () => failed,
  );
  assert.equal(result, failed);
});

test('applyUnifiedDiff rejects missing patches and invalid executors', () => {
  assert.throws(() => applyUnifiedDiff('', () => ({ ok: true })), /non-empty unified diff/);
  assert.throws(() => applyUnifiedDiff('diff --git a/a b/a\n', null), /executor function/);
});

test('Node loads the isolated module directory from NODE_PATH at process startup', () => {
  const probePath = '/private-runner-temp/node_modules';
  const result = execFileSync(
    process.execPath,
    ['-e', 'const Module = require("node:module"); process.stdout.write(Module.globalPaths.includes(process.env.NODE_PATH) ? "ok" : "missing");'],
    { encoding: 'utf8', env: { ...process.env, NODE_PATH: probePath } },
  );
  assert.equal(result, 'ok');
});


const nvidiaMaintenanceWorkflow = readFileSync(
  new URL('../.github/workflows/nvidia-assisted-maintenance-pr.yml', import.meta.url),
  'utf8',
);

test('NVIDIA maintenance rejects malformed explicit run IDs before selecting the latest failure', () => {
  const guardStart = nvidiaMaintenanceWorkflow.indexOf(
    'if [[ -n "$candidate" && ! "$candidate" =~ ^[0-9]+$ ]]; then',
  );
  const guardEnd = nvidiaMaintenanceWorkflow.indexOf('\n          fi', guardStart);
  const fallbackStart = nvidiaMaintenanceWorkflow.indexOf('candidate="$(gh run list');
  assert.ok(guardStart >= 0, 'an explicit run ID must be validated');
  assert.ok(guardEnd > guardStart, 'the run ID validation guard must close');
  assert.match(nvidiaMaintenanceWorkflow.slice(guardStart, guardEnd), /::error::Invalid run_id input/);
  assert.match(nvidiaMaintenanceWorkflow.slice(guardStart, guardEnd), /exit 1/);
  assert.ok(fallbackStart > guardEnd, 'latest-failure fallback must happen only after explicit-input validation');
});


test('NVIDIA maintenance executes the explicit run ID guard before fallback', () => {
  const lines = nvidiaMaintenanceWorkflow.split(String.fromCharCode(10));
  const stepStart = lines.indexOf('      - name: Validate failed CI run');
  const runIndex = lines.indexOf('        run: |', stepStart);
  const nextStepIndex = lines.findIndex((line, index) => index > runIndex && line.startsWith('      - name:'));
  assert.ok(stepStart >= 0 && runIndex > stepStart && nextStepIndex > runIndex, 'the run-ID validation shell step must be extractable');
  const script = lines.slice(runIndex + 1, nextStepIndex).map((line) => line.startsWith('          ') ? line.slice(10) : line).join(String.fromCharCode(10));
  let failure;
  try {
    execFileSync('bash', ['-euo', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: { ...process.env, RUN_ID: 'not-a-number', GITHUB_REPOSITORY: 'GLORIFIER7/GLORIFIER', GITHUB_OUTPUT: '/dev/null' },
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'a malformed explicit run ID must stop the executable workflow step');
  assert.equal(failure.status, 1);
  assert.match(failure.stdout.toString(), /Invalid run_id input/);
});

test('NVIDIA maintenance checks credentials only after identifying a failed CI run', () => {
  const targetStep = nvidiaMaintenanceWorkflow.indexOf('- name: Validate failed CI run');
  const credentialStep = nvidiaMaintenanceWorkflow.indexOf('- name: Require NVIDIA credential');
  const requestStep = nvidiaMaintenanceWorkflow.indexOf('- name: Request a constrained patch from Nemotron');
  assert.ok(targetStep >= 0 && credentialStep > targetStep, 'target run validation must precede the NVIDIA credential check');
  assert.ok(requestStep > credentialStep, 'the NVIDIA credential check must precede the model request');
  const credentialBlock = nvidiaMaintenanceWorkflow.slice(credentialStep, requestStep);
  assert.match(credentialBlock, /if: steps\.target\.outputs\.skip != 'true'/);
});

test('NVIDIA maintenance summary reports the selected run ID for manual dispatches', () => {
  const summaryStep = nvidiaMaintenanceWorkflow.slice(
    nvidiaMaintenanceWorkflow.indexOf('- name: Summarize and clean up'),
  );
  assert.match(summaryStep, /TARGET_RUN_ID: \$\{\{ steps\.target\.outputs\.run_id \|\| 'not-selected' \}\}/);
  assert.match(summaryStep, /echo "- Run ID: \$TARGET_RUN_ID"/);
});

test('Gemini development workflow has unique step-level keys', () => {
  const lines = geminiDevelopmentWorkflow.split(/\r?\n/);
  let stepIndent = null;
  let keys = new Set();
  for (const line of lines) {
    const step = line.match(/^(\s*)-\s+name:/);
    if (step) {
      stepIndent = step[1].length;
      keys = new Set(['name']);
      continue;
    }
    if (stepIndent === null) continue;
    const property = line.match(/^(\s+)([A-Za-z0-9_-]+):(?:\s|$)/);
    if (!property) continue;
    const indent = property[1].length;
    if (indent <= stepIndent) {
      stepIndent = null;
      continue;
    }
    if (indent === stepIndent + 2) {
      assert.ok(
        !keys.has(property[2]),
        `duplicate step-level key "${property[2]}" in Gemini development workflow`,
      );
      keys.add(property[2]);
    }
  }
});


const geminiReviewWorkflow = readFileSync(
  new URL('../.github/workflows/gemini-pr-review.yml', import.meta.url),
  'utf8',
);

function readGeminiSystemSettings(source) {
  const match = source.match(
    /cat > "\$RUNNER_TEMP\/gemini-system-settings\.json" <<'JSON'\r?\n([\s\S]*?)\r?\nJSON/,
  );
  assert.ok(match, 'Gemini workflow must create its system settings outside the repository workspace');
  return JSON.parse(match[1]);
}

function jobSection(source, jobName, nextJobName) {
  const start = source.indexOf('  ' + jobName + ':');
  assert.ok(start >= 0, 'missing ' + jobName + ' job');
  const end = nextJobName ? source.indexOf('  ' + nextJobName + ':', start + 1) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
}

test('scheduled Gemini collaborator separates read-only model execution from PR publishing', () => {
  const modelJob = jobSection(geminiWorkflow, 'gemini', 'publish');
  const publisherJob = jobSection(geminiWorkflow, 'publish', null);

  assert.match(geminiWorkflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(modelJob, /permissions:\s*\n\s+contents:\s*read/);
  assert.doesNotMatch(modelJob, /contents:\s*write|pull-requests:\s*write/);
  assert.match(publisherJob, /contents:\s*write/);
  assert.match(publisherJob, /pull-requests:\s*write/);
  assert.match(modelJob, /persist-credentials:\s*false/);
  assert.match(modelJob, /actions\/upload-artifact@/);
  assert.match(publisherJob, /actions\/download-artifact@/);
  assert.match(publisherJob, /git apply --whitespace=error/);
  assert.match(publisherJob, /npm run lint/);
  assert.match(publisherJob, /npm run build/);
  assert.doesNotMatch(geminiWorkflow, /GEMINI_CLI_TRUST_WORKSPACE/);
});

test('Gemini coding workflows only enable workspace file tools and redact environment variables', () => {
  for (const source of [geminiWorkflow, geminiDevelopmentWorkflow]) {
    const settings = readGeminiSystemSettings(source);
    assert.deepEqual(settings.tools.core, [
      'read_file',
      'glob',
      'grep_search',
      'list_directory',
      'read_many_files',
      'write_file',
      'replace',
    ]);
    assert.equal(settings.general.defaultApprovalMode, 'auto_edit');
    assert.equal(settings.security.disableYoloMode, true);
    assert.equal(settings.security.environmentVariableRedaction.enabled, true);
    assert.equal(settings.security.enableConseca, true);
    assert.doesNotMatch(JSON.stringify(settings.tools.core), /run_shell_command/);
    assert.match(source, /GEMINI_CLI_SYSTEM_SETTINGS_PATH:\s*\$\{\{\s*runner\.temp\s*\}\}\/gemini-system-settings\.json/);
  }
});

test('Gemini PR review is read-only, uses untrusted PR diffs as data, and can only publish a comment', () => {
  const modelJob = jobSection(geminiReviewWorkflow, 'gemini-review', 'publish-review');
  const publisherJob = jobSection(geminiReviewWorkflow, 'publish-review', null);
  const settings = readGeminiSystemSettings(geminiReviewWorkflow);

  assert.match(geminiReviewWorkflow, /pull_request_target:/);
  assert.match(geminiReviewWorkflow, /contents:\s*read/);
  assert.match(modelJob, /pull-requests:\s*read/);
  assert.doesNotMatch(modelJob, /contents:\s*write|pull-requests:\s*write|issues:\s*write/);
  assert.doesNotMatch(modelJob, /pull_request\.head\.sha/);
  assert.match(modelJob, /pulls\/\$\{PR_NUMBER\}/);
  assert.deepEqual(settings.tools.core, [
    'read_file',
    'glob',
    'grep_search',
    'list_directory',
    'read_many_files',
  ]);
  assert.equal(settings.general.defaultApprovalMode, 'plan');
  assert.equal(settings.security.disableYoloMode, true);
  assert.equal(settings.security.environmentVariableRedaction.enabled, true);
  assert.equal(settings.security.enableConseca, true);
  assert.doesNotMatch(JSON.stringify(settings.tools.core), /write_file|replace|run_shell_command/);
  assert.match(publisherJob, /pull-requests:\s*write/);
  assert.doesNotMatch(publisherJob, /contents:\s*write/);
  assert.match(publisherJob, /event:\s*"COMMENT"/);
  assert.doesNotMatch(publisherJob, /event:\s*"(?:APPROVE|REQUEST_CHANGES)"/);
  assert.doesNotMatch(publisherJob, /merge_pull_request|gh pr merge|git push/);
});

test('Gemini PR review fails visibly when the Gemini credential is unavailable', () => {
  assert.match(geminiReviewWorkflow, /HAS_GEMINI_API_KEY/);
  assert.match(geminiReviewWorkflow, /GEMINI_API_KEY is unavailable/);
  assert.match(geminiReviewWorkflow, /exit 1/);
});
