import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readNeonOperationalCounts,
  type NeonHyperdriveBinding,
  type NeonPgClientFactory,
} from './neon-worker';

const expectedRows = [
  { table_name: 'connection_approvals', row_count: '9' },
  { table_name: 'connection_events', row_count: '251212' },
  { table_name: 'connection_registry', row_count: '30' },
  { table_name: 'intelligence_analyses', row_count: '266' },
  { table_name: 'intelligence_evidence', row_count: '1099' },
  { table_name: 'intelligence_reports', row_count: '133' },
];

const binding: NeonHyperdriveBinding = {
  connectionString: 'postgresql://test-only.invalid/glorifier',
};

test('reads exact counts for the six fixed operational tables through Hyperdrive', async () => {
  let capturedSql = '';
  let connected = false;
  let closed = false;
  let capturedConnectionString = '';
  const factory: NeonPgClientFactory = (connectionString) => {
    capturedConnectionString = connectionString;
    return {
      connect() {
        connected = true;
        return Promise.resolve();
      },
      query(sql) {
        if (sql.includes('FROM public.glorifier_worker_operational_counts')) capturedSql = sql;
        return Promise.resolve({ rows: expectedRows });
      },
      end() {
        closed = true;
        return Promise.resolve();
      },
    };
  };

  const counts = await readNeonOperationalCounts(binding, factory);

  assert.deepEqual(counts, {
    connection_approvals: 9,
    connection_events: 251212,
    connection_registry: 30,
    intelligence_analyses: 266,
    intelligence_evidence: 1099,
    intelligence_reports: 133,
  });
  assert.equal(capturedConnectionString, binding.connectionString);
  assert.equal(connected, true);
  assert.equal(closed, true);
  assert.ok(capturedSql.includes('FROM public.glorifier_worker_operational_counts'),
    'the Worker must read the aggregate-only database view');
  assert.doesNotMatch(capturedSql, /FROM public\.(?:connection_approvals|connection_events|connection_registry|intelligence_analyses|intelligence_evidence|intelligence_reports)\b/i,
    'the Worker login must not query base operational tables directly');
  assert.doesNotMatch(capturedSql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
});

test('rejects missing, duplicate, or unexpected operational count rows', async () => {
  const cases = [
    expectedRows.slice(0, 5),
    [...expectedRows, expectedRows[0]],
    [...expectedRows.slice(0, 5), { table_name: 'unexpected_table', row_count: '1' }],
  ];

  for (const rows of cases) {
    let closed = false;
    const factory: NeonPgClientFactory = () => ({
      connect: () => Promise.resolve(),
      query: () => Promise.resolve({ rows }),
      end: () => {
        closed = true;
        return Promise.resolve();
      },
    });
    await assert.rejects(() => readNeonOperationalCounts(binding, factory));
    assert.equal(closed, true);
  }
});

test('rejects unsafe, negative, fractional, and non-numeric row counts', async () => {
  for (const rowCount of ['-1', '1.5', 'NaN', '9007199254740992', '']) {
    let closed = false;
    const rows = expectedRows.map((row, index) => index === 0 ? { ...row, row_count: rowCount } : row);
    const factory: NeonPgClientFactory = () => ({
      connect: () => Promise.resolve(),
      query: () => Promise.resolve({ rows }),
      end: () => {
        closed = true;
        return Promise.resolve();
      },
    });
    await assert.rejects(() => readNeonOperationalCounts(binding, factory));
    assert.equal(closed, true);
  }
});

test('always closes a connected client after a query error', async () => {
  let closed = false;
  const factory: NeonPgClientFactory = () => ({
    connect: () => Promise.resolve(),
    query: () => Promise.reject(new Error('simulated query failure')),
    end: () => {
      closed = true;
      return Promise.resolve();
    },
  });

  await assert.rejects(() => readNeonOperationalCounts(binding, factory), /simulated query failure/);
  assert.equal(closed, true);
});

test('surfaces connection and client cleanup failures without discarding either error', async () => {
  let closed = false;
  const connectionError = new Error('simulated connection failure');
  const cleanupError = new Error('simulated cleanup failure');
  const factory: NeonPgClientFactory = () => ({
    connect: () => Promise.reject(connectionError),
    query: () => {
      throw new Error('query must not run after connection failure');
    },
    end: () => {
      closed = true;
      return Promise.reject(cleanupError);
    },
  });

  await assert.rejects(
    () => readNeonOperationalCounts(binding, factory),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [connectionError, cleanupError]);
      return true;
    },
  );
  assert.equal(closed, true);
});

test('fails closed when the Hyperdrive connection string is absent or invalid', async () => {
  let factoryCalls = 0;
  const factory: NeonPgClientFactory = () => {
    factoryCalls += 1;
    return {
      connect: () => Promise.resolve(),
      query: () => Promise.resolve({ rows: expectedRows }),
      end: () => Promise.resolve(),
    };
  };

  await assert.rejects(() => readNeonOperationalCounts({ connectionString: '' }, factory));
  await assert.rejects(() => readNeonOperationalCounts({ connectionString: 'https://not-postgres.invalid' }, factory));
  await assert.rejects(() => readNeonOperationalCounts({ connectionString: 'postgresql://bad host/glorifier' }, factory));
  assert.equal(factoryCalls, 0);
});


test('executes operational counts in an explicit read-only transaction', async () => {
  const statements: string[] = [];
  const factory: NeonPgClientFactory = () => ({
    connect: () => Promise.resolve(),
    query(sql) {
      statements.push(sql.trim());
      return Promise.resolve({
        rows: sql.includes('FROM public.glorifier_worker_operational_counts') ? expectedRows : [],
      });
    },
    end: () => Promise.resolve(),
  });

  const counts = await readNeonOperationalCounts(binding, factory);

  assert.equal(counts.connection_events, 251212);
  assert.equal(statements[0], 'BEGIN READ ONLY');
  assert.ok(statements[1].includes('FROM public.glorifier_worker_operational_counts'));
  assert.equal(statements[2], 'COMMIT');
});

test('rolls back the read-only transaction when the count query fails', async () => {
  const statements: string[] = [];
  const factory: NeonPgClientFactory = () => ({
    connect: () => Promise.resolve(),
    query(sql) {
      statements.push(sql.trim());
      if (sql.includes('FROM public.glorifier_worker_operational_counts')) {
        return Promise.reject(new Error('simulated count query failure'));
      }
      return Promise.resolve({ rows: [] });
    },
    end: () => Promise.resolve(),
  });

  await assert.rejects(
    () => readNeonOperationalCounts(binding, factory),
    /simulated count query failure/,
  );
  assert.equal(statements[0], 'BEGIN READ ONLY');
  assert.ok(statements[1].includes('FROM public.glorifier_worker_operational_counts'));
  assert.equal(statements[2], 'ROLLBACK');
});

test('surfaces query and client cleanup failures without discarding either error', async () => {
  const queryError = new Error('simulated query failure');
  const closeError = new Error('simulated cleanup failure');
  const factory: NeonPgClientFactory = () => ({
    connect: () => Promise.resolve(),
    query: () => Promise.reject(queryError),
    end: () => Promise.reject(closeError),
  });

  await assert.rejects(
    () => readNeonOperationalCounts(binding, factory),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [queryError, closeError]);
      return true;
    },
  );
});
