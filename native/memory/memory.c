/* GLORIFIER local durable memory: SQLite records, not agent authorization. */
#define _POSIX_C_SOURCE 200809L
#include <sqlite3.h>
#include <stdio.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define MAX_SCOPE 128
#define MAX_KEY 255
#define MAX_VALUE 65536
#define MAX_SOURCE 1024

/* Reject malformed UTF-8, overlong forms, surrogates, and >U+10FFFF. */
static size_t utf8_width(const unsigned char *p) {
    unsigned char c = p[0];
    size_t n, i;
    if (c < 0x80) return 1;
    if (c >= 0xC2 && c <= 0xDF) n = 2;
    else if (c >= 0xE0 && c <= 0xEF) n = 3;
    else if (c >= 0xF0 && c <= 0xF4) n = 4;
    else return 0;
    for (i = 1; i < n; ++i) {
        if (p[i] < 0x80 || p[i] > 0xBF) return 0;
    }
    if ((c == 0xE0 && p[1] < 0xA0) || (c == 0xED && p[1] > 0x9F) ||
        (c == 0xF0 && p[1] < 0x90) || (c == 0xF4 && p[1] > 0x8F)) return 0;
    return n;
}

static int valid(const char *s, size_t max) {
    const unsigned char *p = (const unsigned char *)s;
    size_t n = s ? strlen(s) : 0, width;
    if (n == 0 || n > max) return 0;
    while (*p) {
        width = utf8_width(p);
        if (!width) return 0;
        p += width;
    }
    return 1;
}

static void json_string(const unsigned char *s) {
    const unsigned char *p = s ? s : (const unsigned char *)"";
    putchar('"');
    while (*p) {
        if (*p < 0x80) {
            switch (*p) {
                case '"': fputs("\\\"", stdout); break;
                case '\\': fputs("\\\\", stdout); break;
                case '\n': fputs("\\n", stdout); break;
                case '\r': fputs("\\r", stdout); break;
                case '\t': fputs("\\t", stdout); break;
                default:
                    if (*p < 0x20) printf("\\u%04x", (unsigned)*p);
                    else putchar(*p);
            }
            ++p;
        } else {
            size_t width = utf8_width(p);
            if (width) { fwrite(p, 1, width, stdout); p += width; }
            else { fputs("\\ufffd", stdout); ++p; }
        }
    }
    putchar('"');
}

static int sql(sqlite3 *db, const char *statement) {
    char *error = NULL;
    int rc = sqlite3_exec(db, statement, NULL, NULL, &error);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "SQLite: %s\n", error ? error : sqlite3_errmsg(db));
        sqlite3_free(error);
        return 1;
    }
    return 0;
}

static int database_open(const char *path, sqlite3 **out) {
    sqlite3_stmt *stmt = NULL;
    int version = 0;
    /* Database, journal, and WAL sidecars are private when newly created. */
    umask(0077);
    if (sqlite3_open_v2(path, out, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, NULL) != SQLITE_OK) {
        fprintf(stderr, "Cannot open memory database: %s\n", sqlite3_errmsg(*out));
        return 1;
    }
    sqlite3_busy_timeout(*out, 5000);
    if (sqlite3_prepare_v2(*out, "PRAGMA user_version", -1, &stmt, NULL) != SQLITE_OK) return 1;
    if (sqlite3_step(stmt) == SQLITE_ROW) version = sqlite3_column_int(stmt, 0);
    sqlite3_finalize(stmt);
    if (version > 1) {
        fprintf(stderr, "Refusing unsupported newer memory schema %d\n", version);
        return 1;
    }
    if (sql(*out, "PRAGMA journal_mode=WAL") || sql(*out, "PRAGMA synchronous=FULL")) return 1;
    if (sql(*out, "BEGIN IMMEDIATE")) return 1;
    if (sql(*out,
       "CREATE TABLE IF NOT EXISTS memory_v1 ("
       "scope TEXT NOT NULL CHECK(length(scope) BETWEEN 1 AND 128),"
       "memory_key TEXT NOT NULL CHECK(length(memory_key) BETWEEN 1 AND 255),"
       "value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 65536),"
       "source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 1024),"
       "created_at TEXT NOT NULL, updated_at TEXT NOT NULL,"
       "PRIMARY KEY(scope,memory_key)) WITHOUT ROWID") ||
        sql(*out, "PRAGMA user_version=1") || sql(*out, "COMMIT")) {
        sql(*out, "ROLLBACK");
        return 1;
    }
    return 0;
}

static int prepare(sqlite3 *db, sqlite3_stmt **stmt, const char *query) {
    if (sqlite3_prepare_v2(db, query, -1, stmt, NULL) == SQLITE_OK) return 0;
    fprintf(stderr, "SQLite prepare failed: %s\n", sqlite3_errmsg(db));
    return 1;
}

static void bind_text(sqlite3_stmt *stmt, int index, const char *s) {
    sqlite3_bind_text(stmt, index, s, -1, SQLITE_TRANSIENT);
}

