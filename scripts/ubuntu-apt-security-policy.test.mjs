import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimeDockerfiles = [
  ['Ubuntu application runtime', '../Dockerfile.ubuntu'],
  ['Ubuntu permanent orchestrator runtime', '../Dockerfile.orchestrator.ubuntu'],
];

for (const [label, relativePath] of runtimeDockerfiles) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

  test(label + ' installs the fixed APT security packages without retrying vulnerable downloads', () => {
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
  });
}
