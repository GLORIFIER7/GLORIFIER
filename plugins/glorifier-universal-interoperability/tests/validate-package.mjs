#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats").default;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const exists = async (relative) => access(path.join(root, relative)).then(() => true, () => false);
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("portable manifest parses and declares a valid package identity", async () => {
  const manifest = await readJson("plugin.json");
  assert.match(manifest.name, /^[a-z0-9][a-z0-9-]+$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.ok(manifest.description?.trim());
  assert.ok(manifest.author?.name?.trim());
  assert.match(manifest.homepage, /^https:\/\//);
  assert.match(manifest.repository, /^https:\/\//);
  assert.ok(Array.isArray(manifest.keywords) && manifest.keywords.length > 0);
});

check("host compatibility manifest parses and points to an existing skills directory", async () => {
  const manifest = await readJson(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "glorifier-universal-interoperability");
  assert.equal(manifest.version, (await readJson("plugin.json")).version);
  assert.ok(manifest.interface?.displayName);
  assert.ok(manifest.interface?.shortDescription);
  assert.ok(manifest.interface?.longDescription);
  assert.ok(await exists(manifest.skills.replace(/^\.\//, "")));
  assert.ok(await exists(manifest.interface.logo.replace(/^\.\//, "")));
  assert.ok(await exists(manifest.interface.composerIcon.replace(/^\.\//, "")));
});

check("every packaged skill has valid frontmatter and required metadata", async () => {
  for (const file of [
    "skills/universal-interoperability/SKILL.md",
    "skills/host-workspace-operator/SKILL.md"
  ]) {
    const body = await readFile(path.join(root, file), "utf8");
    assert.ok(body.startsWith("---\n"), file + ": missing YAML frontmatter");
    const header = body.split("---")[1];
    assert.match(header, /^name:\s*[a-z0-9-]+$/m, file + ": invalid/missing name");
    assert.match(header, /^description:\s*.+$/m, file + ": missing description");
    assert.ok(body.split("---")[2]?.trim().length > 100, file + ": missing skill instructions");
  }
});

check("integration descriptor schema is a closed object with required verification fields", async () => {
  const schema = await readJson("schemas/integration-descriptor.schema.json");
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  for (const key of ["id", "displayName", "kind", "source", "connectionState", "protocols", "capabilities", "verification"]) {
    assert.ok(schema.required.includes(key), "required field missing: " + key);
    assert.ok(schema.properties[key], "property definition missing: " + key);
  }
  assert.deepEqual(schema.properties.verification.properties.status.enum, [
    "VERIFIED", "PARTIALLY VERIFIED", "NOT VERIFIED", "DEGRADED", "NOT OBSERVABLE"
  ]);
  assert.deepEqual(schema.properties.verification.then.required, ["testRef", "timestamp"]);
  assert.equal(schema.properties.verification.then.properties.testRef.type, "string");
  const timestampRule = schema.properties.verification.then.properties.timestamp;
  assert.equal(timestampRule.type, "string");
  assert.equal(timestampRule.minLength, 1);
  assert.ok(timestampRule.pattern, "timestamp gate must enforce a format pattern without relying only on format annotation");
  const timestampPattern = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$/;
  assert.equal(timestampRule.pattern, "^\\\\d{4}-\\\\d{2}-\\\\d{2}T\\\\d{2}:\\\\d{2}:\\\\d{2}(\\\\.\\\\d+)?(Z|[+-]\\\\d{2}:\\\\d{2})$", "schema pattern must match the reviewed RFC 3339 shape");
  assert.ok(timestampPattern.test("2026-10-26T02:53:17Z"), "accepts RFC 3339 UTC timestamp");
  assert.ok(timestampPattern.test("2026-10-26T02:53:17.123+07:00"), "accepts RFC 3339 timestamp with fractional seconds and offset");
  assert.ok(!timestampPattern.test(""), "rejects empty timestamp");
  assert.ok(!timestampPattern.test("soon"), "rejects non-date timestamp");
  const capability = schema.properties.capabilities.items;
  assert.deepEqual(capability.then.required, ["evidenceRefs"]);
  assert.equal(capability.then.properties.evidenceRefs.minItems, 1);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const validDescriptor = {
    id: "provider.example", displayName: "Example Provider", kind: "model_provider",
    source: "operator_supplied", connectionState: "configured", protocols: [],
    capabilities: [{ id: "generate", readWrite: "read_only", verificationStatus: "VERIFIED", evidenceRefs: ["tests/provider-smoke.md"] }],
    verification: { status: "VERIFIED", testRef: "tests/provider-smoke.md", timestamp: "2026-10-26T02:53:17Z" }
  };
  assert.equal(validate(validDescriptor), true, "accepts a representative evidence-backed descriptor");
  for (const [label, mutate] of [
    ["missing testRef", (d) => { delete d.verification.testRef; }],
    ["empty timestamp", (d) => { d.verification.timestamp = ""; }],
    ["non-date timestamp", (d) => { d.verification.timestamp = "soon"; }],
    ["impossible calendar timestamp", (d) => { d.verification.timestamp = "2026-99-99T99:99:99Z"; }],
    ["missing capability evidence", (d) => { delete d.capabilities[0].evidenceRefs; }],
    ["empty capability evidence", (d) => { d.capabilities[0].evidenceRefs = []; }]
  ]) {
    const descriptor = structuredClone(validDescriptor);
    mutate(descriptor);
    assert.equal(validate(descriptor), false, "rejects " + label);
  }
});

check("referenced artwork exists and uses safe inline SVG roots", async () => {
  for (const file of ["assets/logo-light.svg", "assets/logo-dark.svg", "assets/icon.svg"]) {
    const svg = await readFile(path.join(root, file), "utf8");
    assert.match(svg, /^<svg\s/m, file + ": missing SVG root");
    assert.match(svg, /viewBox=/, file + ": missing viewBox");
    assert.doesNotMatch(svg, /<script\b|\bon\w+\s*=|javascript:/i, file + ": active content is not allowed");
  }
});

check("package documentation states its real scope and does not claim universal live connectivity", async () => {
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  assert.match(readme, /skills-only/i);
  assert.match(readme, /does not itself connect to every service/i);
  assert.match(readme, /has not yet been run through the Plugin Autopilot validator/i);
});

let failed = 0;
for (const { name, fn } of checks) {
  try {
    await fn();
    process.stdout.write("PASS " + name + "\n");
  } catch (error) {
    failed += 1;
    process.stderr.write("FAIL " + name + "\n" + String(error?.stack ?? error) + "\n");
  }
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed.\n`);
if (failed) process.exitCode = 1;
