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

for (const [label, relativePath] of runtimeDockerfiles) {
  test(label + ' installs Debian sid zlib with both high-severity gzwrite fixes', () => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const runtimeStage = source.indexOf('FROM debian:unstable-slim AS runtime');
    const updateIndex = source.indexOf('apt-get update', runtimeStage);
    const installIndex = source.indexOf('apt-get install -y --no-install-recommends', updateIndex);
    const versionReadIndex = source.indexOf(versionQuery, installIndex);
    const versionCheckIndex = source.indexOf(
      "dpkg --compare-versions \"$zlib_version\" ge '" + fixedZlibVersion + "'",
      versionReadIndex,
    );

    assert.ok(runtimeStage >= 0, 'the runtime must use the Debian sid base whose zlib package contains the security backport');
    assert.ok(updateIndex > runtimeStage, 'APT metadata must be refreshed in the runtime stage');
    assert.ok(installIndex > updateIndex, 'runtime packages must be installed after refreshing APT metadata');
    assert.ok(source.indexOf('zlib1g', installIndex) > installIndex, 'zlib1g must be explicitly installed or upgraded');
    assert.ok(versionReadIndex > installIndex, 'the installed zlib package version must be read after installation');
    assert.ok(versionCheckIndex > versionReadIndex, 'the zlib security floor must be enforced after reading the installed version');
    assert.ok(
      source.includes(fixedZlibVersion),
      'the runtime must require the Debian package version that includes the CVE-2026-76844 and CVE-2026-85091 fixes',
    );
    assert.ok(
      source.indexOf('rm -rf /var/lib/apt/lists/*', versionCheckIndex) > versionCheckIndex,
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
