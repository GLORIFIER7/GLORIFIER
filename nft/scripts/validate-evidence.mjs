import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const joinParts = (value) => Array.isArray(value) ? value.join("") : "";

function validateMetadata(bundle) {
  const { draftMetadata, secondaryDraft, publishedMetadata } = bundle;
  const expectedName = "GLORIFIER SERVICES — Official Logo #001";
  const expectedImage = "ipfs://bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa";
  const issues = [];
  if (draftMetadata.name !== expectedName) issues.push("NFT metadata draft name mismatch.");
  if (secondaryDraft.name !== expectedName) issues.push("Secondary NFT metadata name mismatch.");
  if (draftMetadata.image !== expectedImage) issues.push("NFT metadata.json image CID mismatch.");
  if (secondaryDraft.image !== expectedImage) issues.push("Secondary metadata image CID mismatch.");
  if (publishedMetadata.name !== expectedName) issues.push("Published metadata name mismatch.");
  if (publishedMetadata.image !== expectedImage) issues.push("Published metadata image CID mismatch.");
  return issues;
}

function validateMintState(bundle) {
  const { registry, observation } = bundle;
  const obs = registry.existing_contract_candidate?.onchain_observation ?? {};
  const uri = registry.metadata?.final_corrected_uri;
  const issues = [];
  if (joinParts(obs.token_uri_parts) !== uri) issues.push("Registry token URI segments mismatch.");
  if (joinParts(obs.owner_of_token_1_parts) !== observation.reads.ownerOf_1) issues.push("Registry ownerOf(1) segments mismatch.");
  if (joinParts(observation.reads.tokenURI_1_parts) !== uri) issues.push("Observation tokenURI(1) segments mismatch.");
  if (obs.current_owner !== observation.reads.owner) issues.push("Registry current owner mismatch.");
  if (observation.reads.owner !== observation.reads.ownerOf_1) issues.push("Current owner and ownerOf(1) disagree.");
  if (observation.reads.totalSupply !== "1") issues.push("Official Logo #001 supply must equal one.");
  if (registry.official_logo_001?.status !== "VERIFIED_MINTED_ON_ETHEREUM_MAINNET") issues.push("Official Logo #001 is not recorded as minted.");
  if (registry.official_logo_001?.token_id !== "1") issues.push("Official Logo #001 token ID is not 1.");
  const officialLogo = registry.official_logo_001 ?? {};
  if (joinParts(officialLogo.owner_parts) !== observation.reads.owner) issues.push("Official Logo #001 owner segments mismatch.");
  if (joinParts(officialLogo.token_uri_parts) !== registry.metadata?.final_corrected_uri) issues.push("Official Logo #001 token URI segments mismatch.");
  if (joinParts(officialLogo.image_uri_parts) !== observation.published_metadata.image) issues.push("Official Logo #001 image URI segments mismatch.");
  if (officialLogo.owner !== undefined || officialLogo.token_uri !== undefined || officialLogo.image_uri !== undefined) issues.push("Official Logo #001 summary must not duplicate public high-entropy identifiers as unsegmented strings.");
  return issues;
}

function validateRegistryMetadata(bundle) {
  const { registry } = bundle;
  const meta = registry.metadata ?? {};
  const path = meta.final_corrected_path;
  const root = meta.final_corrected_cid;
  const uri = root && path ? "ipfs://" + root + path : "";
  const issues = [];
  if (!root) issues.push("Registry final metadata root CID is missing.");
  if (path !== "/1") issues.push("Registry final metadata path mismatch.");
  if (meta.final_corrected_uri !== uri) issues.push("Registry final metadata URI mismatch.");
  if (meta.onchain_metadata_root_cid !== root) issues.push("Registry metadata root and final CID disagree.");
  const artworkMatch = String(registry.existing_contract_candidate?.onchain_observation?.token_uri_and_artwork_match ?? "");
  if (!artworkMatch.includes("REPOSITORY_IMAGE_BYTES_MATCH")) issues.push("Registry artwork-match status does not record the repository image byte match.");
  const interpretation = String(registry.existing_contract_candidate?.onchain_observation?.interpretation ?? "");
  if (!interpretation.includes("GLORIFIER SERVICES Official Logo #001 NFT")) issues.push("Registry interpretation must identify the minted Official Logo #001 token.");
  if (interpretation.includes("does not prove")) issues.push("Registry interpretation retains stale unverified-artwork wording.");
  return issues;
}

