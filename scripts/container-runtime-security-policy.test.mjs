import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimeDockerfiles = [
  ['Primary application runtime', '../Dockerfile'],
  ['Application compatibility runtime', '../Dockerfile.ubuntu'],
  ['Permanent orchestrator runtime', '../Dockerfile.orchestrator.ubuntu'],
];

const fixedZlibVersion = '1:1.3.dfsg+really1.3.2-4';
const versionQuery = "dpkg-query -W -f='${Version}' zlib1g";
const versionFloorCheck = `dpkg --compare-versions "$zlib_version" ge '${fixedZlibVersion}'`;

for (const [label, relativePath] of runtimeDockerfiles) {
  test(label + ' installs Debian sid zlib with both high-severity gzwrite fixes', () => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const runtimeStart = source.indexOf('FROM debian:unstable-slim AS runtime');

    assert.ok(
      runtimeStart >= 0,
      'the runtime must use the Debian sid base whose zlib package contains the security backport',
    );

    const nextStage = source.indexOf('\nFROM ', runtimeStart + 1);
    const runtimeEnd = nextStage < 0 ? source.length : nextStage;
    const runtimeSource = source.slice(runtimeStart, runtimeEnd);
    const updateIndex = runtimeSource.indexOf('apt-get update');
    const installIndex = runtimeSource.indexOf(
      'apt-get install -y --no-install-recommends',
      updateIndex,
    );

    assert.ok(updateIndex >= 0, 'APT metadata must be refreshed in the runtime stage');
    assert.ok(installIndex >= 0, 'the runtime stage must contain apt-get install -y --no-install-recommends');
    assert.ok(installIndex > updateIndex, 'runtime packages must be installed after refreshing APT metadata');
    assert.ok(
      runtimeSource.indexOf('zlib1g', installIndex) > installIndex,
      'zlib1g must be explicitly installed or upgraded in the runtime stage',
    );

    const versionReadIndex = runtimeSource.indexOf(versionQuery, installIndex);
    assert.ok(
      versionReadIndex > installIndex,
      'the installed zlib package version must be read after installation',
    );

    const versionCheckIndex = runtimeSource.indexOf(versionFloorCheck, versionReadIndex);
    assert.ok(
      versionCheckIndex > versionReadIndex,
      'the zlib security floor must be enforced after reading the installed version',
    );
    assert.ok(
      runtimeSource.indexOf(fixedZlibVersion, versionCheckIndex) > versionCheckIndex,
      'the runtime-stage version check must require the fixed Debian zlib package version',
    );

    const aptListsCleanupIndex = runtimeSource.indexOf('rm -rf /var/lib/apt/lists/*');
    assert.ok(
      aptListsCleanupIndex > versionCheckIndex,
      'APT metadata must only be removed after the package version check succeeds',
    );
  });
}

test('Trivy configuration scans OS and library packages without zlib CVE suppressions', () => {
  const trivyConfig = readFileSync(new URL('../.trivy.yaml', import.meta.url), 'utf8');
  assert.ok(trivyConfig.includes('- os'), 'OS packages must remain in scope');
  assert.ok(trivyConfig.includes('- library'), 'application libraries must remain in scope');
  assert.ok(
    !/CVE-2026-(76844|85091)/.test(trivyConfig),
    'neither zlib CVE may be suppressed through Trivy configuration',
  );

  const dockerWorkflow = readFileSync(
    new URL('../.github/workflows/docker-image.yml', import.meta.url),
    'utf8',
  );
  assert.ok(
    (dockerWorkflow.match(/severity: HIGH,CRITICAL/g) || []).length >= 3,
    'each runtime image must retain the HIGH/CRITICAL severity gate',
  );
  assert.ok(
    (dockerWorkflow.match(/exit-code: "1"/g) || []).length >= 3,
    'each runtime image must fail the workflow when HIGH/CRITICAL vulnerabilities are found',
  );
});
