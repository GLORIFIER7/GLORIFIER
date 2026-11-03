const { appendFile } = require('node:fs/promises');

const ISSUE_SUMMARY_HEADING = '## AI-generated issue summary (review before reuse)';
const ISSUE_FALLBACK_HEADING = '## Issue summary unavailable';

const normalizeIssueNumber = (issueNumber) => {
  let normalizedIssueNumber = '';
  if (typeof issueNumber === 'number') {
    normalizedIssueNumber = String(issueNumber);
  } else if (typeof issueNumber === 'string') {
    normalizedIssueNumber = issueNumber.trim();
  }
  if (!/^[1-9]\d*$/.test(normalizedIssueNumber) ||
      !Number.isSafeInteger(Number(normalizedIssueNumber))) {
    throw new Error('A valid positive integer issue number is required for the fallback link.');
  }
  return normalizedIssueNumber;
};

const isValidRepositoryOwner = (owner) => /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(owner);
const isValidRepositoryName = (name) =>
  /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..';

const parseRepositoryIdentifier = (repository) => {
  const repositoryParts = typeof repository === 'string' ? repository.split('/') : [];
  const owner = repositoryParts[0];
  const name = repositoryParts[1];
  if (repositoryParts.length !== 2 ||
      !isValidRepositoryOwner(owner) ||
      !isValidRepositoryName(name)) {
    throw new Error('A valid GitHub repository identifier is required for the fallback link.');
  }
  return owner + '/' + name;
};

const isValidGitHubServer = (server) =>
  server.protocol === 'https:' &&
  !server.username &&
  !server.password &&
  !server.search &&
  !server.hash &&
  (server.pathname === '/' || server.pathname === '');

const parseGitHubServerUrl = (serverUrl) => {
  let parsedServer;
  try {
    parsedServer = new URL(serverUrl);
  } catch {
    throw new Error('A valid HTTPS GitHub server URL is required for the fallback link.');
  }
  if (!isValidGitHubServer(parsedServer)) {
    throw new Error('A valid HTTPS GitHub server URL is required for the fallback link.');
  }
  return parsedServer;
};

const buildFallbackIssueSummary = ({ issueNumber, serverUrl, repository }) => {
  const normalizedIssueNumber = normalizeIssueNumber(issueNumber);
  const normalizedRepository = parseRepositoryIdentifier(repository);
  const server = parseGitHubServerUrl(serverUrl);
  const issueUrl = new URL('/' + normalizedRepository + '/issues/' + normalizedIssueNumber, server.origin);
  return [
    ISSUE_FALLBACK_HEADING,
    '',
    'AI inference did not return a summary for this run. The issue remains authoritative; no issue content was copied or modified by this fallback.',
    '',
    'Review the source issue: [#' + normalizedIssueNumber + '](' + issueUrl.toString() + ').',
    '',
  ].join('\n');
};

const buildIssueSummary = (input) => {
  const summary = typeof input.response === 'string' ? input.response.trim() : '';
  if (input.inferenceOutcome === 'success' && summary) {
    return `${ISSUE_SUMMARY_HEADING}\n\n${summary}\n`;
    return ISSUE_SUMMARY_HEADING + '\n\n' + summary + '\n';
  }
  return buildFallbackIssueSummary(input);
};

const publishIssueSummaryFromEnvironment = async () => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    throw new Error('GITHUB_STEP_SUMMARY is required to publish the issue summary.');
  }

  const markdown = buildIssueSummary({
    inferenceOutcome: process.env.INFERENCE_OUTCOME,
    response: process.env.INFERENCE_RESPONSE,
    issueNumber: process.env.ISSUE_NUMBER,
    serverUrl: process.env.GITHUB_SERVER_URL,
    repository: process.env.GITHUB_REPOSITORY,
  });
  await appendFile(summaryPath, markdown, { encoding: 'utf8' });
};

if (require.main === module) {
  publishIssueSummaryFromEnvironment().catch((error) => {
    console.error('Issue summary publication failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  });
}

module.exports = { buildIssueSummary };
