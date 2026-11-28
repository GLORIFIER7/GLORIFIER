import { createHash } from 'node:crypto';
import { deriveRepair, recipeId, recipePaths } from './dispatcher-receipt-recipe.mjs';

const repo='GLORIFIER7/GLORIFIER', root='/repos/'+repo, bot='glorifier-digital-me[bot]';
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const digest=value=>createHash('sha256').update(value).digest('hex');
const requireThat=condition=>{if(!condition)throw Error('SIGNED_RECEIPT_PUBLICATION_DENIED');};
function bytes(file,path,expected){
  requireThat(file?.type==='file'&&file.path===path&&file.sha===expected&&file.encoding==='base64'&&
    typeof file.content==='string'&&file.content.length<=700000);
  const canonical=file.content.replace(/\n/g,'');
  const buffer=Buffer.from(canonical,'base64');
  requireThat(buffer.length<=500000&&buffer.toString('base64')===canonical);
  return buffer;
}

// Only callable by a trusted, separately reviewed runtime. The existing App
// transport owns credentials; this adapter never reads environment secrets.
// The caller must independently read publication/CI evidence before recording success.
export function createReceiptPublisher({api,assertFence}={}){
  requireThat(typeof api==='function'&&typeof assertFence==='function');
  return async function publish(candidate,fence){
    try {
      const {missionId,base,digest:expected}=fence??{};
      requireThat(typeof missionId==='string'&&/^mission-coding-[a-f0-9]{64}$/.test(missionId)&&sha(base)&&
        typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&fence.recipeId===recipeId&&
        candidate?.missionId===missionId&&candidate.base===base&&candidate.recipeId===recipeId&&candidate.digest===expected&&
        candidate.status==='candidate-created'&&candidate.baselinePassed===true&&candidate.redReproduced===true&&candidate.greenPassed===true&&
        Array.isArray(candidate.changes)&&candidate.changes.length===recipePaths.length);
      // Re-derive from GitHub's exact immutable source rather than trusting the candidate.
      const source=[];
      for(const [i,path] of recipePaths.entries()){
        const change=candidate.changes[i];
        requireThat(change?.path===path&&sha(change.before)&&sha(change.after)&&change.before!==change.after);
        source.push(bytes(await api(root+'/contents/'+path+'?ref='+base),path,change.before));
      }
      const manifest=deriveRepair(source);
      requireThat(manifest.digest===expected&&JSON.stringify(manifest.changes)===JSON.stringify(candidate.changes));
      const branch='digital-me/repair-'+digest(base+missionId+expected),ref='refs/heads/'+branch;
      const history=await api(root+'/pulls?state=all&head='+encodeURIComponent('GLORIFIER7:'+branch)+'&per_page=1');
      requireThat(Array.isArray(history)&&history.length===0);
      const refs=await api(root+'/git/matching-refs/heads/'+branch);
      requireThat(Array.isArray(refs)&&!refs.some(value=>value.ref===ref));
      const guard=async()=>requireThat(await assertFence(fence)===true);
      await guard();
      const created=await api(root+'/git/refs','POST',{ref,sha:base});
      requireThat(created?.ref===ref&&created.object?.sha===base);
      await guard();
      const response=await api('/graphql','POST',{query:'mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}',variables:{input:{branch:{repositoryNameWithOwner:repo,branchName:branch},expectedHeadOid:base,message:{headline:'fix(digital-me): bound dispatcher provenance receipts'},fileChanges:{additions:manifest.changes.map(({path,contents})=>({path,contents}))}}}});
      const head=response?.data?.createCommitOnBranch?.commit?.oid;
      requireThat(sha(head)&&head!==base&&!response.errors?.length);
      const commit=await api(root+'/commits/'+head);
      requireThat(commit?.sha===head&&commit.commit?.verification?.verified===true&&commit.commit.verification.reason==='valid'&&
        commit.author?.login===bot&&commit.parents?.length===1&&commit.parents[0].sha===base&&commit.files?.length===manifest.changes.length&&
        manifest.changes.every(file=>commit.files.some(change=>change.filename===file.path&&change.status==='modified'&&change.sha===file.after)));
      for(const file of manifest.changes){
        const observed=bytes(await api(root+'/contents/'+file.path+'?ref='+head),file.path,file.after);
        requireThat(observed.equals(Buffer.from(file.contents,'base64')));
      }
      await guard();
      const pr=await api(root+'/pulls','POST',{title:'fix(digital-me): bound dispatcher provenance receipts',head:branch,base:'main',draft:true,body:`Mission: ${missionId}\nBase: ${base}\nCandidate digest: ${expected}\nIndependent review and protected CI required. No automatic merge. #471 remains open.`});
      const valid=p=>Number.isSafeInteger(p?.number)&&p.number>0&&p.state==='open'&&p.draft===true&&p.user?.login===bot&&
        p.base?.ref==='main'&&p.base?.sha===base&&p.base?.repo?.full_name===repo&&p.head?.ref===branch&&p.head?.sha===head&&p.head?.repo?.full_name===repo;
      requireThat(valid(pr)&&valid(await api(root+'/pulls/'+pr.number)));
      return {pr:pr.number,head};
    }catch{throw Error('SIGNED_RECEIPT_PUBLICATION_DENIED');}
  };
}
