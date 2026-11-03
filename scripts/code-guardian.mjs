#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createPrivateTempDir } from './private-temp-dir.mjs';

const run = (cmd, args) => {
  try { return { ok: true, output: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }) }; }
  catch (e) { return { ok: false, output: `${e.stdout || ''}\n${e.stderr || ''}`.trim() }; }
};
const check = () => {
  const lint = run('npm', ['run','lint']);
  const build = lint.ok ? run('npm', ['run','build']) : { ok:false, output:'Skipped build because lint failed.' };
  return { lint, build, ok: lint.ok && build.ok };
};
const initial = check();
if (initial.ok) process.exit(0);

const provider = process.env.GUARDIAN_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : 'none');
if (provider === 'none') {
  console.error('Checks failed and no Guardian AI key is configured.');
  process.exit(2);
}
const protectedPaths = ['.github/workflows/', '.env', '.env.', 'firebase-applet-config.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const user = `Repository: ${process.env.GITHUB_REPOSITORY || 'GLORIFIER7/glorifier-artificial-intelligence'}
Diagnostics:
LINT:
${initial.lint.output.slice(-12000)}
BUILD:
${initial.build.output.slice(-12000)}`;
const system = `You are Glorifier AI Code Guardian. Repair this TypeScript/Vite/Express app.
Return ONLY a unified diff beginning with "diff --git " that git apply can consume.
Make the smallest safe repair. Do not change authentication, secrets, deployment credentials, or database credentials. Do not add dependencies or modify lock files. Do not delete source files unless the diagnostics prove deletion is required. Never write credentials into files.`;
async function askOpenAI() {
  const r = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
    body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4o-mini',temperature:0,messages:[{role:'system',content:system},{role:'user',content:user}]})
  });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || '';
}
async function askGemini() {
  const model=process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{temperature:0}})
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  return (await r.json()).candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
}
let patch = (provider === 'gemini' ? await askGemini() : await askOpenAI()).trim();
patch = patch.replace(/^\`\`\`(?:diff)?\s*/i,'').replace(/\s*\`\`\`$/i,'').trim();
if (!patch.startsWith('diff --git ')) throw new Error('Guardian did not return a valid unified diff.');
const changedPaths = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].flatMap(m => [m[1], m[2]]);
if (changedPaths.some(path => protectedPaths.some(rule => rule.endsWith('/') ? path.startsWith(rule) : path === rule))) throw new Error('Safety policy rejected a protected-file change.');
if (changedPaths.length > 12) throw new Error('Safety policy rejected an overly broad repair.');
const patchDirectory = createPrivateTempDir('glorifier-guardian');
try {
  const patchPath = path.join(patchDirectory, 'guardian.patch');
  await writeFile(patchPath, patch, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const applied = run('git', ['apply', '--whitespace=fix', '--recount', patchPath]);
  if (!applied.ok) throw new Error('Patch rejected: ' + applied.output);

  const after = check();
  if (!after.ok) {
    run('git', ['reset', '--hard', 'HEAD']);
    throw new Error('Repair failed verification. Changes reverted.');
  }
} finally {
  fs.rmSync(patchDirectory, { recursive: true, force: true });
}
console.log('GLORIFIER_GUARDIAN_REPAIRED');
