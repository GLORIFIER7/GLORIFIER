import assert from 'node:assert/strict';
import { seedCanonicalNFTRegistry } from './asset-registry';

type QueryCall = { sql: string; values?: any[] };

async function run() {
  const calls: QueryCall[] = [];
  const db = {
    async query(sql: string, values?: any[]) {
      calls.push({ sql, values });
      return { rows: [] };
    }
  };

  await seedCanonicalNFTRegistry(db);

  assert.equal(calls.length, 3, 'seed should write two collection identities and one known deployment');
  const assetCalls = calls.filter((call) => call.sql.includes('INSERT INTO canonical_asset_registry'));
  const deploymentCalls = calls.filter((call) => call.sql.includes('INSERT INTO canonical_asset_deployments'));
  assert.equal(assetCalls.length, 2, 'both NFT collection identities must be seeded');
  assert.equal(deploymentCalls.length, 1, 'only the ERC-721 with a supplied contract address gets a deployment row');

  const erc721 = JSON.parse(String(assetCalls[0].values?.[2]));
  const erc1155 = JSON.parse(String(assetCalls[1].values?.[2]));
  assert.equal(assetCalls[0].values?.[0], 'glorifier-erc721');
  assert.equal(erc721.standard, 'ERC-721');
  assert.equal(erc721.verificationStatus, 'not_verified');
  assert.equal(assetCalls[1].values?.[0], 'glorifier-erc1155');
  assert.equal(erc1155.standard, 'ERC-1155');
  assert.equal(erc1155.verificationStatus, 'pending_contract_address');

  for (const call of assetCalls) {
    assert.match(call.sql, /ON CONFLICT\(asset_id\) DO NOTHING/);
    assert.doesNotMatch(call.sql, /canonical_metadata=EXCLUDED\.canonical_metadata/);
  }
  assert.match(deploymentCalls[0].sql, /ON CONFLICT\(deployment_id\) DO NOTHING/);
  assert.doesNotMatch(deploymentCalls[0].sql, /evidence=EXCLUDED\.evidence/);
  assert.equal(deploymentCalls[0].values?.[0], 'glorifier-erc721-ethereum-mainnet');
  assert.equal(deploymentCalls[0].values?.[3], '0xd62eb4963423f6e224af0bcccabf75f566fb9ad7');

  console.log('Canonical NFT registry seed tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
