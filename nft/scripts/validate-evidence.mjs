import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export function validateEvidenceBundle(bundle) {
  const issues = [];
  const add = (condition, message) => { if (!condition) issues.push(message); };
  const { registry, inventory, draftMetadata, secondaryDraft, publishedMetadata, observation } = bundle;
  const expectedName = "GLORIFIER SERVICES — Official Logo #001";
  const expectedImage = "ipfs://bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa";
  const expectedTokenUri = "ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1";
  const expectedImageSha256 = "6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790";
  const expectedHistoricalSha256 = "0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513";
  const expectedRecipientCandidate = "0x393c19Ff12e1624181fBF1938b80982b9dfC427";

  add(draftMetadata.name === expectedName, "NFT metadata draft name is not the official Logo #001 name.");
  add(secondaryDraft.name === expectedName, "Secondary NFT metadata draft name is not the official Logo #001 name.");
  add(draftMetadata.image === expectedImage, "NFT metadata.json image URI does not match the live token image CID.");
  add(secondaryDraft.image === expectedImage, "Secondary NFT metadata image URI does not match the live token image CID.");
  add(publishedMetadata.name === expectedName, "Published on-chain metadata name does not identify Official Logo #001.");
  add(publishedMetadata.image === expectedImage, "Published on-chain metadata image URI differs from the recorded token image URI.");

  const obs = registry.existing_contract_candidate?.onchain_observation ?? {};
  const meta = registry.metadata ?? {};
  add(meta.final_corrected_cid === "Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst", "Registry final_corrected_cid must identify the on-chain metadata root CID.");
  add(meta.final_corrected_path === "/1", "Registry final_corrected_path must preserve the tokenURI path suffix.");
  add(meta.final_corrected_uri === expectedTokenUri, "Registry final_corrected_uri must equal the live tokenURI(1).");
  add(meta.onchain_metadata_root_cid === meta.final_corrected_cid, "Registry metadata root CID and final CID disagree.");
  add(obs.token_uri === expectedTokenUri, "Registry on-chain tokenURI does not equal the observed tokenURI(1).");
  add(obs.current_owner === observation.reads.owner, "Registry current owner differs from direct eth_call evidence.");
  add(obs.owner_of_token_1 === observation.reads.ownerOf_1, "Registry ownerOf(1) differs from direct eth_call evidence.");
  add(observation.reads.owner === observation.reads.ownerOf_1, "Current owner and ownerOf(1) disagree.");
  add(observation.reads.totalSupply === "1", "Official Logo #001 supply is not recorded as exactly one.");
  add(registry.official_logo_001?.status === "VERIFIED_MINTED_ON_ETHEREUM_MAINNET", "Official Logo #001 is not recorded as minted.");
  add(registry.official_logo_001?.token_id === "1", "Official Logo #001 token ID is not 1.");

  const interpretation = String(obs.interpretation ?? "");
  add(interpretation.includes("GLORIFIER SERVICES Official Logo #001 NFT"), "Registry interpretation does not identify the verified Official Logo #001 token.");
  add(!interpretation.includes("does not prove"), "Registry interpretation retains the stale unverified-artwork claim.");
  add(String(obs.token_uri_and_artwork_match ?? "").includes("REPOSITORY_IMAGE_BYTES_MATCH"), "Registry artwork-match status does not record the repository image byte match.");

  const image = registry.artwork?.onchain_token_image ?? {};
  const repositoryAsset = observation.image_integrity?.repository_asset ?? {};
  const repositoryFile = bundle.repositoryFile ?? {};
  add(image.repository_asset_path === "GLORIFIER SERVICES.png", "Registry does not identify the canonical repository image path.");
  add(image.repository_asset_bytes === 55886, "Registry repository image byte size is inconsistent.");
  add(image.repository_asset_git_blob_sha === repositoryAsset.git_blob_sha, "Registry Git blob SHA differs from the observation.");
  add(image.repository_asset_sha256 === expectedImageSha256, "Registry repository image SHA-256 is not the verified image digest.");
  add(image.repository_asset_sha256_matches_image_cid_digest === true, "Registry does not verify repository asset SHA-256 against the image CID digest.");
  add(repositoryAsset.sha256 === expectedImageSha256, "Observation repository asset SHA-256 differs from the published image CID digest.");
  add(repositoryFile.sha256 === expectedImageSha256, "Actual GLORIFIER SERVICES.png SHA-256 no longer matches the live token image CID digest.");
  add(repositoryFile.bytes === 55886, "Actual GLORIFIER SERVICES.png byte size changed.");
  add(repositoryFile.gitBlobSha === repositoryAsset.git_blob_sha, "Actual GLORIFIER SERVICES.png Git blob SHA no longer matches the inventory record.");
  add(observation.image_integrity?.digest_sha256 === expectedImageSha256, "Observation image CID digest is inconsistent.");
  add(observation.image_integrity?.digest_matches_previous_retrieved_artwork_bytes === true, "CID digest match to the previously retrieved artwork bytes is not recorded.");
  add(expectedImageSha256 !== expectedHistoricalSha256, "Historical source PNG mismatch was unexpectedly erased.");
  add(registry.artwork?.historical_source_sha256 === expectedHistoricalSha256, "Historical source PNG hash is not preserved.");

  const pathCount = (items) => items.reduce((n, item) => n + 1 + (item.alias_paths?.length ?? 0), 0);
  add(inventory.counts?.jpeg_jpg_paths === pathCount(inventory.assets ?? []), "JPEG path count does not match the deduplicated JPEG asset list.");
  add(inventory.counts?.unique_jpeg_jpg_blobs === (inventory.assets ?? []).length, "Unique JPEG count does not match the JPEG asset list.");
  add(inventory.counts?.non_jpeg_paths === pathCount(inventory.other_image_assets ?? []), "Non-JPEG path count does not match the non-JPEG asset list.");
  add(inventory.counts?.unique_non_jpeg_blobs === (inventory.other_image_assets ?? []).length, "Unique non-JPEG count does not match the non-JPEG asset list.");
  add(inventory.counts?.unique_all_image_blobs === (inventory.assets ?? []).length + (inventory.other_image_assets ?? []).length, "Total unique image blob count is inconsistent.");
  add((inventory.other_image_assets ?? []).some(x => x.canonical_path === "GLORIFIER SERVICES.png" && x.git_blob_sha === repositoryAsset.git_blob_sha && x.size_bytes === 55886), "Canonical repository logo file is not present in the non-JPEG image inventory.");

  add(registry.recipient_candidate?.address === expectedRecipientCandidate, "Historical malformed recipient candidate was unexpectedly changed.");
  add(registry.recipient_candidate?.validation?.valid_evm_address === false, "Malformed historical recipient candidate must remain invalid.");
  add(expectedRecipientCandidate.slice(2).length === 39 && !/^0x[a-fA-F0-9]{40}$/.test(expectedRecipientCandidate), "Recipient validation fixture is not the expected malformed 39-character address.");

  const mismatchNotes = observation.metadata_consistency_notes ?? [];
  add(mismatchNotes.some(x => x.includes("description") && x.includes("Motto") && x.includes("verbatim")), "Description/Motto wording difference must be explicitly documented while preserving the gateway copy.");
  add(JSON.stringify(publishedMetadata) === JSON.stringify(observation.published_metadata), "Published metadata copy in the observation is not an exact match.");

  return issues;
}

