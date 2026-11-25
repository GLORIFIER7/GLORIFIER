import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAdmission } from '../src/coding-admission-actions.mjs';
const repo='GLORIFIER7/GLORIFIER', sha='a'.repeat(40), owner=32674233;
const env={GITHUB_REPOSITORY:repo,GITHUB_EVENT_NAME:'issue_comment',GITHUB_REF:'refs/heads/main',GITHUB_ACTOR_ID:String(owner),GITHUB_TRIGGERING_ACTOR:'GLORIFIER7',GITHUB_SHA:sha,DIGITAL_ME_ADMISSION_ENABLED:'true',GITHUB_TOKEN:'test-only',DIGITAL_ME_ADMISSION_DATABASE_URL:'postgresql://example.invalid/db?sslmode=verify-full'};
const event={action:'created',repository:{full_name:repo},sender:{id:owner,type:'User'},issue:{number:1034,state:'open'},comment:{id:123,user:{id:owner,type:'User'},body:'/glorifier fix'}};
const evidence={schemaVersion:1,id:'github-comment-123',status:'TARGET_VERIFIED',repository:repo,intent:'fix',target:{kind:'issue',number:1034,headSha:null},requestedBy:owner,sourceSnapshotSha:sha,targetHeadVerified:false,executionAuthorized:false,paidInferenceAuthorized:false,mergeAuthorized:false,deploymentAuthorized:false,fullyVerified:false};
function setup(){const rows=new Map();let opened=0,verified=0;return {rows,get opened(){return opened},get verified(){return verified},deps:{verifyTarget:async()=>{verified++;return evidence},openStore:async()=>{opened++;return {create:async m=>{if(!rows.has(m.id))rows.set(m.id,m);return rows.get(m.id)}}},now:()=> '2026-11-25T12:00:00.000Z'}}}
test('verified command writes one blocked mission through a lazily opened store',async()=>{const f=setup();let r=await runAdmission({env,event},f.deps);assert.equal(r.status,'ADMITTED_BLOCKED');assert.equal(f.opened,1);assert.equal(f.rows.size,1);assert.equal([...f.rows.values()][0].status,'blocked');assert.equal(r.executionAuthorized,false);});
test('repeated command preserves one immutable ledger mission',async()=>{const f=setup();await runAdmission({env,event},f.deps);await runAdmission({env,event},f.deps);assert.equal(f.rows.size,1);});
test('disabled configuration does not verify or open a database',async()=>{const f=setup();assert.deepEqual(await runAdmission({env:{...env,DIGITAL_ME_ADMISSION_ENABLED:'false'},event},f.deps),{status:'DISABLED'});assert.equal(f.opened,0);assert.equal(f.verified,0);});
test('ordinary and multiline comments are ignored before database use',async()=>{const f=setup();for(const body of ['okay','/glorifier fix\n'])assert.deepEqual(await runAdmission({env,event:{...event,comment:{...event.comment,body}}},f.deps),{status:'IGNORED'});assert.equal(f.opened,0);});
test('forged actor and stale verification cannot open database',async()=>{const f=setup();await assert.rejects(runAdmission({env:{...env,GITHUB_ACTOR_ID:'9'},event},f.deps));await assert.rejects(runAdmission({env,event},{...f.deps,verifyTarget:async()=>{throw Error('stale')}}));assert.equal(f.opened,0);});
test('rejects missing or insecure dedicated connection before store use',async()=>{const f=setup();for(const url of ['', 'postgresql://example.invalid/db?sslmode=disable','postgresql://example.invalid/db','postgresql://example.invalid/db?sslmode=verify-full&sslmode=disable'])await assert.rejects(runAdmission({env:{...env,DIGITAL_ME_ADMISSION_DATABASE_URL:url},event},f.deps));assert.equal(f.opened,0);});
test('ledger failure is not reported as admitted',async()=>{const f=setup();await assert.rejects(runAdmission({env,event},{...f.deps,openStore:async()=>({create:async()=>{throw Error('offline')}})}));});
test('workflow executes admission only behind opt-in and dedicated environment',()=>{const y=readFileSync(new URL('../../.github/workflows/digital-me-coding-intake.yml',import.meta.url),'utf8');assert.match(y,/vars\.DIGITAL_ME_ADMISSION_ENABLED == 'true'/);assert.match(y,/environment: digital-me-admission/);assert.match(y,/secrets\.DIGITAL_ME_ADMISSION_DATABASE_URL/);assert.match(y,/tsx digital-me\/src\/coding-admission-actions\.mjs/);assert.doesNotMatch(y,/DIGITAL_ME_APP_PRIVATE_KEY|secrets\.DATABASE_URL/);});

test('admission failure diagnostics distinguish configuration, target, store and safe ledger error categories',async()=>{
  const f=setup();
  const cases=[
    [{...env,DIGITAL_ME_ADMISSION_DATABASE_URL:'postgresql://hidden:secret@example.invalid/db?sslmode=require'},f.deps,'ADMISSION_DSN_INVALID'],
    [env,{...f.deps,verifyTarget:async()=>{throw Error('secret target data')}},'ADMISSION_TARGET_FAILED'],
    [env,{...f.deps,openStore:async()=>{throw Error('secret module data')}},'ADMISSION_STORE_OPEN_FAILED'],
  ];
  for(const [code,expected] of [['28P01','ADMISSION_DB_AUTH_FAILED'],['42501','ADMISSION_DB_PERMISSION_DENIED'],['23514','ADMISSION_DB_CONSTRAINT_FAILED'],['CERT_HAS_EXPIRED','ADMISSION_DB_TLS_FAILED'],['ECONNREFUSED','ADMISSION_DB_NETWORK_FAILED'],... ['08000','08001','08003','08004','08006','08007','08P01','57P01','57P02','57P03','57P04','57P05'].map(code=>[code,'ADMISSION_DB_NETWORK_FAILED']),['secret arbitrary code','ADMISSION_DB_WRITE_FAILED']]){
    cases.push([env,{...f.deps,openStore:async()=>({create:async()=>{throw Object.assign(Error('secret database URL'),{code})}})},expected]);
  }
  for(const [e,deps,expected] of cases){
    await assert.rejects(runAdmission({env:e,event},deps),error=>{
      assert.equal(error.message,expected);
      assert.equal(error.cause,undefined);
      return true;
    });
  }
});
