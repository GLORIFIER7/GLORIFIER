import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {withDispatcherApp} from '../src/dispatcher-app-transport.mjs';
const pem=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
const root='/repos/GLORIFIER7/GLORIFIER',permissions={contents:'write',pull_requests:'write'};
function fixture(changes={}){
 const calls=[];
 const fetcher=async(url,options)=>{const path=url.pathname+url.search;calls.push({path,method:options.method,body:options.body?JSON.parse(options.body):undefined});
   if(path===root+'/installation')return Response.json({app_id:5876036,account:{login:'GLORIFIER7'},repository_selection:'selected',id:17,permissions,...changes.installation});
   if(path==='/app/installations/17/access_tokens')return Response.json({token:'fake-token',repository_selection:'selected',repositories:[{full_name:'GLORIFIER7/GLORIFIER'}],permissions,...changes.token});
   if(path==='/installation/token')return new Response(null,{status:204});
   return Response.json({ok:true});
 };return {fetcher,calls};
}
test('App uses one repository, exact permissions and revokes its token',async()=>{const f=fixture();assert.deepEqual(await withDispatcherApp(pem,api=>api(root+'/commits/main'),f.fetcher),{ok:true});assert.deepEqual(f.calls[1].body,{repositories:['GLORIFIER'],permissions});assert.equal(f.calls.at(-1).method,'DELETE');});
test('wrong installation never obtains a token',async()=>{const f=fixture({installation:{app_id:1}});await assert.rejects(()=>withDispatcherApp(pem,()=>assert.fail(),f.fetcher),/DISPATCHER_APP_SCOPE_DENIED/);assert.equal(f.calls.length,1);});
test('excess or wrong repository token is revoked without using it',async()=>{for(const token of [{repositories:[{full_name:'another/repository'}]},{permissions:{...permissions,administration:'write'}}]){const f=fixture({token});await assert.rejects(()=>withDispatcherApp(pem,()=>assert.fail(),f.fetcher),/DISPATCHER_APP_SCOPE_DENIED/);assert.equal(f.calls.length,3);assert.equal(f.calls.at(-1).path,'/installation/token');}});
test('transport rejects arbitrary mutations and revokes token',async()=>{const f=fixture();await assert.rejects(()=>withDispatcherApp(pem,api=>api(root+'/pulls/1/merge','PUT',{}),f.fetcher),/DISPATCHER_APP_SCOPE_DENIED/);assert.ok(!f.calls.some(c=>c.path.endsWith('/merge')));assert.equal(f.calls.at(-1).path,'/installation/token');});
