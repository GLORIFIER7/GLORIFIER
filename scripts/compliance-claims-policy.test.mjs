import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const complianceUi = read('../src/components/ComplianceScientistBot.tsx');
const server = read('../server.ts');
const gptStudio = read('../src/components/WorkTogetherWithGptStudio.tsx');
const collaboration = read('../src/components/AiModelsCollaborationManagement.tsx');
const globalSync = read('../src/lib/global-sync.ts');
const privacyLab = read('../src/components/PrivacyTechLab.tsx');

const corpus = [
  complianceUi,
  server,
  gptStudio,
  collaboration,
  globalSync,
  privacyLab,
].join('\n');

test('compliance surfaces contain no unsupported legal, credential, or privacy guarantees', () => {
  const forbiddenClaims = [
    /Mandatory 30-day statutory cure period/i,
    /statutory 30-day cure deadlines/i,
    /30-day cure deadline/i,
    /30-day statutory window/i,
    /EU AI Act Class 1/i,
    /Class 1\\s*\\(Minimal Risk/i,
    /eu-ai-act-class-1/i,
    /zero prohibited AI practices/i,
    /contains zero prohibited AI practices/i,
    /Zero prohibited biometric categorizations/i,
    /0\\.0004/i,
    /k-anonymity\\s*\\(k\\s*[≥>=]\\s*50\\)/i,
    /CIPP\\/E|CIPP\\/US|CIPM|FIP|Ph\\.D\\. in Statistical Privacy|CIPP \\/ Privacy Ph\\.D\\./i,
    /Statutory Safe Harbor: Treated as fully non-PII|fully non-PII under GDPR Recital 26/i,
    /GDPR Article 25 Invariant/i,
    /Chief Compliance Officer & Regulatory Data Privacy Scientist|Regulatory Counsel & Data Privacy Science Terminal|Formal DPA & CPPA Filing Opinions/i,
    /draft binding erasure demands|Binding CCPA § 1798\\.105 Deletion Demand/i,
  ];

  for (const claim of forbiddenClaims) {
    assert.doesNotMatch(corpus, claim, `Unsupported claim remains in the compliance interface or assistant prompt: ${claim}`);
  }
});

test('the UI distinguishes legal duties, technical definitions, and unverified implementation', () => {
  assert.match(complianceUi, /GDPR Articles 17, 25 & 35/);
  assert.match(complianceUi, /Pure ε-Differential Privacy/);
  assert.match(complianceUi, /No general 30-day cure precondition/);
  assert.match(complianceUi, /Very small risk — expert-specific/);
  assert.match(complianceUi, /Actual model not reported by backend — NOT VERIFIED/);
  assert.match(complianceUi, /Requested model:/);
});

test('the assistant prompt prohibits invented implementation facts and legal conclusions', () => {
  assert.match(server, /Do not invent or infer GLORIFIER implementation facts/);
  assert.match(server, /No legal classification, conformity conclusion, or compliance certification/);
  assert.match(server, /no universal numerical re-identification threshold/i);
});

test('an empty model response never becomes a fabricated audit memo', () => {
  assert.match(server, /provider returned no text/i);
  assert.match(server, /No analysis was generated/i);
  assert.doesNotMatch(server, /AUTONOMOUS PERSONAL DATA BROKERAGE, DIFFERENTIAL PRIVACY ENGINE/i);
  assert.doesNotMatch(server, /Annual DPIA certification under GDPR Article 35/i);
});

test('privacy demonstrations do not imply production safe harbor or runtime protection', () => {
  assert.match(privacyLab, /no automatic legal safe harbor/i);
  assert.match(privacyLab, /no production privacy-budget accounting has been verified/i);
  assert.match(privacyLab, /not sent or sold/i);
});
