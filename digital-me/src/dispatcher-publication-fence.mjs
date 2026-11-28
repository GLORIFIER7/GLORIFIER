const repository = 'GLORIFIER7/GLORIFIER';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const deny = () => { throw Error('PUBLICATION_FENCE_DENIED'); };

// Trusted runtime only: re-read the scoped ledger, GEAS and protected signed main.
// Call immediately before EACH external mutation. A failed check never grants a retry.
export function createPublicationFence({store,getAuthorization,readMain,now=Date.now}={}) {
  return async function assertFence(fence) {
    try {
      const {missionId,base,digest,recipeId,grantId,workerId,version,leaseExpiresAt} = fence ?? {};
      if (typeof missionId !== 'string' || !/^mission-coding-[a-f0-9]{64}$/.test(missionId) ||
          !sha(base) || !hash(digest) || ![recipeId,grantId,workerId].every(value=>identifier(value)) ||
          !Number.isSafeInteger(version) || version < 1 || typeof leaseExpiresAt !== 'string') deny();
      const expiry=Date.parse(leaseExpiresAt);
      const active=()=>Number.isSafeInteger(now()) && Number.isFinite(expiry) && now()<expiry;
      const owns=row=>row?.id===missionId && row.requester==='github:32674233' && row.status==='executing' &&
        row.version===version && row.leaseOwner===workerId && row.leaseExpiresAt===leaseExpiresAt &&
        row.dispatcher?.phase==='publishing' && row.dispatcher.base===base && row.dispatcher.digest===digest &&
        row.dispatcher.recipeId===recipeId && row.dispatcher.grantId===grantId;
      if (!active() || !owns(await store.get(missionId))) deny();
      const main=await readMain();
      if (main?.sha!==base || main.verified!==true || main.reason!=='valid') deny();
      const grant=await getAuthorization({repository,missionId,base});
      if (grant?.repository!==repository || grant.missionId!==missionId || grant.base!==base ||
          grant.recipeId!==recipeId || grant.grantId!==grantId || grant.revoked!==false ||
          grant.executionAuthorized!==true || grant.publicationAuthorized!==true || grant.maximumCostMicrousd!==0 ||
          typeof grant.expiresAt!=='string' || !Number.isFinite(Date.parse(grant.expiresAt))) deny();
      if (!owns(await store.get(missionId)) || !active() || Date.parse(grant.expiresAt)<=now()) deny();
      return true;
    } catch { return deny(); }
  };
}
