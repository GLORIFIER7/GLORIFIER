import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedCanonicalNFTRegistry } from './asset-registry';
import { test } from 'node:test';

test('asset-registry-seed regression suite', async () => {
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

  assert.equal(calls.length, 4, 'seed should write two collection identities and their two supplied deployment references');
  const assetCalls = calls.filter((call) => call.sql.includes('INSERT INTO canonical_asset_registry'));
  const deploymentCalls = calls.filter((call) => call.sql.includes('INSERT INTO canonical_asset_deployments'));
  assert.equal(assetCalls.length, 2, 'both NFT collection identities must be seeded');
  assert.equal(deploymentCalls.length, 2, 'each owner-supplied contract address gets an unverified deployment row');

  const erc721 = JSON.parse(String(assetCalls[0].values?.[2]));
  const erc1155 = JSON.parse(String(assetCalls[1].values?.[2]));
  assert.equal(assetCalls[0].values?.[0], 'glorifier-erc721');
  assert.equal(erc721.standard, 'ERC-721');
  assert.equal(erc721.verificationStatus, 'not_verified');
  assert.equal(assetCalls[1].values?.[0], 'glorifier-erc1155');
  assert.equal(erc1155.standard, 'ERC-1155');
  assert.equal(erc1155.verificationStatus, 'not_verified');
  assert.equal(erc1155.contractAddressSource, 'owner-supplied-in-conversation');

  for (const call of assetCalls) {
    assert.match(call.sql, /ON CONFLICT\(asset_id\) DO NOTHING/);
    assert.doesNotMatch(call.sql, /canonical_metadata=EXCLUDED\.canonical_metadata/);
  }
  assert.match(deploymentCalls[0].sql, /ON CONFLICT\(deployment_id\) DO NOTHING/);
  assert.doesNotMatch(deploymentCalls[0].sql, /evidence=EXCLUDED\.evidence/);
  assert.equal(deploymentCalls[0].values?.[0], 'glorifier-erc721-ethereum-mainnet');
  assert.equal(deploymentCalls[0].values?.[3], '0xd62eb4963423f6e224af0bcccabf75f566fb9ad7');
  assert.equal(deploymentCalls[1].values?.[0], 'glorifier-erc1155-ethereum-mainnet');
  assert.equal(deploymentCalls[1].values?.[1], 'glorifier-erc1155');
  assert.equal(deploymentCalls[1].values?.[3], '0x355C94e4b6B353421De956e87D643bB036d6a417');
  assert.match(String(deploymentCalls[1].values?.[4]), /owner-supplied-in-conversation/);

  // Guard the canonical documentation against overstating marketplace evidence.
  const registryDoc = readFileSync(new URL('../../docs/canonical-asset-registry.md', import.meta.url), 'utf8');
  const ownershipReport = readFileSync(new URL('../../nft/ownership-verification-2026-11-13.md', import.meta.url), 'utf8');
  const erc721ItemUrl = 'https://opensea.io/assets/ethereum/0xd62eb4963423f6e224af0bcccabf75f566fb9ad7/1';
  const registryItemUrl = registryDoc.split('[Token #1 item](')[1]?.split(')')[0];
  const ownershipReportItemUrl = ownershipReport.split('[OpenSea token #1 item](')[1]?.split(')')[0];
  assert.equal(registryItemUrl, erc721ItemUrl, 'canonical registry must link to the exact ERC-721 contract URL');
  assert.equal(ownershipReportItemUrl, erc721ItemUrl, 'ownership report must link to the same exact ERC-721 contract URL');
  assert.match(registryDoc, /glorifier-erc721[\s\S]*?Token #1 item/);
  assert.match(registryDoc, /glorifier-erc1155[\s\S]*?Token #1 item/);
  assert.match(registryDoc, /PARTIALLY VERIFIED — 2026-11-13 Etherscan reports verified `ERC721SeaDropCloneable` proxy source/);
  assert.match(registryDoc, /PARTIALLY VERIFIED — 2026-11-09 read-only Ethereum RPC confirms ERC-165\/ERC-1155/);
  assert.match(registryDoc, /not substitutes for direct chain evidence/);
  assert.match(registryDoc, /owner-reported status, not chain-verified fact/);
  assert.match(registryDoc, /do not classify it as a Solana NFT without separate NFT-standard evidence/);
  assert.match(registryDoc, /ownerOf/);
  assert.match(registryDoc, /totalSupply/);

  console.log('Canonical NFT registry seed and evidence-guard tests passed.');
}
await run();

});
