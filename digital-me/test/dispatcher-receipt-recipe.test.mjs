import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipePaths, repairStatus, deriveRepair, verifyCandidate } from '../src/dispatcher-receipt-recipe.mjs';
const source = fileURLToPath(new URL('../../', import.meta.url));
const files = () => recipePaths.map(p=>readFileSync(join(source,p)));
function fixture(t, content){
  const root=mkdtempSync(join(tmpdir(),'digital-me-receipt-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'digital-me/src'),{recursive:true});
  mkdirSync(join(root,'digital-me/test'),{recursive:true});
  recipePaths.forEach((p,i)=>writeFileSync(join(root,p),content[i]));
  const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:root,env:{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).toString().trim();
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','local test fixture');
  return {root,base:git('rev-parse','HEAD')};
}
test('receipt recipe denies drift and does not permit a second repair',()=>{
  const original=files();const state=repairStatus(original);
  assert.throws(()=>repairStatus([Buffer.concat([original[0],Buffer.from('\n')]),original[1]]),/REPAIR_RULE_DENIED/);
  const fixed=state==='already-applied'?original:deriveRepair(original).changes.map(c=>Buffer.from(c.contents,'base64'));
  assert.equal(repairStatus(fixed),'already-applied');
  assert.throws(()=>deriveRepair(fixed),/REPAIR_ALREADY_APPLIED/);
});
test('receipt recipe verifies the known baseline, red and green without changing checkout bytes',async t=>{
  const original=files();const f=fixture(t,original);const state=repairStatus(original);
  const proof=await verifyCandidate(f.root,f.base);
  if(state==='already-applied')assert.deepEqual(proof,{outcome:'already-applied'});
  else assert.deepEqual(proof,{outcome:'candidate-created',candidateDigest:deriveRepair(original).digest});
  recipePaths.forEach((p,i)=>assert.deepEqual(readFileSync(join(f.root,p)),original[i]));
  await assert.rejects(()=>verifyCandidate(f.root,'0'.repeat(40)),/SOURCE_CHANGED/);
});
