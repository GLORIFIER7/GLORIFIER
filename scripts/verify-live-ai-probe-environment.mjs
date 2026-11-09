import process from "node:process";
import { pathToFileURL } from "node:url";

const REQUIRED_ENVIRONMENT = "live-ai-probe";

export const evaluateLiveAiEnvironment = (environment, branchPolicyResponse) => {
  const failures = [];
  if (!environment || environment.name !== REQUIRED_ENVIRONMENT) {
    failures.push("the live-ai-probe environment does not exist");
  }

  const protectionRules = Array.isArray(environment?.protection_rules) ? environment.protection_rules : [];
  const reviewerRule = protectionRules.find((rule) => rule?.type === "required_reviewers");
  const reviewerCount = Array.isArray(reviewerRule?.reviewers) ? reviewerRule.reviewers.length : 0;

  if (reviewerCount < 1) failures.push("at least one required reviewer must be configured");
  if (reviewerRule?.prevent_self_review !== true) failures.push("self-approval must be disabled");
  if (environment?.can_admins_bypass !== false) failures.push("administrator bypass must be disabled");

  const deploymentPolicy = environment?.deployment_branch_policy;
  if (deploymentPolicy?.protected_branches !== false || deploymentPolicy?.custom_branch_policies !== true) {
    failures.push("the environment must use explicit custom branch policies");
  }

  const branchPolicies = Array.isArray(branchPolicyResponse?.branch_policies)
    ? branchPolicyResponse.branch_policies
    : [];
  const branchAllowlist = branchPolicies
    .map((policy) => policy?.name)
    .filter((name) => typeof name === "string")
    .sort();

  if (branchAllowlist.length !== 1 || branchAllowlist[0] !== "main") {
    failures.push("the only deployment branch policy must be exactly main");
  }

  return {
    ok: failures.length === 0,
    environment: REQUIRED_ENVIRONMENT,
    reviewerCount,
    preventSelfReview: reviewerRule?.prevent_self_review === true,
    adminBypassDisabled: environment?.can_admins_bypass === false,
    branchAllowlist,
    failures,
  };
};

const readGitHubJson = async (url, token) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2026-03-10",
    },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub environment policy API returned HTTP ${response.status} for ${url.pathname}`);
  }
  return response.json();
};

export const verifyLiveAiEnvironment = async ({ token, repository, apiUrl = "https://api.github.com" }) => {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("GITHUB_TOKEN is required to verify live AI environment protection");
  }
  if (typeof repository !== "string" || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repository form");
  }

  const base = apiUrl.replace(/\/+$/, "");
  const encodedEnvironment = encodeURIComponent(REQUIRED_ENVIRONMENT);
  const [environment, branchPolicyResponse] = await Promise.all([
    readGitHubJson(new URL(`${base}/repos/${repository}/environments/${encodedEnvironment}`), token),
    readGitHubJson(new URL(`${base}/repos/${repository}/environments/${encodedEnvironment}/deployment-branch-policies?per_page=100&page=1`), token),
  ]);

  const result = evaluateLiveAiEnvironment(environment, branchPolicyResponse);
  if (!result.ok) {
    throw new Error(`LIVE_AI_ENVIRONMENT_GUARD_FAILED: ${result.failures.join("; ")}`);
  }
  return result;
};

const run = async () => {
  const result = await verifyLiveAiEnvironment({
    token: process.env.GH_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "LIVE_AI_ENVIRONMENT_GUARD_FAILED: unknown error"}\n`);
    process.exitCode = 1;
  });
}
