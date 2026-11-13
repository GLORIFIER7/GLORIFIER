import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedSha256 = "6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790";
const canonicalCid = "bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa";
const appPath = "glorifier-services-official-logo-001.png";
const read = (path, encoding) => readFile(new URL(path, import.meta.url), encoding);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const [sourcePng, appPng, brandRecord, header, indexHtml, manifestText, policy, projectPage, appIcon] =
  await Promise.all([
    read("../GLORIFIER SERVICES.png"),
    read("../public/" + appPath),
    read("../src/lib/brand-assets.ts", "utf8"),
    read("../src/components/Header.tsx", "utf8"),
    read("../index.html", "utf8"),
    read("../public/manifest.webmanifest", "utf8"),
    read("../BRAND_ASSET_POLICY.md", "utf8"),
    read("../public/project.html", "utf8"),
    read("../public/glorifier-app-icon.svg", "utf8"),
  ]);

test("app-served logo is the byte-identical Ethereum ERC-721 token image", () => {
  assert.equal(sourcePng.length, 55886);
  assert.equal(appPng.length, 55886);
  assert.equal(sha256(sourcePng), expectedSha256);
  assert.equal(sha256(appPng), expectedSha256);
  assert.deepEqual(appPng, sourcePng);
  assert.equal(appPng.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(appPng.readUInt32BE(16), 500);
  assert.equal(appPng.readUInt32BE(20), 500);
});

test("shared brand record identifies the minted ERC-721 token image", () => {
  assert.match(brandRecord, /tokenStandard: 'ERC-721'/);
  assert.match(brandRecord, /tokenId: '1'/);
  assert.match(brandRecord, new RegExp(canonicalCid));
  assert.match(brandRecord, new RegExp(expectedSha256));
  assert.match(brandRecord, new RegExp(appPath));
  assert.doesNotMatch(brandRecord, /QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv/);
});

test("app header consumes the centralized local artwork path", () => {
  assert.match(header, /GLORIFIER_OFFICIAL_BRAND_ASSET/);
  assert.match(header, /import\.meta\.env\.BASE_URL/);
  assert.match(header, /object-contain/);
  assert.doesNotMatch(header, /gravatar\.com|ipfs\.io\/ipfs\/QmVHCtut/);
});

test("browser and installed-app icons use the same canonical PNG", () => {
  assert.match(indexHtml, new RegExp("%BASE_URL%" + appPath));
  assert.match(indexHtml, new RegExp(canonicalCid));
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.icons.length, 1);
  assert.equal(manifest.icons[0].src, appPath);
  assert.equal(manifest.icons[0].type, "image/png");
  assert.equal(manifest.icons[0].sizes, "500x500");
  for (const source of [indexHtml, manifestText]) {
    assert.doesNotMatch(source, /gravatar\.com|QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv/);
  }
});

test("the project page and compatibility SVG use the same canonical artwork", () => {
  assert.match(projectPage, /glorifier-services-official-logo-001\\.png/);
  assert.match(projectPage, /autonomous AI enterprise/i);
  assert.doesNotMatch(projectPage, /gravatar\\.com|<span class="mark"[^>]*>G<\\/span>/);
  assert.match(appIcon, /glorifier-services-official-logo-001\\.png/);
  assert.doesNotMatch(appIcon, /gravatar\\.com/);
});

test("brand policy records the NFT-matched asset and historical hash distinction", () => {
  assert.match(policy, new RegExp(expectedSha256));
  assert.match(policy, new RegExp(canonicalCid));
  assert.match(policy, /ERC-721/);
  assert.match(policy, /0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513/);
});
