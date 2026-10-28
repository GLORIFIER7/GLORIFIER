import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runGeasArchitectureScan } from '../src/lib/governance/geas-architecture-scientist';
import { buildGeasRunProvenance } from './geas-architecture-run-provenance';

const outputDir = process.env.GEAS_SCAN_OUTPUT_DIR ?? 'artifacts/geas-architecture';

async function readGitHubEventPayload(): Promise<unknown> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    return JSON.parse(await readFile(eventPath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

const runProvenance = buildGeasRunProvenance(process.env, await readGitHubEventPayload());
const result = await runGeasArchitectureScan();
const artifact = { ...result, runProvenance };

await mkdir(outputDir, { recursive: true });
await writeFile(
  `${outputDir}/latest.json`,
  JSON.stringify(artifact, null, 2) + '\n',
  'utf8',
);

const summary = {
  scanId: result.scanId,
  repositoryRevision: result.repositoryRevision,
  runProvenance,
  completedAt: result.completedAt,
  analysisPatterns: result.patterns.length,
  evidenceRecords: result.evidence.length,
  driftFindings: result.drift.length,
  sourceStatuses: result.sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.evidenceStatus] = (acc[source.evidenceStatus] ?? 0) + 1;
    return acc;
  }, {}),
  irreversibleChangesExecuted: result.irreversibleChangesExecuted,
};

await writeFile(
  `${outputDir}/summary.json`,
  JSON.stringify(summary, null, 2) + '\n',
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));
