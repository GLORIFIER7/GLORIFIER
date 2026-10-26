import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/a2a-runtime.ts', import.meta.url), 'utf8');
const insert = source.match(/INSERT INTO a2a_tasks\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
if (!insert) {
  console.error('A2A task persistence INSERT statement was not found.');
  process.exitCode = 1;
} else {
  const columns = insert[1].split(',').map((value) => value.trim()).filter(Boolean);
  const placeholders = insert[2].split(',').map((value) => value.trim()).filter(Boolean);
  const expected = columns.map((_, index) => `$${index + 1}`);
  if (placeholders.length !== columns.length || placeholders.some((value, index) => value !== expected[index])) {
    console.error(`A2A task persistence mismatch: ${columns.length} columns but placeholders are [${placeholders.join(', ')}].`);
    process.exitCode = 1;
  } else {
    console.log(`A2A task persistence contract valid: ${columns.length} columns and matching positional placeholders.`);
  }
}
