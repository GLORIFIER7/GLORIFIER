'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectNvidiaCompletionResponse } = require('./nvidia-triage-response.cjs');

test('accepts documented NVIDIA chat-completion content and ignores additional top-level fields', () => {
  const result = inspectNvidiaCompletionResponse(JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'example/model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Evidence-backed diagnosis.' }, finish_reason: 'stop' }],
    usage: { total_tokens: 12 },
    provider_extension: { enabled: true },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.content, 'Evidence-backed diagnosis.');
  assert.deepEqual(result.shape.topLevelKeys, ['choices', 'id', 'model', 'object', 'provider_extension', 'usage']);
});

test('sorts safe payload keys using locale-aware alphabetical ordering', () => {
  const result = inspectNvidiaCompletionResponse(JSON.stringify({
    Beta: true,
    alpha: true,
    Alpha: true,
    beta: true,
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.shape.topLevelKeys, ['alpha', 'Alpha', 'beta', 'Beta']);
});

test('rejects an HTTP-200 provider error envelope without retaining its message', () => {
  const secretLikeBody = 'provider internal detail: do-not-retain';
  const result = inspectNvidiaCompletionResponse(JSON.stringify({ error: { message: secretLikeBody, code: 'backend_error' } }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_error_envelope');
  assert.equal(result.shape.errorPresent, true);
  assert.equal(JSON.stringify(result.shape).includes(secretLikeBody), false);
  assert.equal(JSON.stringify(result.shape).includes('backend_error'), false);
});

test('classifies absent or empty choices without exposing response values', () => {
  const result = inspectNvidiaCompletionResponse(JSON.stringify({ id: 'private-response-id', choices: [] }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'choices_missing_or_empty');
  assert.equal(JSON.stringify(result.shape).includes('private-response-id'), false);
});

test('rejects missing message and non-string content explicitly', () => {
  const missingMessage = inspectNvidiaCompletionResponse(JSON.stringify({ choices: [{ finish_reason: 'stop' }] }));
  assert.equal(missingMessage.reason, 'message_missing_or_invalid');

  const nonStringContent = inspectNvidiaCompletionResponse(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: [{ type: 'text', text: 'not the documented response shape' }] } }],
  }));
  assert.equal(nonStringContent.reason, 'content_not_string');
});

test('rejects empty assistant content', () => {
  const result = inspectNvidiaCompletionResponse(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: '   ' } }],
  }));
  assert.equal(result.reason, 'content_empty');
});

test('classifies invalid JSON without echoing the payload', () => {
  const payload = '{"api_key":"do-not-log","broken":';
  const result = inspectNvidiaCompletionResponse(payload);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_json');
  assert.equal(result.shape.parseStatus, 'invalid_json');
  assert.equal(result.shape.byteLength, Buffer.byteLength(payload));
  assert.equal(JSON.stringify(result.shape).includes('do-not-log'), false);
});

