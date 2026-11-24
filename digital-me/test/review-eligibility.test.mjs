import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReviewEligibility } from '../src/review-eligibility.mjs';
const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const required = ['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'];
function evidence() {
  return {
    pr: {state:'open',draft:false,mergeable:true,base:{ref:'main',sha:base,repo:{full_name:'GLORIFIER7/GLORIFIER'}},head:{sha,repo:{full_name:'GLORIFIER7/GLORIFIER'}},user:{login:'example-publisher[bot]'},changed_files:1,commits:1},
    currentBase:base,triggeringActor:'GLORIFIER7',actor:'GLORIFIER7',complete:true,
    files:[{filename:'docs/examples/example.md',status:'modified'}],
    commits:[{sha,author:{login:'example-publisher[bot]'},committer:{login:'example-publisher[bot]'},commit:{verification:{verified:true,reason:'valid'}}}],
    reviews:[{user:{login:'coderabbitai[bot]'},commit_id:sha,state:'COMMENTED',body:'Reviewed changed example and checked referenced names.'}],
    inlineComments:[{user:{login:'coderabbitai[bot]'},commit_id:sha,body:'Example name checked.'}],
    threads:[{isResolved:true}], checks:required.map(name=>({name,head_sha:sha,status:'completed',conclusion:'success',app:{id:15368}})), combinedStatus:'success',
  };
}
function deny(change) {const e=evidence();change(e);assert.equal(evaluateReviewEligibility(e).eligible,false);}
test('eligible documentation change yields a preflight result, not an approval',()=>{const r=evaluateReviewEligibility(evidence());assert.equal(r.eligible,true);assert.equal(r.approvalSubmitted,false);});
test('owner PR requires human review',()=>deny(e=>e.pr.user.login='GLORIFIER7'));
test('Digital Me authored PR cannot self-approve',()=>deny(e=>e.pr.user.login='glorifier-digital-me[bot]'));
test('Digital Me contribution blocks approval even if PR author differs',()=>deny(e=>e.commits[0].author.login='glorifier-digital-me[bot]'));
test('unknown commit identity fails closed',()=>deny(e=>e.commits[0].author=null));
test('unsigned commits blocked',()=>deny(e=>e.commits[0].commit.verification.verified=false));
test('stale base blocked',()=>deny(e=>e.currentBase='c'.repeat(40)));
test('incomplete evidence blocked',()=>deny(e=>e.complete=false));
test('incomplete file listing blocked',()=>deny(e=>e.pr.changed_files=2));
test('governance documentation blocked outside narrow example allowlist',()=>deny(e=>e.files[0].filename='docs/GEAS-ARCHITECTURE-CONTROLS.md'));
test('rename from sensitive path blocked',()=>deny(e=>Object.assign(e.files[0],{status:'renamed',previous_filename:'.github/workflows/security.yml'})));
test('stale review blocked',()=>deny(e=>e.reviews[0].commit_id=base));
test('untrusted reviewer blocked',()=>deny(e=>e.reviews[0].user.login='other[bot]'));
test('missing inline independent evidence blocked',()=>deny(e=>e.inlineComments=[]));
test('change request blocked',()=>deny(e=>e.reviews.push({state:'CHANGES_REQUESTED',user:{login:'human'}})));
test('unresolved thread blocked',()=>deny(e=>e.threads[0].isResolved=false));
test('missing required CI blocked',()=>deny(e=>e.checks.pop()));
test('spoofed required check integration blocked',()=>deny(e=>e.checks[0].app.id=1));
test('failed external build blocked',()=>deny(e=>e.checks.push({name:'Workers Builds: glorifier',head_sha:sha,status:'completed',conclusion:'failure'})));
test('missing evidence never throws or authorizes',()=>assert.equal(evaluateReviewEligibility(null).eligible,false));
test('owner commit participation cannot be hidden by a different PR author',()=>deny(e=>e.commits[0].author.login='GLORIFIER7'));
test('triggering actor commit participation requires human review',()=>deny(e=>{e.triggeringActor='other-operator';e.commits[0].committer.login='other-operator';}));
