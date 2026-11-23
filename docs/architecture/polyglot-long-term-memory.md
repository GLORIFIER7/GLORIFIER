# GLORIFIER polyglot long-term memory v1 (opt-in)

**Status:** implementation and unit contract tests only; NOT VERIFIED in production. This is an additive memory subsystem. It does not schedule tasks, grant agents privileges, ingest conversations automatically, call models, or deploy infrastructure.

## Architectural boundaries

| Component | Responsibility | Current evidence |
| --- | --- | --- |
| TypeScript / Node.js | Primary server-side memory API (`src/lib/memory/long-term-memory.ts`) | Query-adapter unit tests locally; production NOT VERIFIED |
| PostgreSQL | Durable tenant/subject-keyed records using shared `DATABASE_URL` pool policy | SQL provided; live database migrations, backups and failover NOT VERIFIED |
| Python | Stdlib-only JSON record / JSONL contract validation (`scripts/memory/memory_contract.py`) | Shared fixture tests locally; no runtime Neural integration |
| C / SQLite | Separate offline prototype in pending PR #1017 | No automatic synchronization with PostgreSQL; not a Cloudflare Worker native runtime |
| Other first-party SDKs | Existing Neural HTTP/JSON clients | No new memory endpoint or memory capability claimed |

The stable cross-language interchange format is `glorifier-memory-v1.schema.json`. The shared contract fixture file is `glorifier-memory-v1-fixtures.json`. Both TypeScript and Python enforce a canonical UTC timestamp representation, strict record fields, bounded UTF-8 values, safe identifiers, four memory categories, explicit provenance, and `NOT VERIFIED` evidence status. The JSON schema describes structure but cannot independently enforce UTF-8 byte size, provenance authenticity, or authorization.

The C/SQLite prototype stores records with its own column format. No implicit cross-database synchronization or JSON parity is claimed. A future migration must use an explicit reviewed mapper and identity authorization for every record.

## Safety and governance

- This is **not** an HTTP route. Only server-side code with an independently authenticated and authorized tenant/subject may construct the store. Never accept `tenantId` or `subjectId` from an untrusted request without ownership checks.
- A source reference is a claim of origin, **not** proof that the statement is true. All newly written records have status `NOT VERIFIED`; a separate, reviewed verification process is needed before a system may promote confidence. No caller can mark these records `VERIFIED` using this API.
- Keys are unique per `(tenantId, subjectId, memoryKey)`. Writes use insert-if-absent and version-checked compare-and-swap replacements; deletes require the current version. These prevent silent overwrites, not unauthorized access by a caller who already has database credentials.
- Do not put secrets, signing credentials, wallet keys, sensitive personal records, prompts containing credentials, or unredacted conversations into memory. Store only explicitly allowed and minimized data. The data is ordinary PostgreSQL text, not application-level encrypted content.
- Retrieval is exact-key, scoped list, or bounded case-insensitive literal substring search (not semantic similarity). Nothing automatically retrieves memory for an LLM context or executes a saved instruction.
- Deletion removes the live row; PostgreSQL WAL, replicas, logs and retained backups are **not** purged automatically. Define backup retention, deletion propagation and restoration controls before storing regulated information.
- Backups, recovery drills, storage retention, operator access restrictions, encryption at rest, schema deployment, and real persistence through restarts are environment responsibilities and remain NOT VERIFIED.
- Cloudflare Workers cannot directly use the Node `pg` driver or the C local executable. A separately reviewed Worker-native authenticated persistence bridge is required for production Worker memory use.

## Usage (server-side Node only, after explicit authorization)

```ts
import { createOptionalPostgresLongTermMemoryStore } from './src/lib/memory/postgres-memory-adapter';

const store = createOptionalPostgresLongTermMemoryStore();
if (store) {
  // Run schema initialization during a controlled migration, not on every request.
  await store.initialize();

  // The invoking service must derive these identifiers from authenticated identity.
  await store.create({
    tenantId: 'glorifier',
    subjectId: 'agent-1',
    memoryKey: 'governance.approvals',
    category: 'decision',
    content: 'Consequential actions require authorized review.',
    sourceRef: 'docs/SECURITY.md',
  });
  const record = await store.get('glorifier', 'agent-1', 'governance.approvals');
  // Returns NOT VERIFIED with a version number and timestamps; no LLM invocation.
}
```

No `DATABASE_URL` means `createOptionalPostgresLongTermMemoryStore()` returns `null` rather than writing process-local fallback memory or silently creating a new pool. When a database is configured, connection failures must be surfaced rather than hidden. The shared pool applies the repository's existing production TLS policy.

## Tests and interchange

```sh
# Native Node.js 24+ TypeScript-transformation test, no package installation needed
node --experimental-transform-types --test src/lib/memory/long-term-memory.test.ts

# Stdlib-only Python 3.12 contract parity and JSONL validation tests
python3 -m unittest discover -s scripts/memory -p 'test_*.py'

# A JSONL file of exported v1 records may be validated offline (no import)
python3 scripts/memory/memory_contract.py records.jsonl
```

Path-scoped CI performs these contract tests. Only successful GitHub checks at the exact commit are verifiable CI evidence. A real PostgreSQL integration test, live authorization review, migrations/rollback plan, backup restoration exercise, SDK authorization design, and a production deployment approval are separate future gates.
