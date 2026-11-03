#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { applyUnifiedDiff } from './apply-unified-diff.mjs';

const run = (cmd, args = [], options = {}) => {
  try { return { ok: true, output: execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...options }) }; }
  catch (error) { return { ok: false, output: `${error.stdout || ''}\n${error.stderr || error.message}`.trim() }; }
};
const result = (cmd, args = []) => run(cmd, args).output;

function modelCapabilityScore(model = '') {
  const value = model.toLowerCase();
  if (/gpt-5/.test(value)) return 100;
  if (/o[3-9]/.test(value)) return 98;
  if (/claude.*opus/.test(value)) return 97;
  if (/gemini.*pro|gemini.*ultra/.test(value)) return 96;
  if (/llama.*405b|405b/.test(value)) return 95;
  if (/gpt-4\.1/.test(value)) return 92;
  if (/70b/.test(value)) return 85;
  if (/gemini.*flash/.test(value)) return 82;
  return 50;
}

function availableProviders() {
  const candidates = [];
  if (process.env.OPENAI_API_KEY) candidates.push({ id: 'openai', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', score: modelCapabilityScore(process.env.OPENAI_MODEL || 'gpt-4o-mini') });
  if (process.env.GEMINI_API_KEY) candidates.push({ id: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', score: modelCapabilityScore(process.env.GEMINI_MODEL || 'gemini-3.8-flash') });
  if (process.env.META_API_KEY) candidates.push({ id: 'meta', model: process.env.META_MODEL || 'meta-default', score: modelCapabilityScore(process.env.META_MODEL || 'meta-default') });
  return candidates.sort((a,b) => b.score - a.score);
}

const protectedPaths = ['.github/workflows/**','.env','.env.*','firebase-applet-config.json','package-lock.json','pnpm-lock.yaml','yarn.lock'];
const files = result('git', ['ls-files']).split('\n').filter(Boolean).filter((file) => /\.(ts|tsx|js|mjs|json|css|yml|yaml|md)$/.test(file)).filter((file) => !file.startsWith('node_modules/')).slice(0, 180);
const snapshot = files.map((file) => { try { return `===== ${file} =====\n${fs.readFileSync(file,'utf8').slice(0,12000)}`; } catch { return ''; } }).filter(Boolean).join('\n\n').slice(0,180000);

const system = `You are the autonomous Glorifier AI Continuous Improvement Agent.
Your job is to make one meaningful, safe improvement to the repository when one is justified.
Return ONLY a unified diff beginning with "diff --git " and nothing else.
Prioritize reliability, correctness, security hardening, maintainability, UX defects, performance, tests, and observability.
Do not invent external facts or credentials.
Do not modify authentication providers, secrets, API keys, database credentials, deployment credentials, lock files, or GitHub workflow files.
Do not add dependencies.
Do not make destructive rewrites or remove source files.
Keep the patch small and focused.
If no worthwhile improvement can be made, return exactly: NO_CHANGE.`;

const user = `Repository: ${process.env.GITHUB_REPOSITORY || 'GLORIFIER7/glorifier-artificial-intelligence'}
Current branch: ${result('git', ['branch', '--show-current']).trim()}
Recent commits:
${result('git', ['log','-8','--oneline'])}
Working tree:
${result('git', ['status','--short'])}

Repository snapshot:
${snapshot}`;

async function askOpenAI() {
  const response = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4o-mini',temperature:0,messages:[{role:'system',content:system},{role:'user',content:user}]}) });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
  return (await response.json()).choices?.[0]?.message?.content || '';
}
async function askGemini() {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{temperature:0}}) });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
  return (await response.json()).candidates?.[0]?.content?.parts?.map((part)=>part.text||'').join('') || '';
}
async function askMeta() {
  const baseUrl=(process.env.META_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/,'');
  const response=await fetch(`${baseUrl}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.META_API_KEY}`},body:JSON.stringify({model:process.env.META_MODEL || 'meta-default',temperature:0,messages:[{role:'system',content:system},{role:'user',content:user}]})});
  if (!response.ok) throw new Error(`Meta HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
  return (await response.json()).choices?.[0]?.message?.content || '';
}

const candidates=availableProviders();
const executive=candidates[0] || {id:'none',model:'',score:0};
if (executive.id==='none') { console.log('GLORIFIER_AI_DEGRADED_MODE reason=no_provider_configured action=skip_improvement'); process.exit(0); }

console.log(`GLORIFIER_AI_CEO provider=${executive.id} model=${executive.model} capabilityScore=${executive.score}`);

const askById = { openai: askOpenAI, gemini: askGemini, meta: askMeta };
let patch='';
const errors=[];
for (const candidate of candidates) {
  try {
    patch=(await askById[candidate.id]()).trim();
    if (patch) { console.log(`GLORIFIER_AI_PROVIDER_USED provider=${candidate.id} model=${candidate.model}`); break; }
  } catch (error) {
    errors.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`GLORIFIER_AI_PROVIDER_FAILED ${errors.at(-1)}`);
  }
}
if (!patch) {
  console.log(`GLORIFIER_AI_DEGRADED_MODE reason=all_providers_unavailable action=queue_next_cycle errors=${errors.join(' | ')}`);
  process.exit(0);
}
if (patch==='NO_CHANGE') { console.log('GLORIFIER_NO_CHANGE'); process.exit(0); }
patch=patch.replace(/^\`\`\`(?:diff)?\s*/i,'').replace(/\s*\`\`\`$/i,'').trim();
if (!patch.startsWith('diff --git ')) throw new Error('Agent did not return a valid unified diff.');

const changedPaths=[...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].flatMap((m)=>[m[1],m[2]]);
if(changedPaths.some((path)=>protectedPaths.some((rule)=>rule.endsWith('/**')?path.startsWith(rule.slice(0,-3)):path===rule))) throw new Error('Safety policy rejected a protected-file change.');
if(changedPaths.length>12) throw new Error('Safety policy rejected an overly broad patch.');

const applied = applyUnifiedDiff(patch, run);
if (!applied.ok) throw new Error('Patch rejected: ' + applied.output);

const lint=run('npm',['run','lint']);
const build=lint.ok?run('npm',['run','build']):{ok:false,output:'Skipped build because lint failed.'};
if(!lint.ok||!build.ok){run('git',['reset','--hard','HEAD']);throw new Error(`Improvement failed verification. Lint: ${lint.ok}. Build: ${build.ok}.`);}
console.log('GLORIFIER_AUTONOMOUS_IMPROVEMENT_VERIFIED');
console.log(patch);
