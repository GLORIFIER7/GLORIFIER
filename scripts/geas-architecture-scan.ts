import { mkdir, writeFile } from 'node:fs/promises';
import { runGeasArchitectureScan } from '../src/lib/governance/geas-architecture-scientist';

const outputDir = process.env.GEAS_SCAN_OUTPUT_DIR ?? 'artifacts/geas-architecture';
const result = await runGeasArchitectureScan();

await mkdir(outputDir, { recursive: true });
await writeFile(
  `${outputDir}/latest.json`,
  JSON.stringify(result, null, 2) + '\n',
  'utf8',
);

const summary = {
  scanId: result.scanId,
  completedAt: result.completedAt,
  observedPatterns: result.patterns.length,
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