test('bounds response parsing before JSON decoding', () => {
  const payload = ' '.repeat(1024);
  const result = inspectNvidiaCompletionResponse(payload, { maxBytes: 64 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'response_too_large');
  assert.equal(result.shape.byteLength, 1024);
});

test('CLI writes redacted structural evidence, removes raw response, and fails closed for unsupported shape', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nvidia-triage-parser-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const responsePath = path.join(directory, 'response.json');
  const summaryPath = path.join(directory, 'summary.md');
  const shapePath = path.join(directory, 'shape.json');
  const requestPath = path.join(directory, 'request.json');
  fs.writeFileSync(responsePath, JSON.stringify({ error: { message: 'never upload this value' } }));
  fs.writeFileSync(requestPath, '{"contains":"request"}');

  const result = spawnSync(process.execPath, [
    require.resolve('./nvidia-triage-response.cjs'),
    responsePath, summaryPath, shapePath,
    'https://github.com/GLORIFIER7/GLORIFIER/actions/runs/1',
    requestPath,
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(responsePath), false);
  assert.equal(fs.existsSync(requestPath), false);
  assert.equal(fs.existsSync(summaryPath), true);
  assert.equal(fs.existsSync(shapePath), true);
  assert.match(fs.readFileSync(summaryPath, 'utf8'), /UNAVAILABLE/);
  assert.match(fs.readFileSync(summaryPath, 'utf8'), /provider_error_envelope/);
  const shapeText = fs.readFileSync(shapePath, 'utf8');
  assert.equal(shapeText.includes('never upload this value'), false);
  assert.equal(shapeText.includes('request'), false);
});


test('keeps the trusted triage parser checkout isolated from collected workspace logs', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'nvidia-ci-triage.yml'),
    'utf8',
  );
  const pinnedCheckout = 'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
  const checkoutRefs = workflow.split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line.startsWith('uses: actions/checkout@'))
    .map((line) => line.slice('uses: actions/checkout@'.length).split(' ')[0]);
  assert.equal(checkoutRefs.length, 3, 'NVIDIA CI triage must declare exactly three checkout actions');
  assert.ok(checkoutRefs.every((ref) => ref === pinnedCheckout.slice('uses: actions/checkout@'.length)),
    'NVIDIA CI triage must pin every checkout action to the reviewed immutable commit SHA');
  const authStep = workflow.indexOf('name: Checkout trusted main-branch authorization policy');
  const parserStep = workflow.indexOf('name: Checkout trusted main-branch triage parser');
  assert.ok(authStep >= 0 && parserStep > authStep, 'trusted authorization and parser checkouts must be present in order');
  const authCheckout = workflow.indexOf(pinnedCheckout, authStep);
  const parserCheckout = workflow.indexOf(pinnedCheckout, parserStep);
  assert.ok(authCheckout > authStep && parserCheckout > parserStep, 'authorization and parser checkouts must use the immutable pin');
  assert.ok(workflow.indexOf('path: authorization', authCheckout) > authCheckout);
  assert.ok(workflow.indexOf('path: trusted', parserCheckout) > parserCheckout);
  assert.match(workflow, /node trusted\/scripts\/nvidia-triage-response\.cjs/);

  const maintenanceWorkflow = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'nvidia-assisted-maintenance-pr.yml'),
    'utf8',
  );
  for (const [name, source] of [
    ['NVIDIA CI triage', workflow],
    ['NVIDIA assisted maintenance', maintenanceWorkflow],
  ]) {
    const checkoutRefs = source.split(String.fromCharCode(10))
      .map((line) => line.trim())
      .filter((line) => line.startsWith('uses: actions/checkout@'))
      .map((line) => line.slice('uses: actions/checkout@'.length).split(' ')[0]);
    assert.ok(checkoutRefs.length > 0, name + ' must declare checkout actions');
    assert.ok(
      checkoutRefs.every((ref) => /^[a-f0-9]{40}$/.test(ref)),
      name + ' must pin every checkout action to a full immutable commit SHA',
    );
  }
  const jobCondition = workflow.match(/^\s+if:\s*\$\{\{([\s\S]*?)\}\}/m)?.[1] ?? '';
  assert.match(jobCondition, /github\.event_name == 'workflow_dispatch'/);
  assert.match(jobCondition, /github\.ref == 'refs\/heads\/main'/);
  assert.match(jobCondition, /inputs\.allow_paid_inference == true/);
  assert.match(jobCondition, /github\.actor_id == '32674233'/);
  assert.match(jobCondition, /github\.run_attempt == 1/);
  assert.doesNotMatch(jobCondition, /workflow_run/);
  const authorizationIndex = workflow.indexOf('glorifier_ai_maintenance_authorized');
  assert.ok(authorizationIndex >= 0 && authorizationIndex < workflow.indexOf('name: Require NVIDIA credential'));
  assert.match(workflow, /"chat_template_kwargs"\s*:\s*\{\s*"enable_thinking"\s*:\s*False\s*\}/);
});

process.stdout.write('NVIDIA triage response parser regression tests passed.\n');
