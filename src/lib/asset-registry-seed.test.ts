import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { seedCanonicalNFTRegistry } from './asset-registry';

type QueryCall = { sql: string; values?: any[] };

test('canonical NFT seed writes both collection identities and unverified deployments idempotently', async () => {
  const calls: QueryCall[] = [];
  const db = { async query(sql: string, values?: any[]) { calls.push({ sql, values }); return { rows: [] }; } };
  await seedCanonicalNFTRegistry(db);
  assert.equal(calls.length, 4);
  const assets = calls.filter((call) => call.sql.includes('INSERT INTO canonical_asset_registry'));
  const deployments = calls.filter((call) => call.sql.includes('INSERT INTO canonical_asset_deployments'));
  assert.equal(assets.length, 2);
  assert.equal(deployments.length, 2);
  const erc721 = JSON.parse(String(assets[0].values?.[2]));
  const erc1155 = JSON.parse(String(assets[1].values?.[2]));
  assert.equal(assets[0].values?.[0], 'glorifier-erc721');
  assert.equal(erc721.standard, 'ERC-721');
  assert.equal(erc721.verificationStatus, 'not_verified');
  assert.equal(assets[1].values?.[0], 'glorifier-erc1155');
  assert.equal(erc1155.standard, 'ERC-1155');
  assert.equal(erc1155.verificationStatus, 'not_verified');
  assert.equal(erc1155.contractAddressSource, 'owner-supplied-in-conversation');
  for (const call of assets) {
    assert.match(call.sql, /ON CONFLICT\(asset_id\) DO NOTHING/);
    assert.doesNotMatch(call.sql, /canonical_metadata=EXCLUDED\.canonical_metadata/);
  }
  assert.match(deployments[0].sql, /ON CONFLICT\(deployment_id\) DO NOTHING/);
  assert.doesNotMatch(deployments[0].sql, /evidence=EXCLUDED\.evidence/);
  assert.equal(deployments[0].values?.[0], 'glorifier-erc721-ethereum-mainnet');
  assert.equal(deployments[0].values?.[3], '0xd62eb4963423f6e224af0bcccabf75f566fb9ad7');
  assert.equal(deployments[1].values?.[0], 'glorifier-erc1155-ethereum-mainnet');
  assert.equal(deployments[1].values?.[1], 'glorifier-erc1155');
  assert.equal(deployments[1].values?.[3], '0x355C94e4b6B353421De956e87D643bB036d6a417');
  assert.match(String(deployments[1].values?.[4]), /owner-supplied-in-conversation/);
});

test('canonical NFT documentation preserves explicit evidence limitations', () => {
  const documentation = readFileSync('docs/canonical-asset-registry.md', 'utf8');
  assert.match(documentation, /glorifier-erc721[\s\S]*?Token #1 item/);
  assert.match(documentation, /glorifier-erc1155[\s\S]*?Token #1 item/);
  assert.match(documentation, /PARTIALLY VERIFIED — item page observed/);
  assert.match(documentation, /not substitutes for direct chain evidence/);
  assert.match(documentation, /owner-reported status, not chain-verified fact/);
  assert.match(documentation, /do not classify it as a Solana NFT without separate NFT-standard evidence/);
  assert.match(documentation, /ownerOf/);
  assert.match(documentation, /totalSupply/);
});
