import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateEvidenceBundle } from "./validate-evidence.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const makeBundle = async () => {
  const png = await readFile("GLORIFIER SERVICES.png");
  const gitBlobHeader = Buffer.concat([Buffer.from("blob " + png.length, "utf8"), Buffer.from([0])]);
  return {
    registry: await load("nft/registry.json"),
    inventory: await load("nft/image-inventory-2026-11-03.json"),
    draftMetadata: await load("nft/metadata.json"),
    secondaryDraft: await load("nft/metadata/glorifier-services-official-logo-001.json"),
    publishedMetadata: await load("nft/metadata/observed-ethereum-mainnet-official-logo-001.json"),
    observation: await load("nft/metadata/ethereum-mainnet-token-001-observation.json"),
    repositoryFile: {
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
      gitBlobSha: createHash("sha1").update(Buffer.concat([gitBlobHeader, png])).digest("hex")
    }
  };
};

test("accepts the reconciled Official Logo #001 evidence bundle", async () => {
  const bundle = await makeBundle();
  assert.deepEqual(validateEvidenceBundle(bundle), []);
  assert.equal(bundle.registry.existing_contract_candidate.onchain_observation.token_uri_parts.join(""), bundle.registry.metadata.final_corrected_uri);
});

test("rejects repository draft metadata pointing to an obsolete image CID", async () => {
  const bundle = await makeBundle();
  bundle.draftMetadata.image = "ipfs://QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv";
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("NFT metadata.json image CID")));
});

test("rejects an unresolved final metadata CID after on-chain verification", async () => {
  const bundle = await makeBundle();
  bundle.registry.metadata.final_corrected_cid = null;
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Registry final metadata root CID")));
});

test("rejects contradictory mint interpretation", async () => {
  const bundle = await makeBundle();
  bundle.registry.existing_contract_candidate.onchain_observation.interpretation = "This does not prove the token is Official Logo #001.";
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("stale unverified-artwork")));
});

test("rejects inventory count drift", async () => {
  const bundle = await makeBundle();
  bundle.inventory.counts.unique_jpeg_jpg_blobs += 1;
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Unique JPEG count")));
});

test("rejects source image digest drift", async () => {
  const bundle = await makeBundle();
  bundle.registry.artwork.onchain_token_image.repository_asset_sha256 = "0".repeat(64);
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Actual repository image SHA-256")));
});

test("rejects a missing note for the exact on-chain motto wording difference", async () => {
  const bundle = await makeBundle();
  bundle.observation.metadata_consistency_notes = [];
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Description/Motto wording")));
});

test("rejects a malformed recipient being marked valid", async () => {
  const bundle = await makeBundle();
  bundle.registry.recipient_candidate.validation.valid_evm_address = true;
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Malformed recipient")));
});

test("rejects a changed repository PNG byte digest", async () => {
  const bundle = await makeBundle();
  bundle.repositoryFile.sha256 = "0".repeat(64);
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Actual repository image SHA-256")));
});

test("rejects a changed repository PNG Git blob identity", async () => {
  const bundle = await makeBundle();
  bundle.repositoryFile.gitBlobSha = "0".repeat(40);
  assert.ok(validateEvidenceBundle(bundle).some(x => x.includes("Git blob SHA")));
});