async function run() {
  const [registry, inventory, draftMetadata, secondaryDraft, publishedMetadata, observation, png] = await Promise.all([
    readJson("nft/registry.json"),
    readJson("nft/image-inventory-2026-11-03.json"),
    readJson("nft/metadata.json"),
    readJson("nft/metadata/glorifier-services-official-logo-001.json"),
    readJson("nft/metadata/observed-ethereum-mainnet-official-logo-001.json"),
    readJson("nft/metadata/ethereum-mainnet-token-001-observation.json"),
    readFile("GLORIFIER SERVICES.png")
  ]);
  const gitBlobHeader = Buffer.concat([Buffer.from("blob " + png.length, "utf8"), Buffer.from([0])]);
  const repositoryFile = {
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
    gitBlobSha: createHash("sha1").update(Buffer.concat([gitBlobHeader, png])).digest("hex")
  };
  const issues = validateEvidenceBundle({registry, inventory, draftMetadata, secondaryDraft, publishedMetadata, observation, repositoryFile});
  if (issues.length) {
    for (const issue of issues) console.error("FAIL " + issue);
    process.exitCode = 1;
    return;
  }
  console.log("PASS NFT evidence bundle: metadata URIs, mint state, image CID/hash, repository asset identity, inventory counts, recipient validation and source-note consistency.");
}

if (process.argv.includes("--run")) await run();
