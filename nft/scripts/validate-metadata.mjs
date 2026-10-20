import { readFile } from "node:fs/promises";

const files = [
  "nft/metadata.json",
  "nft/metadata/glorifier-services-official-logo-001.json",
];

const normalize = (uri) => uri.replace(/^ipfs:\/\//, "");

const results = await Promise.all(files.map(async (file) => {
  try {
    const raw = await readFile(file, "utf8");
    const metadata = JSON.parse(raw);

    if (typeof metadata.name !== "string" || !metadata.name.trim()) {
      throw new TypeError("missing non-empty name");
    }
    if (typeof metadata.description !== "string" || !metadata.description.trim()) {
      throw new TypeError("missing non-empty description");
    }
    if (typeof metadata.image !== "string" || !metadata.image.startsWith("ipfs://")) {
      throw new TypeError("image must be an ipfs:// URI");
    }
    if (!Array.isArray(metadata.attributes)) {
      throw new TypeError("attributes must be an array");
    }
    for (const [index, attribute] of metadata.attributes.entries()) {
      if (
        !attribute ||
        typeof attribute.trait_type !== "string" ||
        typeof attribute.value !== "string"
      ) {
        throw new TypeError(`attribute ${index} must have string trait_type and value`);
      }
    }

    return { file, metadata };
  } catch (error) {
    return { file, error };
  }
}));

let failed = false;
for (const result of results) {
  if (result.error) {
    failed = true;
    console.error(`FAIL ${result.file}: ${result.error.message}`);
    continue;
  }
  console.log(`PASS ${result.file}: valid JSON shape; image CID = ${normalize(result.metadata.image)}`);
}

if (failed) process.exitCode = 1;
else {
  console.log("NOTE: This offline check does not fetch IPFS bytes, verify a CID against downloaded bytes, prove pinning, or authorize deployment/minting.");
}
