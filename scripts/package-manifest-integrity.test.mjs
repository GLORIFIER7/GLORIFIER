import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { duplicateJsonKeys } from "./package-manifest-integrity.mjs";

const packageJsonText = await readFile(new URL("../package.json", import.meta.url), "utf8");
const packageLockText = await readFile(new URL("../package-lock.json", import.meta.url), "utf8");

test("duplicateJsonKeys identifies repeats without flagging separate objects", () => {
  assert.deepEqual(duplicateJsonKeys('{"dependencies":{"a":"1","a":"2"}}'), ["dependencies.a"]);
  assert.deepEqual(duplicateJsonKeys('{"a":{"x":1},"b":{"x":2}}'), []);
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

test("standalone build entry points run package manifest integrity first", () => {
  const manifest = JSON.parse(packageJsonText);
  for (const script of ["build:frontend", "build:server", "build:android"]) {
    assert.equal(
      manifest.scripts?.["pre" + script],
      "npm run test:package-manifest-integrity",
      script + " must run the package manifest integrity gate before building",
    );
  }
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
