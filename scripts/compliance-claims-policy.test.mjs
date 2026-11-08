import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../src/components/ComplianceScientistBot.tsx');
const server = read('../server.ts');
const presets = read('../src/components/WorkTogetherWithGptStudio.tsx');
const roster = read('../src/components/AiModelsCollaborationManagement.tsx');
const globalSync = read('../src/lib/global-sync.ts');
const privacyLab = read('../src/components/PrivacyTechLab.tsx');
const claimSurfaces = [ui, presets, roster, globalSync, privacyLab].join('\n');

test('visible compliance UI, presets, and roster do not assert unsupported legal or privacy claims', () => {
  for (const claim of [
    /Mandatory 30-day statutory cure period/i,
    /30-day cure deadline/i,
    /30-day statutory window/i,
    /EU AI Act Class 1/i,
    /Class 1\s*\(Minimal Risk/i,
    /eu-ai-act-class-1/i,
    /zero prohibited AI practices/i,
    /Zero prohibited biometric categorizations/i,
    /0\.0004/i,
    /k-anonymity\s*\(k\s*[≥>=]\s*50\)/i,
    /CIPP\/E|CIPP\/US|CIPM|FIP|Ph\.D\. in Statistical Privacy|CIPP \/ Privacy Ph\.D\./i,
    /Statutory Safe Harbor: Treated as fully non-PII|fully non-PII under GDPR Recital 26/i,
    /GDPR Article 25 Invariant/i,
    /Chief Compliance Officer & Regulatory Data Privacy Scientist|Regulatory Counsel & Data Privacy Science Terminal|Formal DPA & CPPA Filing Opinions/i,
    /Binding CCPA § 1798\.105 Deletion Demand/i,
  ]) {
    assert.doesNotMatch(claimSurfaces, claim, 'Unsupported claim remains in a visible surface: ' + String(claim));
  }
});

test('UI distinguishes legal duties, technical definitions, and unverified implementation', () => {
  assert.match(ui, /GDPR Articles 17, 25 & 35/);
  assert.match(ui, /Pure ε-Differential Privacy/);
  assert.match(ui, /No general 30-day cure precondition/);
  assert.match(ui, /Very small risk — expert-specific/);
  assert.match(ui, /Actual model not reported by backend — NOT VERIFIED/);
  assert.match(ui, /Requested model:/);
});

test('assistant prompt requires primary sources and evidence-only claims', () => {
  assert.match(server, /Do not invent or infer GLORIFIER implementation facts/);
  assert.match(server, /no universal numerical identification-risk threshold/i);
  assert.match(server, /WORKING DRAFT — QUALIFIED REVIEW REQUIRED/);
  assert.match(server, /Never assume a risk class or absence of prohibited practices/);
});

test('empty provider response fails closed and cannot emit a fabricated audit memo', () => {
  assert.match(server, /provider returned no text/i);
  assert.match(server, /No analysis was generated/i);
  assert.doesNotMatch(server, /AUTONOMOUS PERSONAL DATA BROKERAGE, DIFFERENTIAL PRIVACY ENGINE/i);
  assert.doesNotMatch(server, /Annual DPIA certification under GDPR Article 35/i);
});

test('privacy demonstrations do not imply production safe harbor or runtime protection', () => {
  assert.match(privacyLab, /no automatic legal safe harbor/i);
  assert.match(privacyLab, /no production privacy-budget accounting or zero-disclosure guarantee has been verified/i);
  assert.match(privacyLab, /not sent or sold/i);
});



test('compliance endpoint is registered once to the evidence-aware handler', () => {
  const routeRegistration = "app.post('/api/ai/compliance-scientist'";
  assert.equal(server.split(routeRegistration).length - 1, 1, 'the compliance endpoint must have exactly one Express registration');
  assert.ok(server.includes("app.post('/api/ai/compliance-scientist', handleComplianceScientistRequest);"));
  assert.ok(server.includes("success: true,\n      content,"));
});

test('compliance model selection does not mislabel automatic routing as dual-provider consensus', () => {
  assert.ok(ui.includes('<option value="auto" className="bg-slate-900 text-slate-200">Automatic provider routing (requested)</option>'));
  assert.equal(ui.includes('Dual-provider consensus (requested)'), false);
  assert.equal(ui.includes('dual-consensus engine'), false);
});

test('compliance scientist roster has one authoritative value for each display field', () => {
  const start = roster.indexOf("id: 'compliance-scientist'");
  const end = roster.indexOf("id: 'arbitrator-core'", start);
  assert.notEqual(start, -1, 'compliance scientist roster entry must exist');
  assert.notEqual(end, -1, 'compliance scientist roster entry must have a boundary');
  const entry = roster.slice(start, end);
  for (const field of ['name', 'provider', 'role', 'specialization', 'badge']) {
    const count = entry.split(`${field}:`).length - 1;
    assert.equal(count, 1, `compliance scientist must declare ${field} exactly once`);
  }
  assert.ok(entry.includes("name: 'A.I. Bot Compliance Scientist'"));
});
