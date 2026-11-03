// Gravatar uses a SHA-256 digest of a normalized email address.
// This helper is intentionally kept server-side when possible so email addresses
// are not exposed in browser code or URLs.
import { createHash } from "node:crypto";

export function gravatarUrl(email: string, size = 160): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=identicon&r=pg`;
}

export const glorifierNpmProfile = "https://www.npmjs.com/~glorifier";
