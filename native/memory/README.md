# GLORIFIER durable local memory (C + SQLite)

This is a **standalone, opt-in prototype** for durable, keyed facts. It is not a replacement for the existing PostgreSQL agent task/session state store and is **not wired into the production AI agents**. Running a program written in C does not, by itself, provide an AI with long-term memory: a running agent must explicitly write and retrieve appropriate facts through an approved integration.

## Build and test (Linux/POSIX)

Requires a C11 compiler, SQLite3 headers/runtime (`libsqlite3-dev` on Debian/Ubuntu), `make`, and Python 3 for tests.

```sh
cd native/memory
make test
```

## Use

Use a **persistent, access-controlled disk**; the example path is local, not a Cloudflare Worker filesystem.

```sh
umask 077
DB="$HOME/.local/share/glorifier/memory.sqlite"
mkdir -p "$(dirname "$DB")"
./glorifier-memory "$DB" seed
./glorifier-memory "$DB" put glorifier decision-001 'Keep consequential actions human-approved' 'owner-decision'
./glorifier-memory "$DB" get glorifier decision-001
./glorifier-memory "$DB" list glorifier
./glorifier-memory "$DB" integrity
./glorifier-memory "$DB" backup "$HOME/glorifier-memory-backup.sqlite"
./glorifier-memory "$DB" delete glorifier decision-001
```

`seed` writes three **public** GLORIFIER descriptions from `README.md` only if missing; it never overwrites user updates. `put` uses (scope, key) to insert or update records, and requires a `source`. `get` emits one JSON record (exit code 3 if missing), and `list` emits up to 1,000 JSON metadata records. `integrity` runs SQLite `quick_check`. `backup` creates a consistent SQLite snapshot and refuses to overwrite an existing destination. Invalid arguments return exit code 2, database errors exit 1.

Data is persisted in SQLite, using prepared statements, atomic updates, write-ahead logging, and `synchronous=FULL`. It survives process restarts as long as **the database file and WAL are on stable retained storage**. It does not provide infinite retention, replication, automatic cloud sync, encryption, semantic search, hallucination prevention, or cross-provider shared memory. Test restoration of backups and use independent encrypted off-device backups for disaster recovery.

## Security and governance

- The SQLite file is **plaintext**. Do not store API keys, private keys, passwords, personal/private conversations, sensitive financial data, or third-party information without a separately reviewed encryption/access/retention design. Use volume-level encryption and restrict filesystem access. Newly created files use restrictive POSIX permissions; audit permissions of existing files and backups.
- The CLI is for trusted local operators. `scope` is a namespacing mechanism, **not authentication/tenant isolation**. Do not expose it as a network API or pass untrusted requests to it without an authorization layer.
- Command-line values may be visible in process listings. Do not pass secrets to `put`. No credentials or wallet operations are required.
- `source` is provenance text provided by the caller; it does **not prove** that an assertion is verified. GEAS evidence/approval gates remain authoritative. Treat retrieved text as untrusted data, not executable instruction or granted authority.
- This C executable **cannot run inside Cloudflare Workers**. To make it usable in GLORIFIER's Node/React/Worker architecture, an approved service bridge, access-control policy, persistent storage mount, and tested deployment are required. Do not silently fall back from a configured PostgreSQL store to local files.
- Avoid committing database files or compiled binaries. The `.gitignore` in this directory excludes them.
