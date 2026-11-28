import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const recipeId = 'dispatcher-receipt-limit';
export const recipePaths = Object.freeze(['digital-me/src/mission-dispatcher.mjs','digital-me/test/dispatcher-provenance.test.mjs']);
const originalBlobs = ['ebf0ec6a6ef3f56d4fc04e046af723c1aa32148f','8a673e93fadb037c0733a1164d3a1fc2eb1485b7'];
const repairedBlobs = ['95cc9c89bf26641ac278a64dd53e3717268a0175','17e8f4fcdcbb6ff70e7e7bb4532853ebc83f6adb'];
const originalHashes = ['85a4612df1807af39ea68dd838cab4c55f12ca94a1cfa374d6bd52cb0dab4a82','86bc52d2e2e7db8c265944a6cb23157e832ff354e0a76af102ed3995f2d4510b'];
const repairedHashes = ['32124540b341fe98655b7c461a516313103ed635a65a1e87f2e3729a065582cb','f963f495695ee739e3797f3d69eaccdcb98c0cec8f1d4fe52f2ed8261895de9b'];
const regression = "test('each retry transition preserves only the newest five receipts',async()=>{\n  const f=fixture();\n  const row=await f.deps.store.get(id);\n  const prior=Array.from({length:5},(_,i)=>({outcome:`prior-${i}`}));\n  await f.deps.store.save({...row,dispatcher:{phase:'retryable',attempts:1,provenance:prior}},row.version);\n  let claim;\n  f.deps.prepare=async()=>{claim=f.row().dispatcher.provenance;throw Error('candidate rejected');};\n  assert.equal(await dispatchMission(id,f.deps).then(r=>r.status),'CANDIDATE_REJECTED');\n  assert.deepEqual(claim.map(e=>e.outcome),['prior-1','prior-2','prior-3','prior-4','CLAIMED']);\n  assert.deepEqual(f.row().dispatcher.provenance.map(e=>e.outcome),['prior-2','prior-3','prior-4','CLAIMED','CANDIDATE_REJECTED']);\n});\n";
const sha256 = x=>createHash('sha256').update(x).digest('hex');
// Git object IDs are repository identifiers, not security digests. SHA-256 above
// remains mandatory for content integrity; delegate Git-format hashing to Git.
const blob = x=>execFileSync('/usr/bin/git',['hash-object','--stdin'],{
  input:x,env:{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:10000,
}).toString('utf8').trim();
const matches = (files,hashes,blobs)=>files.every((f,i)=>sha256(f)===hashes[i]&&blob(f)===blobs[i]);
const git = (cwd,args)=>execFileSync('/usr/bin/git',args,{cwd,env:{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:10000});
export function repairStatus(files){
  if(!Array.isArray(files)||files.length!==2||!files.every(file=>Buffer.isBuffer(file)))throw Error('REPAIR_FILES_INVALID');
  if(matches(files,repairedHashes,repairedBlobs))return 'already-applied';
  if(matches(files,originalHashes,originalBlobs))return 'repair-required';
  throw Error('REPAIR_RULE_DENIED');
}
export function deriveRepair(files){
  if(repairStatus(files)!=='repair-required')throw Error('REPAIR_ALREADY_APPLIED');
  const src=files[0].toString('utf8');
  if(src.split('previous.slice(-5)').length!==2)throw Error('REPAIR_ANCHOR_CHANGED');
  const repaired=[Buffer.from(src.replace('previous.slice(-5)','previous.slice(-4)')),Buffer.concat([files[1],Buffer.from(regression)])];
  if(!matches(repaired,repairedHashes,repairedBlobs))throw Error('REPAIR_OUTPUT_CHANGED');
  const changes=recipePaths.map((path,i)=>({path,before:originalBlobs[i],after:repairedBlobs[i],contents:repaired[i].toString('base64')}));
  return {changes,digest:sha256(JSON.stringify(changes))};
}
export function readRepairFiles(cwd,sourceSha){
  if(!/^[a-f0-9]{40}$/.test(sourceSha)||git(cwd,['rev-parse','HEAD']).toString().trim()!==sourceSha)throw Error('SOURCE_CHANGED');
  return recipePaths.map(path=>{
    const match=/^100644 blob ([a-f0-9]{40})\t/.exec(git(cwd,['ls-tree',sourceSha,'--',path]).toString());
    const file=join(cwd,path);
    if(!match||!lstatSync(file).isFile())throw Error('SOURCE_FILE_CHANGED');
    const bytes=readFileSync(file);
    if(!bytes.equals(git(cwd,['cat-file','blob',match[1]])))throw Error('SOURCE_FILE_CHANGED');
    return bytes;
  });
}
function runTests(cwd){
  return new Promise((resolve,reject)=>execFile(process.execPath,['--test','--test-reporter=tap',recipePaths[1]],{cwd,env:{CI:'true'},encoding:'utf8',timeout:90000,maxBuffer:1048576},(error,stdout)=>{
    if(error&&(error.killed||error.signal||typeof error.code!=='number'))return reject(Error('REPAIR_TEST_PROCESS_FAILED'));
    resolve({status:error?.code??0,stdout});
  }));
}
export async function verifyCandidate(cwd,sourceSha){
  const files=readRepairFiles(cwd,sourceSha),state=repairStatus(files);
  if((await runTests(cwd)).status!==0)throw Error('BASELINE_TESTS_FAILED');
  if(state==='already-applied')return {outcome:'already-applied'};
  const manifest=deriveRepair(files);
  const write=(i,b)=>writeFileSync(join(cwd,recipePaths[i]),b);
  try{
    write(1,Buffer.from(manifest.changes[1].contents,'base64'));
    const red=await runTests(cwd);
    if(red.status!==1||!/^# fail 1$/m.test(red.stdout)||!/^not ok \d+ - each retry transition preserves only the newest five receipts/m.test(red.stdout)||!red.stdout.includes('prior-0'))throw Error('EXPECTED_REGRESSION_NOT_REPRODUCED');
    write(0,Buffer.from(manifest.changes[0].contents,'base64'));
    if((await runTests(cwd)).status!==0)throw Error('REPAIRED_TESTS_FAILED');
    git(cwd,['diff','--check','--',...recipePaths]);
    if(repairStatus(recipePaths.map(p=>readFileSync(join(cwd,p))))!=='already-applied')throw Error('CANDIDATE_BYTES_CHANGED');
    return {outcome:'candidate-created',candidateDigest:manifest.digest};
  }finally{files.forEach((bytes,i)=>write(i,bytes));}
}
