// Advisory preflight only. Call with complete, authenticated GitHub evidence.
// This module neither authenticates evidence nor authorizes any mutation.
const REPOSITORY = 'GLORIFIER7/GLORIFIER';
const OWNER = 'glorifier7';
const DIGITAL_ME = 'glorifier-digital-me[bot]';
const TRUSTED_REVIEWERS = new Set(['coderabbitai[bot]', 'deepsource-io[bot]', 'snyk-bot']);
const REQUIRED = ['Required CI', 'CodeQL (python, none)', 'CodeQL (javascript-typescript, none)', 'npm-security', 'Dependency Review', 'validate-and-build'];
const login = user => typeof user?.login === 'string' ? user.login.toLowerCase() : '';
const validSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const substantive = body => typeof body === 'string' && body.trim().length > 0;
// Deliberately narrower than general repository policy: examples only, no renames.
const examplePath = path => typeof path === 'string' && path.startsWith('docs/examples/') && path.endsWith('.md') && path.split('/').every(p => p && p !== '.' && p !== '..' && /^[a-zA-Z0-9._-]+$/.test(p)) && !/(auth|security|secret|credential|payment|wallet|contract|policy|governance|deploy|release|migration)/i.test(path);
export function evaluateReviewEligibility(e) {
  const result = (eligible, reason) => ({eligible,reason,approvalSubmitted:false,mode:'advisory-preflight'});
  const deny = reason => result(false,reason);
  if (!e || e.complete !== true) return deny('Incomplete evidence');
  const {pr,files,commits,reviews,inlineComments,threads,checks} = e;
  if (![files,commits,reviews,inlineComments,threads,checks].every(Array.isArray)) return deny('Incomplete inventories');
  const head = pr?.head?.sha;
  if (pr?.state !== 'open' || pr.draft !== false || pr.mergeable !== true || pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== REPOSITORY || pr.head?.repo?.full_name !== REPOSITORY || !validSha(head) || !validSha(pr.base.sha) || e.currentBase !== pr.base.sha) return deny('PR scope, mergeability or base mismatch');
  const author = login(pr.user);
  const actor = login({login:e.actor});
  const triggeringActor = login({login:e.triggeringActor});
  if (!author || !actor || !triggeringActor || [OWNER,DIGITAL_ME,actor,triggeringActor].includes(author)) return deny('Human review or author separation required');
  if (!files.length || files.length !== pr.changed_files || files.some(f=>!f || !['added','modified'].includes(f.status) || f.previous_filename || !examplePath(f.filename))) return deny('Change outside narrow documentation allowlist');
  if (!commits.length || commits.length !== pr.commits || commits.at(-1)?.sha !== head || new Set(commits.map(c=>c?.sha)).size !== commits.length) return deny('Incomplete commit provenance');
  for (const c of commits) {
    const identities = [login(c?.author),login(c?.committer)];
    if (!validSha(c?.sha) || identities.some(x=>!x || [OWNER,DIGITAL_ME,actor,triggeringActor].includes(x) || TRUSTED_REVIEWERS.has(x)) || c.commit?.verification?.verified !== true || c.commit.verification.reason !== 'valid') return deny('Unsigned or non-independent commit');
  }
  if (reviews.some(r=>!r || !login(r.user) || r.state==='CHANGES_REQUESTED')) return deny('Missing reviewer identity or outstanding change request');
  const trusted = reviews.filter(r=>TRUSTED_REVIEWERS.has(login(r.user)) && login(r.user)!==author && r.commit_id===head && ['COMMENTED','APPROVED'].includes(r.state) && substantive(r.body));
  if (!trusted.some(r=>inlineComments.some(c=>login(c?.user)===login(r.user) && c.commit_id===head && substantive(c.body)))) return deny('Missing exact-head independent review evidence');
  if (threads.some(t=>t?.isResolved!==true)) return deny('Unresolved review threads');
  if (e.combinedStatus!=='success' || !checks.length || checks.some(c=>c?.head_sha!==head || c.status!=='completed' || !['success','neutral','skipped'].includes(c.conclusion))) return deny('Checks incomplete or unsuccessful');
  for (const name of REQUIRED) {
    const matches = checks.filter(c=>c.name===name && c.app?.id===15368);
    if (!matches.length || matches.some(c=>c.conclusion!=='success')) return deny('Required GitHub Actions check missing or unsuccessful');
  }
  return result(true,'Candidate for further authenticated independent review; not an approval');
}
