import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonText = await readFile(new URL("../package.json", import.meta.url), "utf8");
const packageLockText = await readFile(new URL("../package-lock.json", import.meta.url), "utf8");

function duplicateJsonKeys(source) {
  let index = 0;
  const duplicates = [];
  const skipWhitespace = () => { while (/\\s/.test(source[index] ?? "")) index += 1; };
  const parseString = () => {
    const start = index;
    if (source[index] !== '"') throw new SyntaxError(`Expected JSON string at offset ${index}`);
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const char = source[index++];
      if (escaped) escaped = false;
      else if (char === "\\\\") escaped = true;
      else if (char === '"') return JSON.parse(source.slice(start, index));
    }
    throw new SyntaxError("Unterminated JSON string");
  };
  const parseValue = (path) => {
    skipWhitespace();
    const char = source[index];
    if (char === "{") {
      index += 1;
      skipWhitespace();
      const seen = new Set();
      if (source[index] === "}") { index += 1; return; }
      while (index < source.length) {
        skipWhitespace();
        const key = parseString();
        if (seen.has(key)) duplicates.push(path ? `${path}.${key}` : key);
        seen.add(key);
        skipWhitespace();
        if (source[index++] !== ":") throw new SyntaxError(`Expected ':' after ${key}`);
        parseValue(path ? `${path}.${key}` : key);
        skipWhitespace();
        const separator = source[index++];
        if (separator === "}") return;
        if (separator !== ",") throw new SyntaxError(`Expected ',' or '}' at offset ${index - 1}`);
      }
      throw new SyntaxError("Unterminated JSON object");
    }
    if (char === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") { index += 1; return; }
      let item = 0;
      while (index < source.length) {
        parseValue(`${path}[${item++}]`);
        skipWhitespace();
        const separator = source[index++];
        if (separator === "]") return;
        if (separator !== ",") throw new SyntaxError(`Expected ',' or ']' at offset ${index - 1}`);
      }
      throw new SyntaxError("Unterminated JSON array");
    }
    if (char === '"') { parseString(); return; }
    const start = index;
    while (index < source.length && !/[\\s,}\\]]/.test(source[index])) index += 1;
    if (index === start) throw new SyntaxError(`Invalid JSON value at offset ${index}`);
  };
  parseValue("");
  skipWhitespace();
  if (index !== source.length) throw new SyntaxError(`Unexpected trailing JSON at offset ${index}`);
  return duplicates;
}

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
