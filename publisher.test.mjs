import test from 'node:test';
import assert from 'node:assert/strict';
import {publish, BASE, REPO, FILES} from './publish.mjs';
const SHA='a'.repeat(40), BRANCH='digital-me/coding-target-v3';
function mock({base=BASE,signer='glorifier-digital-me[bot]',existing=false,tampered=false}={}) {
 const writes=[];
 const fetcher=async (url,opts)=>{
  const p=new URL(url).pathname, method=opts.method, body=opts.body&&JSON.parse(opts.body);
  if(method==='POST')writes.push({p,body});
  let data,status=200;
  if(p==='/app')data={id:5876036,slug:'glorifier-digital-me'};
  else if(p===`/repos/${REPO}/installation`)data={id:12,app_id:5876036,account:{login:'GLORIFIER7'},repository_selection:'selected',permissions:{contents:'write',pull_requests:'write',workflows:'write'}};
  else if(p==='/app/installations/12/access_tokens')data={token:'test-only',permissions:{contents:'write',pull_requests:'write',workflows:'write'}};
  else if(p===`/repos/${REPO}/commits/main`)data={sha:base,commit:{verification:{verified:true,reason:'valid'}}};
  else if(p.startsWith(`/repos/${REPO}/contents/`)){const ref=new URL(url).searchParams.get('ref');const path=p.split('/contents/')[1];if(ref===SHA){data={type:'file',encoding:'base64',content:Buffer.from(tampered?'tampered':FILES[path]).toString('base64')};}else{status=existing?200:404;data={};}}
  else if(p===`/repos/${REPO}/git/refs`)data={ref:`refs/heads/${BRANCH}`,object:{sha:BASE}};
  else if(p==='/graphql')data={data:{createCommitOnBranch:{commit:{oid:SHA}}}};
  else if(p===`/repos/${REPO}/commits/${SHA}`)data={sha:SHA,author:{login:signer},commit:{verification:{verified:true,reason:'valid'}}};
  else if(p===`/repos/${REPO}/pulls`)data={number:1234,draft:true,head:{sha:SHA},user:{login:signer},html_url:`https://github.com/${REPO}/pull/1234`};
  else throw Error('unexpected path '+p);
  return new Response(JSON.stringify(data),{status});
 };return {fetcher,writes};
}
test('dry run makes no network request',async()=>{assert.equal((await publish({fetcher:()=>{throw Error('network');}})).status,'DRY_RUN');});
test('publishes only fixed files and draft via scoped App',async()=>{const m=mock();const r=await publish({confirm:true,jwt:'test',fetcher:m.fetcher});assert.equal(r.status,'DRAFT_CREATED');const q=m.writes.find(x=>x.p==='/graphql').body.variables.input;assert.equal(q.expectedHeadOid,BASE);assert.deepEqual(q.fileChanges.additions.map(x=>x.path),Object.keys(FILES));assert.equal(m.writes.at(-1).body.draft,true);});
test('stale base refuses branch creation',async()=>{const m=mock({base:SHA});await assert.rejects(publish({confirm:true,jwt:'test',fetcher:m.fetcher}),/base/);assert.ok(!m.writes.some(x=>x.p.endsWith('/git/refs')));});
test('existing file refuses branch creation',async()=>{const m=mock({existing:true});await assert.rejects(publish({confirm:true,jwt:'test',fetcher:m.fetcher}),/exists/);assert.ok(!m.writes.some(x=>x.p.endsWith('/git/refs')));});
test('wrong signer refuses PR',async()=>{const m=mock({signer:'GLORIFIER7'});await assert.rejects(publish({confirm:true,jwt:'test',fetcher:m.fetcher}),/signer/);assert.ok(!m.writes.some(x=>x.p.endsWith('/pulls')));});

test('signed commit with mismatched file content refuses PR',async()=>{const m=mock({tampered:true});await assert.rejects(publish({confirm:true,jwt:'test',fetcher:m.fetcher}),/content/);assert.ok(!m.writes.some(x=>x.p.endsWith('/pulls')));});
