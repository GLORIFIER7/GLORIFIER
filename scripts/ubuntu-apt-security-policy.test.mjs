import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimeDockerfiles = [
  ['Ubuntu application runtime', '../Dockerfile.ubuntu'],
  ['Ubuntu permanent orchestrator runtime', '../Dockerfile.orchestrator.ubuntu'],
];

for (const [label, relativePath] of runtimeDockerfiles) {
  test(label + ' installs the fixed APT security packages without retrying vulnerable downloads', () => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const updateIndex = source.indexOf('apt-get -o Acquire::Retries=0 update');
    const upgradeIndex = source.indexOf(
      'apt-get -o Acquire::Retries=0 install -y --no-install-recommends --only-upgrade apt libapt-pkg6.0t64',
    );
    const aptVersionCheckIndex = source.indexOf(
      'dpkg --compare-versions "$apt_version" ge 2.8.4ubuntu0.1',
    );
    const libaptVersionCheckIndex = source.indexOf(
      'dpkg --compare-versions "$libapt_version" ge 2.8.4ubuntu0.1',
    );

    assert.ok(updateIndex >= 0, 'APT metadata update must disable retries');
    assert.ok(upgradeIndex > updateIndex, 'apt and libapt must be upgraded before application packages are installed');
    assert.ok(aptVersionCheckIndex > upgradeIndex, 'the installed apt version must be checked against the Ubuntu fix');
    assert.ok(libaptVersionCheckIndex > aptVersionCheckIndex, 'the installed libapt-pkg version must be checked against the Ubuntu fix');
    const retryPolicyIndex = source.indexOf('Acquire::Retries "0";');
    assert.ok(retryPolicyIndex > libaptVersionCheckIndex, 'the runtime must persistently disable APT retries after validating patched packages');
    const runtimePackageInstallIndex = source.indexOf(
      'apt-get -o Acquire::Retries=0 install -y --no-install-recommends ca-certificates',
    );
    assert.ok(runtimePackageInstallIndex > upgradeIndex, 'runtime packages must be installed with APT retries disabled after the security upgrade');
    assert.ok(runtimePackageInstallIndex > libaptVersionCheckIndex, 'runtime packages must only be installed after both patched package versions are verified');
    assert.ok(runtimePackageInstallIndex > retryPolicyIndex, 'runtime packages must only be installed after the persistent no-retry policy is configured');
    assert.ok(!source.includes('apt-get -o Acquire::Retries=0 purge -y apt libapt-pkg6.0t64'), 'the runtime must retain Ubuntu Essential APT packages rather than attempt an unsafe purge');

  });
}

test('Trivy VEX acknowledges only Canonical-fixed Ubuntu APT package versions', () => {
  const vex = JSON.parse(
    readFileSync(
      new URL('../security/vex/CVE-2026-109518.openvex.json', import.meta.url),
      'utf8',
    ),
  );
  const expectedProducts = [
    'pkg:deb/ubuntu/apt@2.8.4ubuntu0.1',
    'pkg:deb/ubuntu/libapt-pkg6.0t64@2.8.4ubuntu0.1',
  ];
  const statements = vex.statements;

  assert.equal(vex.version, 1, 'the VEX document must use OpenVEX version 1');
  assert.equal(statements.length, 2, 'the VEX scope must remain limited to the two reported APT packages');
  assert.deepEqual(
    statements.map((statement) => statement.products?.[0]?.['@id']).sort(),
    expectedProducts.sort(),
    'VEX must match only the exact Canonical-fixed Ubuntu 24.04 package versions',
  );
  assert.ok(
    statements.every(
      (statement) =>
        statement.vulnerability?.name === 'CVE-2026-109518' &&
        statement.status === 'fixed',
    ),
    'only CVE-2026-109518 may be marked fixed for these exact package versions',
  );
  const canonicalStatusNotes =
    "Canonical's Ubuntu CVE tracker identifies Ubuntu 24.04 Noble apt as fixed in 2.8.4ubuntu0.1. Canonical USN-8996-1 documents the security update. The runtime Dockerfiles also set Acquire::Retries to 0 persistently. Primary evidence: https://ubuntu.com/security/CVE-2026-109518 and https://ubuntu.com/security/notices/USN-8996-1.";

  assert.ok(
    statements.every((statement) => statement.status_notes === canonicalStatusNotes),
    'each VEX statement must cite the exact Canonical primary-evidence statement',
  );

  const trivyConfig = readFileSync(new URL('../.trivy.yaml', import.meta.url), 'utf8');
  assert.ok(
    trivyConfig.includes('security/vex/CVE-2026-109518.openvex.json'),
    'Trivy must load the package-scoped VEX document',
  );
});
