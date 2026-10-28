import { pathToFileURL } from 'node:url';

/**
 * Validate a configured intelligence endpoint without making a network request.
 * This is configuration validation only; it does not prove endpoint availability.
 */
export function validateIntelligenceEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL is not configured.' };
  }
  if (value !== value.trim()) {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL must not contain leading or trailing whitespace.' };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL is not a valid absolute URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL must use HTTPS.' };
  }
  if (!parsed.hostname) {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL must include a hostname.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL must not embed credentials.' };
  }
  if (parsed.hash) {
    return { ok: false, reason: 'GLORIFIER_INTELLIGENCE_URL must not include a fragment.' };
  }

  return { ok: true, reason: null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateIntelligenceEndpoint(process.env.GLORIFIER_INTELLIGENCE_URL);
  if (!result.ok) {
    console.error('::error::' + result.reason);
    process.exitCode = 1;
  } else {
    console.log('Configured intelligence endpoint passed URL policy validation.');
  }
}
