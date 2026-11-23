import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Bot, Code2, GitBranch, Globe2, LockKeyhole, RefreshCw, ShieldCheck, Terminal } from 'lucide-react';
import {
  ENGINEERING_WORKSPACE_LINKS,
  parseGitHubPullRequests,
  parseGitHubRepository,
  type GitHubRepositoryObservation,
} from '../lib/engineering-workspace';

type Observation = {
  repository: GitHubRepositoryObservation | null;
  openPullRequests: number | null;
  checkedAt: string | null;
  error: string | null;
};
type WorkspaceProps = { onNavigateToTab: (tab: string) => void };

const ExternalTool: React.FC<{
  name: string; description: string; href: string; icon: React.ElementType; note: string;
}> = ({ name, description, href, icon: Icon, note }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    className="block rounded-lg border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
    <div className="flex items-center justify-between gap-2">
      <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
      <ArrowUpRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
    </div>
    <h3 className="mt-3 font-semibold text-slate-100">{name}</h3>
    <p className="mt-1 text-xs text-slate-300">{description}</p>
    <p className="mt-2 text-[11px] text-slate-500">{note}</p>
  </a>
);

export const EngineeringWorkspace: React.FC<WorkspaceProps> = ({ onNavigateToTab }) => {
  const [observation, setObservation] = useState<Observation>({
    repository: null, openPullRequests: null, checkedAt: null, error: null,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [repoResult, pullsResult] = await Promise.allSettled([
        fetch('https://api.github.com/repos/GLORIFIER7/GLORIFIER', {
          signal, headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store',
        }).then(async response => {
          if (!response.ok) throw new Error('Repository API unavailable');
          return parseGitHubRepository(await response.json());
        }),
        fetch('https://api.github.com/repos/GLORIFIER7/GLORIFIER/pulls?state=open&per_page=100', {
          signal, headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store',
        }).then(async response => {
          if (!response.ok) throw new Error('Pull request API unavailable');
          return parseGitHubPullRequests(await response.json());
        }),
      ]);
      if (signal?.aborted) return;
      const repository = repoResult.status === 'fulfilled' ? repoResult.value : null;
      const openPullRequests = pullsResult.status === 'fulfilled' ? pullsResult.value : null;
      setObservation({
        repository,
        openPullRequests,
        checkedAt: new Date().toISOString(),
        error: repository === null || openPullRequests === null
          ? 'Some public GitHub observations were unavailable or invalid. They remain NOT VERIFIED.'
          : null,
      });
    } catch {
      if (!signal?.aborted) setObservation({
        repository: null, openPullRequests: null, checkedAt: new Date().toISOString(),
        error: 'Live public GitHub observations are NOT VERIFIED.',
      });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className="space-y-6" aria-labelledby="engineering-workspace-title">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300">GLORIFIER ONE · Engineering workspace</div>
          <h2 id="engineering-workspace-title" className="mt-1 text-2xl font-semibold">One entry point for development tools</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            GitHub repository operations, VS Code for the Web, Kernel cloud browsers and GLORIFIER's governed AI modules.
            Tools open in their own authorized services; a link is not proof of a connected session.
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          {loading ? 'Checking public data…' : 'Refresh public data'}
        </button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />Public GitHub evidence
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Read-only GitHub API. No access token, repository write, deployment or provider session is exercised here.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><div className="text-[11px] text-slate-500">Default branch</div>
            <div className="mt-1 font-mono text-sm">{observation.repository?.defaultBranch ?? 'NOT VERIFIED'}</div></div>
          <div><div className="text-[11px] text-slate-500">Open issues + PRs (GitHub aggregate)</div>
            <div className="mt-1 font-mono text-sm">{observation.repository?.openIssuesAndPullRequests ?? 'NOT VERIFIED'}</div></div>
          <div><div className="text-[11px] text-slate-500">Open PRs (first 100 only)</div>
            <div className="mt-1 font-mono text-sm">
              {observation.openPullRequests === null ? 'NOT VERIFIED' : observation.openPullRequests === 100 ? '100+' : observation.openPullRequests}
            </div></div>
        </div>
        {observation.error && <p className="mt-3 text-xs text-amber-200">{observation.error}</p>}
        <p className="mt-3 text-[11px] text-slate-500">
          {observation.checkedAt ? 'Observed ' + new Date(observation.checkedAt).toLocaleString() + '; CI, review and signing status NOT VERIFIED here.' : 'No live observation yet.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ExternalTool name="GitHub Repository" icon={GitBranch} href={ENGINEERING_WORKSPACE_LINKS.repository}
          description="Browse code, branches, commits, issues and protected pull requests."
          note="Uses your GitHub account; no bypass of reviews or signed commits." />
        <ExternalTool name="Code Studio" icon={Code2} href={ENGINEERING_WORKSPACE_LINKS.editor}
          description="Edit the repository using GitHub's browser-based VS Code environment."
          note="github.dev offers an editor, not a cloud terminal or running server." />
        <ExternalTool name="Kernel Browser" icon={Globe2} href={ENGINEERING_WORKSPACE_LINKS.kernel}
          description="Open Kernel's cloud browser and automation dashboard."
          note="Separate sign-in and quota; no browser session is launched automatically." />
        <ExternalTool name="Pull Requests" icon={ShieldCheck} href={ENGINEERING_WORKSPACE_LINKS.pullRequests}
          description="Inspect reviews, merge conflicts and required checks."
          note="Approvals and merge rules remain enforced by GitHub." />
        <ExternalTool name="GitHub Actions" icon={Terminal} href={ENGINEERING_WORKSPACE_LINKS.actions}
          description="Open existing CI jobs, test logs, and build results."
          note="This view does not run jobs or claim CI success." />
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <Bot className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          <h3 className="mt-3 font-semibold">GLORIFIER AI Workforce</h3>
          <p className="mt-1 text-xs text-slate-300">Open existing internal AI orchestration and governed connection modules.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigateToTab('ai_ceo')}
              className="rounded-md border border-slate-700 px-3 py-2 text-xs">AI CEO</button>
            <button type="button" onClick={() => onNavigateToTab('sentinel')}
              className="rounded-md border border-slate-700 px-3 py-2 text-xs">Code Sentinel</button>
            <button type="button" onClick={() => onNavigateToTab('connections')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-2 text-xs">
              <LockKeyhole className="h-3 w-3" />Connections</button>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Internal module availability does not attest external execution.</p>
        </div>
      </div>
    </section>
  );
};
