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

    const purgeIndex = source.indexOf(
      'apt-get -o Acquire::Retries=0 purge -y apt libapt-pkg6.0t64',
    );
    const aptRemovalCheckIndex = source.indexOf(
      'dpkg-query -W -f=\'\u0024{db:Status-Status}\' apt',
    );
    const libaptRemovalCheckIndex = source.indexOf(
      'dpkg-query -W -f=\'\u0024{db:Status-Status}\' libapt-pkg6.0t64',
    );

    assert.ok(purgeIndex > libaptVersionCheckIndex, 'the patched APT packages must be removed from the shipped runtime after version checks');
    assert.ok(aptRemovalCheckIndex > purgeIndex, 'the final runtime must verify apt is absent');
    assert.ok(libaptRemovalCheckIndex > aptRemovalCheckIndex, 'the final runtime must verify libapt-pkg is absent');
  });
}
