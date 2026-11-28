import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipePaths, repairStatus, deriveRepair, readRepairFiles, verifyCandidate } from '../src/dispatcher-receipt-recipe.mjs';
const GIT_EXECUTABLE = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git';
const gitEnv = {GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform === 'win32' ? 'NUL' : '/dev/null'};
const companionTests = ['digital-me/test/mission-dispatcher.test.mjs', 'digital-me/test/mission-dispatcher-verification.test.mjs'];
const source = fileURLToPath(new URL('../../', import.meta.url));
const files = () => recipePaths.map(p=>readFileSync(join(source,p)));
function fixture(t, content, companionOverride){
  const root=mkdtempSync(join(tmpdir(),'digital-me-receipt-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'digital-me/src'),{recursive:true});
  mkdirSync(join(root,'digital-me/test'),{recursive:true});
  recipePaths.forEach((p,i)=>writeFileSync(join(root,p),content[i]));
  companionTests.forEach(path=>writeFileSync(join(root,path),readFileSync(join(source,path))));
  if(companionOverride!==undefined)writeFileSync(join(root,companionTests[0]),companionOverride);
  const git=(...args)=>execFileSync(GIT_EXECUTABLE,args,{cwd:root,env:gitEnv}).toString().trim();
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

test('companion dispatcher failures deny baseline proof',async t=>{
  const original=files();const f=fixture(t,original,"import test from 'node:test';\ntest('companion regression',()=>{throw Error('fixture failure');});\n");
  await assert.rejects(()=>verifyCandidate(f.root,f.base),/BASELINE_TESTS_FAILED/);
  recipePaths.forEach((path,i)=>assert.deepEqual(readFileSync(join(f.root,path)),original[i]));
});

for(const path of companionTests){
  test(`modified companion suite is denied: ${path}`,async t=>{
    const original=files();const f=fixture(t,original);
    writeFileSync(join(f.root,path),"import test from 'node:test';\ntest('passing stub',()=>{});\n");
    assert.throws(()=>readRepairFiles(f.root,f.base),/SOURCE_FILE_CHANGED/);
    await assert.rejects(()=>verifyCandidate(f.root,f.base),/SOURCE_FILE_CHANGED/);
    recipePaths.forEach((p,i)=>assert.deepEqual(readFileSync(join(f.root,p)),original[i]));
  });
}
test('companion mutation during baseline invalidates proof',async t=>{
  const original=files();
  const mutator="import test from 'node:test';\nimport {writeFileSync} from 'node:fs';\ntest('mutate companion',()=>writeFileSync(new URL('./mission-dispatcher-verification.test.mjs',import.meta.url),'// changed during proof\\n'));\n";
  const f=fixture(t,original,mutator);
  await assert.rejects(()=>verifyCandidate(f.root,f.base),/SOURCE_FILE_CHANGED/);
  recipePaths.forEach((p,i)=>assert.deepEqual(readFileSync(join(f.root,p)),original[i]));
});
