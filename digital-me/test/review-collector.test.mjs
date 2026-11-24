import test from 'node:test';
import assert from 'node:assert/strict';
import { collectReviewEvidence } from '../src/review-collector.mjs';
const base='b'.repeat(40), head='a'.repeat(40), repo='GLORIFIER7/GLORIFIER';
function fake({move=false, behind=false, fail=false, paginate=false}={}) {
  let reads=0;
  return async (url, init) => {
    const u=new URL(url); assert.equal(u.origin,'https://api.github.com');
    assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer fixture-token');
    const p=u.pathname;
    if(fail && p.endsWith('/reviews')) return new Response('{}',{status:403});
    let result, headers={};
    if(p==='/graphql') { assert.equal(init.method,'POST'); assert.match(JSON.parse(init.body).query,/^query /); result={data:{repository:{pullRequest:{headRefOid:head,baseRefOid:base,reviewThreads:{nodes:[{isResolved:true}],pageInfo:{hasNextPage:false,endCursor:null}}}}}}; }
    else {assert.equal(init.method,'GET');
      if(p.endsWith('/pulls/42')) { reads++;result={number:42,state:'open',draft:false,mergeable:true,base:{ref:'main',sha:base,repo:{full_name:repo}},head:{sha:move&&reads>1?'c'.repeat(40):head,repo:{full_name:repo}},user:{login:'contributor'},changed_files:1,commits:1}; }
      else if(p.endsWith('/commits/main')) result={sha:base};
      else if(p.includes('/compare/')) result={status:behind?'diverged':'ahead',behind_by:behind?1:0};
      else if(p.endsWith('/files')) result=[{filename:'docs/examples/example.md'}];
      else if(p.endsWith('/reviews')) { result=[{id:Number(u.searchParams.get('page'))}];if(paginate&&u.searchParams.get('page')==='1')headers.link='<https://example.invalid/ignored>; rel="next"'; }
      else if(p.endsWith('/comments')) result=[];
      else if(p.endsWith('/pulls/42/commits')) result=[{sha:head}];
      else if(p.endsWith('/check-runs')) result={total_count:1,check_runs:[{id:1}]};
      else if(p.endsWith('/status')) result={state:'success'};
      else throw Error('Unexpected path '+p);
    }
    return new Response(JSON.stringify(result),{headers});
  };
}
const opts={token:'fixture-token',number:42,actor:'GLORIFIER7',triggeringActor:'GLORIFIER7'};
test('collects scoped read-only evidence and binds exact head and base',async()=>{const e=await collectReviewEvidence(opts,fake());assert.equal(e.complete,true);assert.equal(e.pr.head.sha,head);assert.equal(e.currentBase,base);assert.equal(e.threads[0].isResolved,true);});
test('rejects head movement during evidence collection',async()=>assert.rejects(collectReviewEvidence(opts,fake({move:true})),/changed/));
test('rejects branch behind protected main',async()=>assert.rejects(collectReviewEvidence(opts,fake({behind:true})),/behind/));
test('API denial cannot become complete evidence',async()=>assert.rejects(collectReviewEvidence(opts,fake({fail:true})),/HTTP 403/));
test('pagination uses fixed GitHub endpoint rather than arbitrary link URL',async()=>{const e=await collectReviewEvidence(opts,fake({paginate:true}));assert.deepEqual(e.reviews.map(r=>r.id),[1,2]);});
test('invalid PR number fails before network',async()=>assert.rejects(collectReviewEvidence({...opts,number:'42/../../'},()=>{throw Error('network called')}),/PR number/));
