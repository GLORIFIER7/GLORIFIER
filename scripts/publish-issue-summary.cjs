const { appendFile } = require('node:fs/promises');

const ISSUE_SUMMARY_HEADING = '## AI-generated issue summary (review before reuse)';
const ISSUE_FALLBACK_HEADING = '## Issue summary unavailable';

function buildIssueSummary({
  inferenceOutcome,
  response,
  issueNumber,
  serverUrl,
  repository,
}) {
  const summary = typeof response === 'string' ? response.trim() : '';
  if (inferenceOutcome === 'success' && summary) {
    return `${ISSUE_SUMMARY_HEADING}\n\n${summary}\n`;
  }

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

  const repositoryParts = typeof repository === 'string' ? repository.split('/') : [];
  if (repositoryParts.length !== 2 ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(repositoryParts[0]) ||
      !/^[A-Za-z0-9_.-]+$/.test(repositoryParts[1]) ||
      repositoryParts[1] === '.' || repositoryParts[1] === '..') {
    throw new Error('A valid GitHub repository identifier is required for the fallback link.');
  }

  let server;
  try {
    server = new URL(serverUrl);
  } catch {
    throw new Error('A valid HTTPS GitHub server URL is required for the fallback link.');
  }
  if (server.protocol !== 'https:' || server.username || server.password ||
      server.search || server.hash || (server.pathname !== '/' && server.pathname !== '')) {
    throw new Error('A valid HTTPS GitHub server URL is required for the fallback link.');
  }

  const issueUrl = new URL(`/${repository}/issues/${normalizedIssueNumber}`, server.origin);
  return [
    ISSUE_FALLBACK_HEADING,
    '',
    'AI inference did not return a summary for this run. The issue remains authoritative; no issue content was copied or modified by this fallback.',
    '',
    `Review the source issue: [#${normalizedIssueNumber}](${issueUrl.toString()}).`,
    '',
  ].join('\n');
}

async function publishIssueSummaryFromEnvironment() {
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
}

if (require.main === module) {
  publishIssueSummaryFromEnvironment().catch((error) => {
    console.error('Issue summary publication failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  });
}

module.exports = { buildIssueSummary };