function validateRepositoryImage(bundle) {
  const { registry, observation, repositoryFile } = bundle;
  const image = registry.artwork?.onchain_token_image ?? {};
  const repositoryAsset = observation.image_integrity?.repository_asset ?? {};
  const onchainObservation = registry.existing_contract_candidate?.onchain_observation ?? {};
  const expected = "6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790";
  const issues = [];
  if (joinParts(onchainObservation.token_image_uri_parts) !== observation.published_metadata.image) issues.push("Registry token image URI segments mismatch.");
  if (image.repository_asset_path !== "GLORIFIER SERVICES.png") issues.push("Registry canonical repository image path mismatch.");
  if (image.repository_asset_bytes !== 55886 || repositoryAsset.bytes !== 55886 || repositoryFile.bytes !== 55886) issues.push("Repository logo byte-size mismatch.");
  if (image.repository_asset_git_blob_sha !== repositoryAsset.git_blob_sha || repositoryFile.gitBlobSha !== repositoryAsset.git_blob_sha) issues.push("Repository logo Git blob SHA mismatch.");
  if (image.repository_asset_sha256 !== expected || repositoryAsset.sha256 !== expected || repositoryFile.sha256 !== expected) issues.push("Actual repository image SHA-256 mismatch.");
  if (image.repository_asset_sha256_matches_image_cid_digest !== true) issues.push("Repository image SHA-256 is not recorded as matching image CID digest.");
  if (observation.image_integrity?.digest_sha256 !== expected) issues.push("Image CID digest mismatch.");
  if (observation.image_integrity?.digest_matches_previous_retrieved_artwork_bytes !== true) issues.push("Previous image retrieval digest match missing.");
  if (registry.artwork?.historical_source_sha256 !== "0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513") issues.push("Historical source PNG SHA-256 was not preserved.");
  if (expected === registry.artwork?.historical_source_sha256) issues.push("Historical source mismatch was incorrectly erased.");
  return issues;
}

function validateInventory(bundle) {
  const { inventory, observation } = bundle;
  const pathCount = (items) => items.reduce((n, item) => n + 1 + (item.alias_paths?.length ?? 0), 0);
  const assets = inventory.assets ?? [];
  const other = inventory.other_image_assets ?? [];
  const blob = observation.image_integrity?.repository_asset?.git_blob_sha;
  const issues = [];
  if (inventory.counts?.jpeg_jpg_paths !== pathCount(assets)) issues.push("JPEG path count mismatch.");
  if (inventory.counts?.unique_jpeg_jpg_blobs !== assets.length) issues.push("Unique JPEG count mismatch.");
  if (inventory.counts?.non_jpeg_paths !== pathCount(other)) issues.push("Non-JPEG path count mismatch.");
  if (inventory.counts?.unique_non_jpeg_blobs !== other.length) issues.push("Unique non-JPEG count mismatch.");
  if (inventory.counts?.unique_all_image_blobs !== assets.length + other.length) issues.push("Total unique image count mismatch.");
  if (!other.some(x => x.canonical_path === "GLORIFIER SERVICES.png" && x.git_blob_sha === blob && x.size_bytes === 55886)) issues.push("Canonical logo missing from non-JPEG inventory.");
  return issues;
}

function validateRecipient(bundle) {
  const address = bundle.registry.recipient_candidate?.address;
  const expected = "0x393c19Ff12e1624181fBF1938b80982b9dfC427";
  if (address !== expected) return ["Historical malformed recipient candidate unexpectedly changed."];
  if (bundle.registry.recipient_candidate?.validation?.valid_evm_address !== false) return ["Malformed recipient candidate must remain invalid."];
  if (address.slice(2).length !== 39 || /^0x[a-fA-F0-9]{40}$/.test(address)) return ["Recipient validation fixture is not the expected malformed address."];
  return [];
}

function validateMetadataProvenance(bundle) {
  const { observation, publishedMetadata } = bundle;
  const notes = observation.metadata_consistency_notes ?? [];
  const issues = [];
  if (!notes.some(x => x.includes("description") && x.includes("Motto") && x.includes("verbatim"))) issues.push("Description/Motto wording difference must be documented verbatim.");
  if (JSON.stringify(publishedMetadata) !== JSON.stringify(observation.published_metadata)) issues.push("Published metadata copy does not exactly match the observation.");
  return issues;
}

export function validateEvidenceBundle(bundle) {
  return [
    ...validateMetadata(bundle),
    ...validateMintState(bundle),
    ...validateRegistryMetadata(bundle),
    ...validateRepositoryImage(bundle),
    ...validateInventory(bundle),
    ...validateRecipient(bundle),
    ...validateMetadataProvenance(bundle)
  ];
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
  const repositoryFile = {
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
    // Use Git's object implementation for its repository blob identifier; this is not a security digest.
    gitBlobSha: execFileSync("/usr/bin/git", ["hash-object", "--stdin"], {
      input: png,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }).trim()
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