static void emit_record(sqlite3_stmt *stmt) {
    static const char *fields[] = {"scope", "key", "value", "source", "created_at", "updated_at"};
    size_t i;
    putchar('{');
    for (i = 0; i < 6; ++i) {
        if (i) putchar(',');
        json_string((const unsigned char *)fields[i]);
        putchar(':');
        json_string(sqlite3_column_text(stmt, (int)i));
    }
    puts("}");
}

static int put(sqlite3 *db, const char *scope, const char *key, const char *value, const char *source) {
    sqlite3_stmt *stmt = NULL;
    int rc;
    if (!valid(scope, MAX_SCOPE) || !valid(key, MAX_KEY) ||
        !valid(value, MAX_VALUE) || !valid(source, MAX_SOURCE)) {
        fputs("Invalid or oversized memory field\n", stderr);
        return 2;
    }
    if (prepare(db, &stmt,
        "INSERT INTO memory_v1(scope,memory_key,value,source,created_at,updated_at) "
        "VALUES(?1,?2,?3,?4,strftime('%Y-%m-%dT%H:%M:%fZ','now'),"
        "strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
        "ON CONFLICT(scope,memory_key) DO UPDATE SET value=excluded.value,"
        "source=excluded.source,updated_at=excluded.updated_at")) return 1;
    bind_text(stmt, 1, scope); bind_text(stmt, 2, key);
    bind_text(stmt, 3, value); bind_text(stmt, 4, source);
    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) fprintf(stderr, "Write failed: %s\n", sqlite3_errmsg(db));
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return 1;
    puts("saved");
    return 0;
}

static int get(sqlite3 *db, const char *scope, const char *key) {
    sqlite3_stmt *stmt = NULL;
    int rc;
    if (!valid(scope, MAX_SCOPE) || !valid(key, MAX_KEY)) return 2;
    if (prepare(db, &stmt,
        "SELECT scope,memory_key,value,source,created_at,updated_at "
        "FROM memory_v1 WHERE scope=?1 AND memory_key=?2")) return 1;
    bind_text(stmt, 1, scope); bind_text(stmt, 2, key);
    rc = sqlite3_step(stmt);
    if (rc == SQLITE_ROW) emit_record(stmt);
    else if (rc != SQLITE_DONE) fprintf(stderr, "Read failed: %s\n", sqlite3_errmsg(db));
    sqlite3_finalize(stmt);
    return rc == SQLITE_ROW ? 0 : rc == SQLITE_DONE ? 3 : 1;
}

static int list(sqlite3 *db, const char *scope) {
    sqlite3_stmt *stmt = NULL;
    int rc, first = 1;
    if (!valid(scope, MAX_SCOPE)) return 2;
    if (prepare(db, &stmt,
        "SELECT memory_key,source,updated_at FROM memory_v1 "
        "WHERE scope=?1 ORDER BY memory_key LIMIT 1000")) return 1;
    bind_text(stmt, 1, scope);
    putchar('[');
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        if (!first) putchar(',');
        first = 0;
        fputs("{\"key\":", stdout); json_string(sqlite3_column_text(stmt, 0));
        fputs(",\"source\":", stdout); json_string(sqlite3_column_text(stmt, 1));
        fputs(",\"updated_at\":", stdout); json_string(sqlite3_column_text(stmt, 2));
        putchar('}');
    }
    puts("]");
    if (rc != SQLITE_DONE) fprintf(stderr, "List failed: %s\n", sqlite3_errmsg(db));
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE ? 0 : 1;
}

static int remove_key(sqlite3 *db, const char *scope, const char *key) {
    sqlite3_stmt *stmt = NULL;
    int rc;
    if (!valid(scope, MAX_SCOPE) || !valid(key, MAX_KEY)) return 2;
    if (prepare(db, &stmt, "DELETE FROM memory_v1 WHERE scope=?1 AND memory_key=?2")) return 1;
    bind_text(stmt, 1, scope); bind_text(stmt, 2, key);
    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) fprintf(stderr, "Delete failed: %s\n", sqlite3_errmsg(db));
    sqlite3_finalize(stmt);
    if (rc != SQLITE_DONE) return 1;
    puts("deleted");
    return 0;
}

static int integrity(sqlite3 *db) {
    sqlite3_stmt *stmt = NULL;
    int rc, ok = 0;
    if (prepare(db, &stmt, "PRAGMA quick_check")) return 1;
    rc = sqlite3_step(stmt);
    if (rc == SQLITE_ROW) {
        const unsigned char *value = sqlite3_column_text(stmt, 0);
        if (value) { puts((const char *)value); ok = strcmp((const char *)value, "ok") == 0; }
    }
    sqlite3_finalize(stmt);
    return ok ? 0 : 1;
}

static int seed_record(sqlite3 *db, const char *key, const char *value) {
    sqlite3_stmt *stmt = NULL;
    int rc;
    if (prepare(db, &stmt,
        "INSERT OR IGNORE INTO memory_v1(scope,memory_key,value,source,created_at,updated_at) "
        "VALUES('glorifier',?1,?2,'README.md',"
        "strftime('%Y-%m-%dT%H:%M:%fZ','now'),"
        "strftime('%Y-%m-%dT%H:%M:%fZ','now'))")) return 1;
    bind_text(stmt, 1, key); bind_text(stmt, 2, value);
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE ? 0 : 1;
}

