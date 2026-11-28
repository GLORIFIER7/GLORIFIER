import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReceiptPublisher} from '../src/dispatcher-receipt-publisher.mjs';
import {recipePaths} from '../src/dispatcher-receipt-recipe.mjs';
const base='a'.repeat(40), digest='b'.repeat(64), missionId='mission-coding-'+'c'.repeat(64);
const fence={missionId,base,digest,recipeId:'dispatcher-receipt-limit'};
const candidate={...fence,status:'candidate-created',baselinePassed:true,redReproduced:true,greenPassed:true,changes:recipePaths.map(path=>({path,before:'d'.repeat(40),after:'e'.repeat(40),contents:Buffer.from('unexpected').toString('base64')}))};
test('malformed candidate is denied before API access',async()=>{
  for(const changed of [{...candidate,recipeId:'arbitrary'},{...candidate,digest:'0'.repeat(64)},{...candidate,greenPassed:false},{...candidate,changes:[]}]){
    let calls=0;const publish=createReceiptPublisher({api:async()=>{calls++;},assertFence:async()=>true});
    await assert.rejects(()=>publish(changed,fence),/SIGNED_RECEIPT_PUBLICATION_DENIED/);assert.equal(calls,0);
  }
});
test('unreviewed source bytes cannot produce a signed repair even with a matching claimed blob',async()=>{
  let writes=0;const publish=createReceiptPublisher({api:async(path,method='GET')=>{if(method!=='GET')writes++;const file=candidate.changes.find(change=>path.includes(change.path));return {type:'file',path:file.path,sha:file.before,encoding:'base64',content:Buffer.from('tampered').toString('base64')};},assertFence:async()=>true});
  await assert.rejects(()=>publish(candidate,fence),/SIGNED_RECEIPT_PUBLICATION_DENIED/);assert.equal(writes,0);
});

for (const variable of ['file','change']) {
  test(`explicit null guard for receipt ${variable}`,async()=>{
    let calls=0;
    const publish=createReceiptPublisher({api:async()=>{calls++;return null;},assertFence:async()=>assert.fail('must not publish')});
    const input=variable==='change'?{...candidate,changes:[null,...candidate.changes.slice(1)]}:candidate;
    await assert.rejects(()=>publish(input,fence),/SIGNED_RECEIPT_PUBLICATION_DENIED/);
    assert.equal(calls,variable==='change'?0:1);
    const source=readFileSync(new URL('../src/dispatcher-receipt-publisher.mjs',import.meta.url),'utf8');
    assert.ok(source.includes(`if(!${variable})throw Error('SIGNED_RECEIPT_PUBLICATION_DENIED');`));
  });
}
