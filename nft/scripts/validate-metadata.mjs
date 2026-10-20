import { readFile } from "node:fs/promises";

const files = [
  "nft/metadata.json",
  "nft/metadata/glorifier-services-official-logo-001.json",
];

let failed = false;
const normalize = (uri) => uri.replace(/^ipfs:\/\//, "");

for (const file of files) {
  try {
    const raw = await readFile(file, "utf8");
    const metadata = JSON.parse(raw);

    if (typeof metadata.name !== "string" || !metadata.name.trim()) {
      throw new Error("missing non-empty name");
    }
    if (typeof metadata.description !== "string" || !metadata.description.trim()) {
      throw new Error("missing non-empty description");
    }
    if (typeof metadata.image !== "string" || !metadata.image.startsWith("ipfs://")) {
      throw new Error("image must be an ipfs:// URI");
    }
    if (!Array.isArray(metadata.attributes)) {
      throw new Error("attributes must be an array");
    }
    for (const [index, attribute] of metadata.attributes.entries()) {
      if (
        !attribute ||
        typeof attribute.trait_type !== "string" ||
        typeof attribute.value !== "string"
      ) {
        throw new Error(`attribute ${index} must have string trait_type and value`);
      }
    }

    console.log(`PASS ${file}: valid JSON shape; image CID = ${normalize(metadata.image)}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${file}: ${error.message}`);
  }
}

if (failed) process.exitCode = 1;
else {
  console.log("NOTE: This offline check does not fetch IPFS bytes, verify a CID against downloaded bytes, prove pinning, or authorize deployment/minting.");
}
