'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_CONTENT_CHARS = 12_000;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

const typeName = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const safeKeys = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value)
    .filter((key) => SAFE_KEY_PATTERN.test(key))
    .sort((left, right) => left.localeCompare(right, 'en'))
    .slice(0, 32);
};

/** Return structural metadata only; never include provider-supplied values. */
const inspectShape = (payload) => {
  const choices = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.choices
    : undefined;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = firstChoice && typeof firstChoice === 'object' && !Array.isArray(firstChoice)
    ? firstChoice.message
    : undefined;
  const content = message && typeof message === 'object' && !Array.isArray(message)
    ? message.content
    : undefined;

  return {
    parseStatus: 'valid_json',
    topLevelType: typeName(payload),
    topLevelKeys: safeKeys(payload),
    errorPresent: Boolean(payload && typeof payload === 'object' && !Array.isArray(payload)
      && Object.hasOwn(payload, 'error')),
    choicesType: typeName(choices),
    choicesCount: Array.isArray(choices) ? choices.length : null,
    firstChoiceType: typeName(firstChoice),
    firstChoiceKeys: safeKeys(firstChoice),
    messageType: typeName(message),
    messageKeys: safeKeys(message),
    contentType: typeName(content),
    contentArrayItemTypes: Array.isArray(content) ? content.slice(0, 16).map(typeName) : [],
  };
};

/**
 * Inspect only the documented non-streaming NVIDIA NIM Chat Completions
 * response envelope. Return bounded assistant text on success; on failure,
 * return structural metadata only and never retain or echo provider values.
 */
const inspectNvidiaCompletionResponse = (rawText, options = {}) => {
  const maxBytes = Number.isSafeInteger(options.maxBytes) && options.maxBytes > 0
    ? options.maxBytes
    : DEFAULT_MAX_RESPONSE_BYTES;
  const byteLength = Buffer.byteLength(String(rawText), 'utf8');

  if (byteLength > maxBytes) {
    return {
      ok: false,
      reason: 'response_too_large',
      content: null,
      shape: { parseStatus: 'not_attempted', byteLength, maxBytes },
    };
  }

  let payload;
  try {
    payload = JSON.parse(String(rawText));
  } catch {
    return {
      ok: false,
      reason: 'invalid_json',
      content: null,
      shape: { parseStatus: 'invalid_json', byteLength },
    };
  }

  const shape = inspectShape(payload);
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'top_level_not_object', content: null, shape };
  }
  if (shape.errorPresent) {
    return { ok: false, reason: 'provider_error_envelope', content: null, shape };
  }
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    return { ok: false, reason: 'choices_missing_or_empty', content: null, shape };
  }

  const choice = payload.choices[0];
  if (choice === null || typeof choice !== 'object' || Array.isArray(choice)) {
    return { ok: false, reason: 'first_choice_not_object', content: null, shape };
  }
  const message = choice.message;
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return { ok: false, reason: 'message_missing_or_invalid', content: null, shape };
  }
  if (typeof message.content !== 'string') {
    return { ok: false, reason: 'content_not_string', content: null, shape };
  }

  const content = message.content.trim();
  if (!content) {
    return { ok: false, reason: 'content_empty', content: null, shape };
  }

  return {
    ok: true,
    reason: null,
    content: content.slice(0, MAX_CONTENT_CHARS),
    shape,
  };
};

const safeRunUrl = (value) => {
  if (typeof value !== 'string') return 'see workflow run metadata';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') return parsed.toString();
  } catch {
    // Fall through to the non-sensitive fallback below.
  }
  return 'see workflow run metadata';
};

const main = (argv) => {
  const [responsePath, summaryPath, shapePath, runUrl, requestPath] = argv;
  if (!responsePath || !summaryPath || !shapePath) {
    process.stderr.write('Usage: node nvidia-triage-response.cjs <response.json> <summary.md> <shape.json> [run-url] [request.json]\n');
    return 2;
  }

  let exitCode = 0;
  try {
    const raw = fs.readFileSync(responsePath, 'utf8');
    const result = inspectNvidiaCompletionResponse(raw);
    const shapeDocument = {
      evidenceClass: 'diagnostic-metadata',
      rawProviderResponseRetained: false,
      reason: result.reason,
      shape: result.shape,
    };
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.mkdirSync(path.dirname(shapePath), { recursive: true });
    fs.writeFileSync(shapePath, JSON.stringify(shapeDocument, null, 2) + '\n', { mode: 0o600 });

    const summary = result.ok
      ? '# NVIDIA CI failure triage\n\n'
        + '**Status:** AI-generated diagnosis; not independently verified.\n\n'
        + '**Run:** ' + safeRunUrl(runUrl) + '\n\n'
        + result.content + '\n\n---\n'
        + 'No source files were changed, no PR was merged, and no deployment was performed by this workflow.\n'
      : '# NVIDIA CI failure triage\n\n'
        + '**Status:** UNAVAILABLE — provider response did not match the supported non-streaming Chat Completions response contract.\n\n'
        + '**Reason code:** ' + result.reason + '\n\n'
        + '**Run:** ' + safeRunUrl(runUrl) + '\n\n'
        + '**Evidence:** nvidia-response-shape.json contains structural metadata only. Raw response text and provider error values were not retained.\n';
    fs.writeFileSync(summaryPath, summary, { mode: 0o600 });

    if (!result.ok) {
      process.stderr.write('NVIDIA response unavailable; safe structural metadata written (' + result.reason + ').\n');
      exitCode = 1;
    } else {
      const stepSummary = process.env.GITHUB_STEP_SUMMARY;
      if (stepSummary) fs.appendFileSync(stepSummary, summary, { mode: 0o600 });
      process.stdout.write('NVIDIA analysis received. Raw provider response and request files were not retained.\n');
    }
  } catch {
    process.stderr.write('NVIDIA response processing failed; provider content was not printed.\n');
    exitCode = 1;
  } finally {
    for (const file of [responsePath, requestPath]) {
      if (file) {
        try { fs.rmSync(file, { force: true }); } catch { /* best-effort sensitive-file cleanup */ }
      }
    }
  }

  return exitCode;
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { inspectNvidiaCompletionResponse };
