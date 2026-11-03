import assert from "node:assert/strict";
import test from "node:test";
import { gravatarUrl } from "./gravatar";

test("Gravatar URLs use normalized SHA-256 identifiers", () => {
  const url = new URL(gravatarUrl("MyEmailAddress@example.com "));
  assert.equal(url.hostname, "gravatar.com");
  assert.equal(url.pathname, "/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee");
  assert.equal(url.searchParams.get("s"), "160");
  assert.equal(url.searchParams.get("d"), "identicon");
  assert.equal(url.searchParams.get("r"), "pg");
});

test("Gravatar identifiers differ for different normalized emails", () => {
  const first = new URL(gravatarUrl("one@example.org")).pathname;
  const normalized = new URL(gravatarUrl(" ONE@example.org ")).pathname;
  const second = new URL(gravatarUrl("two@example.org")).pathname;
  assert.equal(first, normalized);
  assert.notEqual(first, second);
  const firstHash = first.split("/").at(-1) ?? "";
  assert.match(firstHash, /^[a-f0-9]{64}$/);
});