/* Records only canonical public project descriptions. Never imports credentials. */
static int seed(sqlite3 *db) {
    if (sql(db, "BEGIN IMMEDIATE")) return 1;
    if (seed_record(db, "identity", "The governed intelligence layer for AI-powered businesses.") ||
        seed_record(db, "architecture", "Provider-neutral AI orchestration for models, agents, tools, data, and compute.") ||
        seed_record(db, "governance", "Identity, authority, policy, evidence, and human approval remain explicit.") ||
        sql(db, "COMMIT")) {
        sql(db, "ROLLBACK");
        return 1;
    }
    puts("seeded");
    return 0;
}

/* Build into an unguessable private staging file, then link it into place.
 * link() atomically fails when destination already exists: no TOCTOU window
 * between an access() pre-check and SQLite opening a caller-provided path.
 * Incomplete backup files are removed on every error path. */
static int backup(sqlite3 *db, const char *destination) {
    sqlite3 *copy = NULL;
    sqlite3_backup *handle = NULL;
    char *staging;
    size_t len;
    int fd, rc, close_rc;
    if (!valid(destination, 4096)) {
        fputs("Backup path missing or invalid\n", stderr);
        return 1;
    }
    len = strlen(destination);
    staging = malloc(len + sizeof(".tmpXXXXXX"));
    if (!staging) { fputs("Backup allocation failed\n", stderr); return 1; }
    snprintf(staging, len + sizeof(".tmpXXXXXX"), "%s.tmpXXXXXX", destination);
    fd = mkstemp(staging);
    if (fd < 0) {
        perror("Cannot create private backup staging file");
        free(staging);
        return 1;
    }
    if (close(fd) != 0) {
        perror("Cannot close backup staging file");
        unlink(staging);
        free(staging);
        return 1;
    }
    rc = sqlite3_open_v2(staging, &copy, SQLITE_OPEN_READWRITE, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Cannot open backup: %s\n", copy ? sqlite3_errmsg(copy) : "unknown");
        if (copy) sqlite3_close(copy);
        unlink(staging);
        free(staging);
        return 1;
    }
    handle = sqlite3_backup_init(copy, "main", db, "main");
    if (!handle) {
        fprintf(stderr, "Backup init failed: %s\n", sqlite3_errmsg(copy));
        sqlite3_close(copy);
        unlink(staging);
        free(staging);
        return 1;
    }
    rc = sqlite3_backup_step(handle, -1);
    if (sqlite3_backup_finish(handle) != SQLITE_OK) rc = SQLITE_ERROR;
    close_rc = sqlite3_close(copy);
    if (rc != SQLITE_DONE || close_rc != SQLITE_OK) {
        fputs("Backup failed\n", stderr);
        unlink(staging);
        free(staging);
        return 1;
    }
    /* Fail closed without ever replacing an existing file (including symlinks). */
    rc = link(staging, destination);
    if (unlink(staging) != 0) {
        perror("Cannot remove backup staging file");
        free(staging);
        return 1;
    }
    free(staging);
    if (rc != 0) {
        perror("Backup destination exists or cannot be created");
        return 1;
    }
    puts("backed up");
    return 0;
}

static void usage(void) {
    fputs("Usage: glorifier-memory DB put SCOPE KEY VALUE SOURCE\n"
          "       glorifier-memory DB seed\n"
          "       glorifier-memory DB get SCOPE KEY\n"
          "       glorifier-memory DB list SCOPE\n"
          "       glorifier-memory DB delete SCOPE KEY\n"
          "       glorifier-memory DB integrity\n"
          "       glorifier-memory DB backup DESTINATION\n", stderr);
}

int main(int argc, char **argv) {
    sqlite3 *db = NULL;
    int rc = 2;
    if (argc < 3 || !valid(argv[1], 4096)) { usage(); return 2; }
    if (database_open(argv[1], &db)) { if (db) sqlite3_close(db); return 1; }
    if (strcmp(argv[2], "seed") == 0 && argc == 3) rc = seed(db);
    else if (strcmp(argv[2], "put") == 0 && argc == 7) rc = put(db, argv[3], argv[4], argv[5], argv[6]);
    else if (strcmp(argv[2], "get") == 0 && argc == 5) rc = get(db, argv[3], argv[4]);
    else if (strcmp(argv[2], "list") == 0 && argc == 4) rc = list(db, argv[3]);
    else if (strcmp(argv[2], "delete") == 0 && argc == 5) rc = remove_key(db, argv[3], argv[4]);
    else if (strcmp(argv[2], "integrity") == 0 && argc == 3) rc = integrity(db);
    else if (strcmp(argv[2], "backup") == 0 && argc == 4) rc = backup(db, argv[3]);
    else usage();
    if (sqlite3_close(db) != SQLITE_OK) { fputs("Database close failed\n", stderr); return 1; }
    return rc;
}