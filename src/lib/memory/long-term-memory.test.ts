import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PostgresLongTermMemoryStore, type MemoryQuery, type MemoryRecord } from './long-term-memory.ts';

const good = {
  tenantId: 'glorifier', subjectId: 'agent-1', memoryKey: 'governance.approval',
  category: 'decision' as const, content: 'Require independent approval', sourceRef: 'docs/SECURITY.md',
};

function fixture() {
  const data = new Map<string, MemoryRecord>();
  const calls: { sql: string; values: unknown[] }[] = [];
  const key = (tenant: string, subject: string, id: string) => `${tenant}\0${subject}\0${id}`;
  const query: MemoryQuery = async (sql, values = []) => {
    calls.push({ sql, values });
    if (/^\s*CREATE (?:TABLE|INDEX)/i.test(sql)) return { rows: [], rowCount: 0 };
    const [tenant, subject, id] = values as string[];
    const full = key(tenant, subject, id);
    if (sql.includes('INSERT INTO glorifier_long_term_memory')) {
      if (data.has(full)) return { rows: [], rowCount: 0 };
      const now = new Date('2026-11-23T10:00:00Z').toISOString();
      const record: MemoryRecord = { tenantId: tenant, subjectId: subject, memoryKey: id,
        content: values[3] as string, sourceRef: values[4] as string, category: values[5] as MemoryRecord['category'],
        status: 'NOT VERIFIED', version: 1, createdAt: now, updatedAt: now };
      data.set(full, record);
      return { rows: [record], rowCount: 1 };
    }
    if (sql.includes('UPDATE glorifier_long_term_memory')) {
      const found = data.get(full);
      if (!found || found.version !== values[6]) return { rows: [], rowCount: 0 };
      const updated = { ...found, content: values[3] as string, sourceRef: values[4] as string,
        category: values[5] as MemoryRecord['category'], status: 'NOT VERIFIED' as const,
        version: found.version + 1 };
      data.set(full, updated);
      return { rows: [updated], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM glorifier_long_term_memory')) {
      const found = data.get(full);
      if (!found || found.version !== values[3]) return { rows: [], rowCount: 0 };
      data.delete(full); return { rows: [{ memoryKey: found.memoryKey }], rowCount: 1 };
    }
    if (sql.includes('SELECT') && sql.includes('memory_key = $3')) {
      const found = data.get(full); return { rows: found ? [found] : [] };
    }
    if (sql.includes('SELECT') && sql.includes('tenant_id = $1 AND subject_id = $2')) {
      const match = [...data.values()].filter(v => v.tenantId === tenant && v.subjectId === subject);
      const results = sql.includes('position(lower($3)')
        ? match.filter(v => v.content.toLowerCase().includes(String(values[2]).toLowerCase()))
        : match;
      return { rows: results.slice(0, Number(values.at(-1))) };
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  return { store: new PostgresLongTermMemoryStore(query), data, calls };
}

test('initialize creates isolated schema and indexes', async () => {
  const { store, calls } = fixture();
  await store.initialize();
  assert.ok(calls.some(v => v.sql.includes('PRIMARY KEY (tenant_id, subject_id, memory_key)')));
  assert.ok(calls.some(v => v.sql.includes('CREATE INDEX IF NOT EXISTS')));
});

test('create and read preserve provenance and tenant isolation', async () => {
  const { store, calls } = fixture();
  const created = await store.create(good);
  assert.equal(created?.status, 'NOT VERIFIED');
  assert.equal(created?.version, 1);
  assert.equal(created?.sourceRef, 'docs/SECURITY.md');
  assert.deepEqual(await store.get('glorifier', 'agent-1', good.memoryKey), created);
  assert.equal(await store.get('other-tenant', 'agent-1', good.memoryKey), null);
  assert.equal(await store.create(good), null, 'create must not overwrite existing memory');
  assert.match(calls.find(v => v.sql.includes('INSERT INTO'))!.sql, /ON CONFLICT .* DO NOTHING/);
});

test('replace is version-guarded and revokes prior evidence status', async () => {
  const { store } = fixture();
  await store.create(good);
  assert.equal(await store.replace({ ...good, content: 'new' }, 2), null);
  const updated = await store.replace({ ...good, content: 'new' }, 1);
  assert.equal(updated?.version, 2);
  assert.equal(updated?.status, 'NOT VERIFIED');
  assert.equal(updated?.content, 'new');
  assert.equal(await store.replace({ ...good, content: 'stale' }, 1), null);
  assert.equal((await store.get('glorifier', 'agent-1', good.memoryKey))?.content, 'new');
});

test('list and literal search never cross tenant or subject boundaries', async () => {
  const { store, calls } = fixture();
  await store.create({ ...good, memoryKey: 'one', content: '100% reliable' });
  await store.create({ ...good, memoryKey: 'two', content: 'Another memory' });
  await store.create({ ...good, subjectId: 'agent-2', memoryKey: 'three', content: '100% outside subject' });
  await store.create({ ...good, tenantId: 'other', memoryKey: 'four', content: '100% outside tenant' });
  assert.equal((await store.list('glorifier', 'agent-1', 10)).length, 2);
  assert.deepEqual((await store.search('glorifier', 'agent-1', '%')).map(v => v.memoryKey), ['one']);
  assert.equal((await store.search('glorifier', 'agent-1', '100%')).length, 1);
  assert.ok(calls.some(v => v.sql.includes('position(lower($3) in lower(content))')),
    'literal substring search must not interpret user-supplied LIKE wildcards');
  await store.list('glorifier', 'agent-1', 1000000);
  assert.equal(calls.at(-1)?.values.at(-1), 100);
});

test('delete requires correct version and exact namespace', async () => {
  const { store } = fixture();
  await store.create(good);
  assert.equal(await store.delete('glorifier', 'agent-2', good.memoryKey, 1), false);
  assert.equal(await store.delete('glorifier', 'agent-1', good.memoryKey, 2), false);
  assert.equal(await store.delete('glorifier', 'agent-1', good.memoryKey, 1), true);
  assert.equal(await store.get('glorifier', 'agent-1', good.memoryKey), null);
});

test('rejects invalid identifiers, categories, payload limits, and empty provenance', async () => {
  const { store } = fixture();
  for (const input of [
    { ...good, tenantId: '' }, { ...good, subjectId: '../escape' },
    { ...good, memoryKey: 'space key' }, { ...good, content: '' },
    { ...good, content: 'x'.repeat(8193) }, { ...good, sourceRef: '' },
    { ...good, category: 'financial_action' as any },
  ]) await assert.rejects(() => store.create(input), /invalid|must|exceeds/i);
  await assert.rejects(() => store.get('','agent-1','key'), /invalid/i);
  await assert.rejects(() => store.replace(good, 0), /version/i);
  await assert.rejects(() => store.search('glorifier','agent-1',''), /query/i);
});

test('portable memory v1 fixtures pass and fail with the shared contract', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parsePortableMemoryRecord } = await import('./long-term-memory.ts');
  const contract = JSON.parse(await readFile(
    new URL('../../../docs/architecture/glorifier-memory-v1-fixtures.json', import.meta.url), 'utf8',
  )) as { cases: Array<{ valid: boolean; record: unknown; name: string }> };
  for (const entry of contract.cases) {
    if (entry.valid) assert.deepEqual(parsePortableMemoryRecord(entry.record), entry.record, entry.name);
    else assert.throws(() => parsePortableMemoryRecord(entry.record), /invalid|must|exceeds/, entry.name);
  }
});
