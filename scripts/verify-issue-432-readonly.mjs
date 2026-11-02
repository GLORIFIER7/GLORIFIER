#!/usr/bin/env node
import process from 'node:process';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/verify-issue-432-readonly.mjs https://example.com');
  process.exit(2);
}

const paths = [
  '/api/health',
  '/api/runtime-verification?probeAi=false',
  '/api/reports/summary',
  '/api/identity',
  '/api/neural/health',
  '/api/neural/ready',
];

let failures = 0;
for (const path of paths) {
  try {
    const response = await fetch(new URL(path, base), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`${response.status} ${path}`);
    if (response.status >= 500) failures += 1;
  } catch (error) {
    failures += 1;
    console.error(`ERROR ${path}: ${error.message}`);
  }
}

process.exit(failures ? 1 : 0);
