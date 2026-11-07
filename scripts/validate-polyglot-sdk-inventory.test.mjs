import test from 'node:test';
import assert from 'node:assert/strict';
import { POLYGLOT_SDK_CATALOG, validatePolyglotSdkInventory } from './validate-polyglot-sdk-inventory.mjs';

function fixture() {
  const registry = {
    statusVocabulary: ['VERIFIED', 'PARTIALLY VERIFIED', 'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE'],
    capabilities: POLYGLOT_SDK_CATALOG.map((sdk) => ({
      id: sdk.capabilityId,
      status: 'VERIFIED',
      targetEnvironments: ['documented CI target'],
      evidence: [{ kind: 'ci-run', reference: 'https://example.invalid/run/1' }],
    })),
  };
  const guideTable = (sdk) => '| ' + sdk.language + ' | `sdk/' + sdk.packageName + '` | CI target | VERIFIED |';
  const readmeTable = (sdk) => '| ' + sdk.language + ' | `sdk/' + sdk.packageName + '` | Runtime target | Test command | VERIFIED |';
  const architectureGuide = [
    'First-party SDK implementations now exist for eleven language ecosystems.',
    ...POLYGLOT_SDK_CATALOG.map(guideTable),
  ].join('\n');
  const sdkReadme = [
    'All eleven first-party SDKs use the shared contract.',
    ...POLYGLOT_SDK_CATALOG.map(readmeTable),
  ].join('\n');
  const polyglotWorkflow = POLYGLOT_SDK_CATALOG
    .filter((sdk) => sdk.workflow === 'polyglot')
    .map((sdk) => '  ' + sdk.jobName + ':\n    runs-on: ubuntu-24.04')
    .join('\n');
  const pythonWorkflow = POLYGLOT_SDK_CATALOG
    .filter((sdk) => sdk.workflow === 'python')
    .map((sdk) => '  ' + sdk.jobName + ':\n    runs-on: ubuntu-latest')
    .join('\n');
  return { registry, architectureGuide, sdkReadme, polyglotWorkflow, pythonWorkflow };
}
test('accepts the eleven first-party SDKs when registry, docs, and CI agree', () => {
  assert.deepEqual(validatePolyglotSdkInventory(fixture()), []);
});

test('rejects a missing SDK capability record', () => {
  const input = fixture();
  input.registry.capabilities.pop();
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('SDK capability inventory')));
});

test('rejects stale ten-SDK statements in the architecture guide', () => {
  const input = fixture();
  input.architectureGuide += '\nThe initial SDK delivery is complete for the ten languages listed above.';
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('stale ten-SDK statement')));
});

test('rejects documentation that omits a first-party SDK package', () => {
  const input = fixture();
  input.sdkReadme = input.sdkReadme.replace('| Python | `sdk/python` | Runtime target | Test command | VERIFIED |', '');
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('sdk/python')));
});

test('rejects an SDK without its dedicated CI job', () => {
  const input = fixture();
  input.polyglotWorkflow = input.polyglotWorkflow.replace(/  java:[\s\S]*?(?=\n  |$)/, '');
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('Java SDK CI job')));
});

test('rejects documentation status that differs from the capability registry', () => {
  const input = fixture();
  input.sdkReadme = input.sdkReadme.replace(
    '| Python | `sdk/python` | Runtime target | Test command | VERIFIED |',
    '| Python | `sdk/python` | Runtime target | Test command | NOT VERIFIED |',
  );
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('evidence status for Python must match')));
});

test('preserves a first-party SDK with an explicit NOT VERIFIED status without promoting it', () => {
  const input = fixture();
  input.registry.statusVocabulary = ['VERIFIED', 'PARTIALLY VERIFIED', 'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE'];
  input.registry.capabilities[0].status = 'NOT VERIFIED';
  input.architectureGuide = input.architectureGuide.replace('| Python | `sdk/python` | CI target | VERIFIED |', '| Python | `sdk/python` | CI target | NOT VERIFIED |');
  input.sdkReadme = input.sdkReadme.replace('| Python | `sdk/python` | Runtime target | Test command | VERIFIED |', '| Python | `sdk/python` | Runtime target | Test command | NOT VERIFIED |');
  assert.deepEqual(validatePolyglotSdkInventory(input), []);
});

test('rejects an SDK capability with an unknown evidence status', () => {
  const input = fixture();
  input.registry.statusVocabulary = ['VERIFIED', 'PARTIALLY VERIFIED', 'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE'];
  input.registry.capabilities[0].status = 'FULLY TRUSTED';
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('unsupported evidence status')));
});

test('rejects commented-out SDK job declarations', () => {
  const input = fixture();
  input.polyglotWorkflow = input.polyglotWorkflow.replace('  java:' + String.fromCharCode(10), '#  java:' + String.fromCharCode(10));
  assert.ok(validatePolyglotSdkInventory(input).some((error) => error.includes('Java SDK CI job')));
});
