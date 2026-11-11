import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.test',
  '.example',
  '.invalid',
  '.home.arpa',
  '.onion',
];

function normalizePublicHostname(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a plain public DNS hostname.`);
  }

  const hostname = value.toLowerCase();
  const ipCandidate = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (isIP(ipCandidate) !== 0) {
    throw new Error(`${label} must not be an IP literal.`);
  }
  if (hostname.length > 253 || hostname.endsWith('.') || !hostname.includes('.')) {
    throw new Error(`${label} must be a fully-qualified public DNS hostname.`);
  }
  if (BLOCKED_SUFFIXES.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix))) {
    throw new Error(`${label} must not be a local, reserved, or non-public hostname.`);
  }

  const labels = hostname.split('.');
  if (labels.some((part) => part.length < 1 || part.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) {
    throw new Error(`${label} contains an invalid DNS label.`);
  }

  return hostname;
}

function parseAllowedHosts(rawAllowedHosts) {
  if (typeof rawAllowedHosts !== 'string' || rawAllowedHosts.trim() === '') {
    throw new Error('MCP conformance hostname allowlist is required.');
  }

  const entries = rawAllowedHosts.trim().split(/[\n,]/).map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    throw new Error('MCP conformance hostname allowlist contains an empty entry.');
  }

  return new Set(entries.map((entry) => normalizePublicHostname(entry, 'Allowlist entry')));
}

export function validateMcpConformanceTarget(targetUrl, rawAllowedHosts) {
  if (typeof targetUrl !== 'string' || targetUrl.trim() === '' || targetUrl !== targetUrl.trim()) {
    throw new Error('MCP conformance URL is required and must not contain surrounding whitespace.');
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('MCP conformance URL must be a valid absolute HTTPS URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('MCP conformance endpoint must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('MCP conformance endpoint must not contain URL credentials.');
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error('MCP conformance endpoint must not use a non-default port.');
  }
  if (parsed.pathname !== '/mcp') {
    throw new Error('MCP conformance endpoint path must be exactly /mcp.');
  }
  if (parsed.search || parsed.hash || targetUrl.includes('?') || targetUrl.includes('#')) {
    throw new Error('MCP conformance endpoint must not include a query string or fragment.');
  }

  const hostname = normalizePublicHostname(parsed.hostname, 'MCP endpoint hostname');
  const allowedHosts = parseAllowedHosts(rawAllowedHosts);
  if (!allowedHosts.has(hostname)) {
    throw new Error('MCP endpoint hostname is not present in the exact hostname allowlist.');
  }

  return `https://${hostname}/mcp`;
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const url = validateMcpConformanceTarget(
      process.env.GLORIFIER_MCP_CONFORMANCE_URL,
      process.env.GLORIFIER_MCP_CONFORMANCE_ALLOWED_HOSTS,
    );
    process.stdout.write(`${url}\n`);
  } catch (error) {
    process.stderr.write(`MCP conformance target rejected: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
