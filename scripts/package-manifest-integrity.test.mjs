import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { duplicateJsonKeys } from "./package-manifest-integrity.mjs";

const packageJsonText = await readFile(new URL("../package.json", import.meta.url), "utf8");
const packageLockText = await readFile(new URL("../package-lock.json", import.meta.url), "utf8");
const capabilityRegistryText = await readFile(new URL("../docs/architecture/interoperability-capabilities.json", import.meta.url), "utf8");

test("duplicateJsonKeys identifies repeats without flagging separate objects", () => {
  assert.deepEqual(duplicateJsonKeys('{"dependencies":{"a":"1","a":"2"}}'), ["dependencies.a"]);
  assert.deepEqual(duplicateJsonKeys('{"a":{"x":1},"b":{"x":2}}'), []);
});


test("interoperability capability registry contains no duplicate JSON keys", () => {
  assert.deepEqual(duplicateJsonKeys(capabilityRegistryText), []);
});

test("package.json contains no duplicate JSON keys", () => {
  assert.deepEqual(duplicateJsonKeys(packageJsonText), []);
});

test("package-lock.json contains no duplicate JSON keys", () => {
  assert.deepEqual(duplicateJsonKeys(packageLockText), []);
});

test("package-lock root manifest matches package.json dependencies", () => {
  const manifest = JSON.parse(packageJsonText);
  const lock = JSON.parse(packageLockText);
  assert.deepEqual(lock.packages?.[""]?.dependencies ?? {}, manifest.dependencies ?? {});
  assert.deepEqual(lock.packages?.[""]?.devDependencies ?? {}, manifest.devDependencies ?? {});
});

test("duplicateJsonKeys handles escaped quotes and backslashes in values", () => {
  const source = "{\"value\":\"escaped quote: \\\" and slash: \\\\\",\"value\":\"second\"}";
  assert.deepEqual(duplicateJsonKeys(source), ["value"]);
});

test("standalone build entry points run package integrity and relevant prebuild checks", () => {
  const manifest = JSON.parse(packageJsonText);
  const sharedPrebuild = "npm run test:package-manifest-integrity && npm run test:brand-assets";
  for (const script of ["build:server", "build:android"]) {
    assert.equal(
      manifest.scripts?.["pre" + script],
      sharedPrebuild,
      script + " must run package manifest integrity and brand asset gates before building",
    );
  }
  assert.equal(
    manifest.scripts?.prebuildFrontend,
    undefined,
    "frontend prebuild must use the canonical npm lifecycle key",
  );
  assert.equal(
    manifest.scripts?.["prebuild:frontend"],
    sharedPrebuild + " && npm run test:service-worker-cache && npm run test:firebase-hosting-config && npm run test:picomatch-redos && npm run test:dependency-security-exceptions && npm run test:linear-string-normalization",
    "frontend builds must verify retired service-worker cache cleanup and Firebase Hosting configuration",
  );
  assert.equal(
    manifest.scripts?.["test:service-worker-cache"],
    "node --test scripts/service-worker-cache.test.mjs",
    "the service-worker cache migration test must be runnable independently",
  );
  assert.equal(
    manifest.scripts?.["test:picomatch-redos"],
    "node --test scripts/picomatch-redos-regression.test.mjs",
    "the locally patched Picomatch ReDoS regression test must be runnable independently",
  );
  assert.equal(
    manifest.scripts?.["test:firebase-hosting-config"],
    "node --test scripts/firebase-hosting-config.test.mjs",
    "the Firebase Hosting config test must be runnable independently",
  );
});

test("rimraf override follows its direct dependency spec", () => {
  const manifest = JSON.parse(packageJsonText);
  assert.equal(manifest.dependencies?.rimraf, "6.1.3");
  assert.equal(manifest.overrides?.rimraf?.["."], "$rimraf");
});

test("duplicateJsonKeys detects duplicates inside nested arrays", () => {
  assert.deepEqual(
    duplicateJsonKeys('{"items":[{"name":"first","name":"second"}]}'),
    ["items[0].name"],
  );
});

test("duplicateJsonKeys rejects malformed JSON", () => {
  assert.throws(() => duplicateJsonKeys('{"value": truX}'), SyntaxError);
});

test("local Picomatch override is explicit, locked, disclosed, and excluded from the npm tarball", async () => {
  const manifest = JSON.parse(packageJsonText);
  const lock = JSON.parse(packageLockText);
  const patchDocumentation = await readFile(
    new URL("../vendor/picomatch/SECURITY-PATCH.md", import.meta.url),
    "utf8",
  );

  assert.equal(manifest.overrides?.picomatch, "file:vendor/picomatch");
  assert.equal(manifest.devDependencies?.picomatch, "file:vendor/picomatch");
  assert.equal(lock.packages?.[""]?.devDependencies?.picomatch, "file:vendor/picomatch");
  assert.equal(lock.packages?.["node_modules/picomatch"]?.resolved, "file:vendor/picomatch");
  assert.ok(patchDocumentation.includes("not an official Picomatch release"));
  assert.ok(!manifest.files?.includes("vendor/picomatch"), "the local fork must not be shipped in the npm tarball");
});
