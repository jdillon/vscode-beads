# Dolt Deep Dive

A comprehensive reference for understanding Dolt as the storage backend for beads, focused on what matters for building tools (like the VS Code extension) on top of it.

## 1. What is Dolt

Dolt is a SQL database with Git-style version control built in. Every mutation to the database can be committed, branched, merged, diffed, pushed, and pulled -- just like a Git repository, but for structured data instead of files.

### Architecture

Dolt is built on **Prolly Trees** (Probabilistic B-Trees), a content-addressed B-tree variant that combines:

- **B-tree seek performance** for standard SQL operations (SELECT, INSERT, UPDATE, DELETE)
- **Merkle DAG structural sharing** for efficient versioning across commits
- **Content addressing** for O(diff-size) diffing rather than O(table-size)

The key insight: because Prolly Trees are content-addressed, unchanged data between versions shares the same underlying storage blocks. A commit that changes one row in a million-row table only stores the new blocks for the changed path through the tree, not a full copy.

**Storage format details:**

- Data stored as N-ary Storage Model with clustered primary keys
- Entire dataset is content-addressed as a Merkle Tree of component blocks
- Node boundaries chosen by rolling hash of block contents (history-independent)
- All chunks compressed with Snappy (prioritizes speed over size)
- Table files written to disk before manifest references updated (durability)
- Manifest (pointer to all active table files) updated atomically on every mutation

**No write-ahead log (WAL):** Unlike SQLite or Postgres, Dolt does not use a WAL. New data writes create new table files containing new chunks. The manifest reference is updated atomically after the data is on disk.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Working Set** | Uncommitted changes (like git's working directory) |
| **Staged Changes** | Changes ready for commit (like `git add`) |
| **Commit** | Immutable snapshot of all tables at a point in time |
| **Branch** | Named pointer to a commit, just like git |
| **Remote** | Another Dolt database to push/pull from |
| **Merge** | Combine two branches with cell-level conflict resolution |

## 2. Embedded vs Server Mode

Dolt supports two connection modes, both of which beads uses.

### Embedded Mode

The embedded driver (`github.com/dolthub/driver`) bundles the entire Dolt SQL engine into the Go process. No separate server needed.

```go
// How beads opens embedded Dolt (simplified from store.go)
import embedded "github.com/dolthub/driver"

dsn := fmt.Sprintf(
    "file://%s?commitname=%s&commitemail=%s&database=%s",
    absPath, committerName, committerEmail, database,
)
cfg, _ := embedded.ParseDSN(dsn)
connector, _ := embedded.NewConnector(cfg)
db := sql.OpenDB(connector)

// CRITICAL: embedded mode is single-writer, like SQLite
db.SetMaxOpenConns(1)
db.SetMaxIdleConns(1)
```

**Characteristics:**
- Single file path on disk (`.beads/dolt/`)
- Uses Go's standard `database/sql` interface
- **Single-writer** -- only one connection, serialized writes
- Requires CGO (`//go:build cgo` throughout the dolt package)
- Must close the `connector` to release filesystem locks
- Supports retry with exponential backoff on open contention

**When beads uses it:** Default mode for local `bd` CLI usage. Every `bd` command opens an embedded connection, does its work, and closes it.

### Server Mode

Runs `dolt sql-server` as a separate process, connecting via MySQL wire protocol on port 3307.

```go
// Server mode connection (simplified from store.go)
import _ "github.com/go-sql-driver/mysql"

connStr := fmt.Sprintf("%s@tcp(%s:%d)/%s?parseTime=true",
    user, host, port, database)
db, _ := sql.Open("mysql", connStr)

// Server mode supports multi-writer
db.SetMaxOpenConns(10)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

**Characteristics:**
- Multi-writer support (connection pooling)
- MySQL protocol compatibility (any MySQL client works)
- Supports the remotesapi for peer-to-peer sync (federation)
- Requires managing a server process lifecycle
- Watchdog monitors health and auto-restarts on failure
- Retries transient connection errors (bad connection, broken pipe, connection refused)

**When beads uses it:** Federation / "Gas Town" multi-agent scenarios where multiple processes ("polecats") write concurrently.

### Trade-offs

| Aspect | Embedded | Server |
|--------|----------|--------|
| Setup complexity | Zero (just a directory) | Must start/manage process |
| Concurrent writers | No (single-writer) | Yes (10 connections) |
| Network overhead | None (in-process) | MySQL protocol over TCP |
| CGO requirement | Yes | No (MySQL driver is pure Go) |
| Federation (push/pull) | Manual (CLI commands) | Native (remotesapi) |
| Process isolation | None (crashes your app) | Full (separate process) |

### Branch-per-Agent (Server Mode)

In server mode, beads supports a `BD_BRANCH` environment variable for per-agent isolation:

```go
// From store.go -- each agent gets its own Dolt branch
if bdBranch := os.Getenv("BD_BRANCH"); bdBranch != "" && cfg.ServerMode {
    db.SetMaxOpenConns(1) // Force single connection for branch isolation
    db.SetMaxIdleConns(1)
    _, err := db.ExecContext(ctx, "CALL DOLT_CHECKOUT(?)", bdBranch)
    // Auto-creates branch if it doesn't exist
}
```

This eliminates optimistic lock contention between concurrent writers. Merges happen at coordination time.

## 3. Git-like Features

All version control operations are exposed as SQL stored procedures and system tables.

### Committing

```sql
-- Commit all staged and unstaged changes with a message
CALL DOLT_COMMIT('-Am', 'create issue bd-abc', '--author', 'beads <beads@local>');

-- The -A flag stages all changes automatically (like git commit -a)
-- The -m flag is the message
-- --author sets explicit committer identity
```

How beads commits (from `store.go`):

```go
func (s *DoltStore) Commit(ctx context.Context, message string) error {
    _, err := s.db.ExecContext(ctx,
        "CALL DOLT_COMMIT('-Am', ?, '--author', ?)",
        message, s.commitAuthorString())
    return err
}
```

### Branching

```sql
CALL DOLT_BRANCH('feature-x');          -- Create branch
CALL DOLT_CHECKOUT('feature-x');        -- Switch to branch
CALL DOLT_BRANCH('-D', 'feature-x');    -- Delete branch
SELECT active_branch();                  -- Current branch name
SELECT name FROM dolt_branches;          -- List all branches
```

### Merging

```sql
-- Merge a branch into the current branch
CALL DOLT_MERGE('--author', 'beads <beads@local>', 'feature-x');

-- Check for conflicts after merge
SELECT `table`, num_conflicts FROM dolt_conflicts;

-- Resolve conflicts
CALL DOLT_CONFLICTS_RESOLVE('--ours', 'issues');
CALL DOLT_CONFLICTS_RESOLVE('--theirs', 'issues');
```

Dolt does **cell-level merge**, not row-level. If two branches modify different columns of the same row, the merge succeeds without conflict. Conflicts only arise when the same cell is modified on both branches.

### Time-Travel Queries (AS OF)

```sql
-- Query a table as it existed at a specific commit
SELECT * FROM issues AS OF 'abc123def' WHERE id = 'bd-xyz';

-- Query as of a branch name
SELECT * FROM issues AS OF 'main' WHERE id = 'bd-xyz';
```

How beads uses `AS OF` (from `history.go`):

```go
func (s *DoltStore) getIssueAsOf(ctx context.Context, issueID string, ref string) (*types.Issue, error) {
    query := fmt.Sprintf(`
        SELECT id, content_hash, title, description, status, priority, ...
        FROM issues AS OF '%s'
        WHERE id = ?
    `, ref) // ref validated by validateRef() to prevent SQL injection
    // ...
}
```

### Diffing

```sql
-- Diff between two commits/branches using the table function
SELECT from_id, to_id, diff_type, from_title, to_title, from_status, to_status
FROM dolt_diff('commit_a', 'commit_b', 'issues');

-- diff_type is: 'added', 'modified', or 'removed'
```

### Push / Pull / Fetch

```sql
CALL DOLT_REMOTE('add', 'origin', 'https://doltremoteapi.dolthub.com/...');
CALL DOLT_PUSH('origin', 'main');
CALL DOLT_PULL('origin');
CALL DOLT_FETCH('origin');
```

## 4. System Tables

Dolt exposes version control metadata through read-only system tables queryable with standard SQL.

### `dolt_log` -- Commit History

```sql
SELECT commit_hash, committer, email, date, message
FROM dolt_log
ORDER BY date DESC
LIMIT 10;
```

Equivalent to `git log`. Shows full commit history for the current branch.

### `dolt_status` -- Working Set Changes

```sql
SELECT table_name, staged, status FROM dolt_status;
-- table_name: which table changed
-- staged: boolean (true = staged for commit)
-- status: 'new', 'modified', 'deleted'
```

Equivalent to `git status`. Shows uncommitted changes.

### `dolt_history_<table>` -- Full Row History

```sql
-- Every version of every row across all commits
SELECT id, title, status, commit_hash, committer, commit_date
FROM dolt_history_issues
WHERE id = 'bd-xyz'
ORDER BY commit_date DESC;
```

Each row appears once per commit that modified it. This is how beads implements `bd history <id>`.

### `dolt_diff_<table>` / `dolt_diff()` -- Row-Level Changes

Two forms:

```sql
-- System table: diff between adjacent commits
SELECT * FROM dolt_diff_issues WHERE diff_type = 'modified';

-- Table function: diff between any two refs
SELECT * FROM dolt_diff('main', 'feature-x', 'issues');
```

Each column appears twice: `from_<col>` and `to_<col>`, plus `diff_type` (added/modified/removed).

### `dolt_conflicts` / `dolt_conflicts_<table>` -- Merge Conflicts

```sql
-- Which tables have conflicts
SELECT `table`, num_conflicts FROM dolt_conflicts;

-- Details of each conflict for a specific table
SELECT * FROM dolt_conflicts_issues;
-- Shows: base_<col>, our_<col>, their_<col> for each conflicting row
```

### `dolt_branches` -- Branch List

```sql
SELECT name, hash, latest_committer, latest_commit_date, latest_commit_message
FROM dolt_branches;
```

### `dolt_remotes` -- Remote Configuration

```sql
SELECT name, url FROM dolt_remotes;
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `DOLT_HASHOF('HEAD')` | Current HEAD commit hash |
| `DOLT_HASHOF('main')` | Hash of a branch tip |
| `active_branch()` | Current branch name |

## 5. SQL Interface and MySQL Compatibility

Dolt is a MySQL-compatible database. It supports:

- Standard DML: SELECT, INSERT, UPDATE, DELETE, REPLACE
- DDL: CREATE TABLE, ALTER TABLE, CREATE INDEX, CREATE VIEW
- Transactions: BEGIN, COMMIT, ROLLBACK, SAVEPOINT
- Joins: LEFT JOIN, INNER JOIN (note: some complex join patterns can trigger bugs)
- CTEs: WITH RECURSIVE (used by beads for ready_issues view)
- JSON functions: JSON_OBJECT(), JSON operations
- MySQL functions: CURRENT_TIMESTAMP, NOW(), CONCAT, INSTR, SUBSTRING, LENGTH
- ON DUPLICATE KEY UPDATE (beads uses this extensively for upserts)
- INSERT IGNORE
- AUTO_INCREMENT
- Foreign keys with ON DELETE CASCADE

**MySQL dialect, not SQLite:** The schema in beads uses MySQL syntax (`VARCHAR(255)`, `TINYINT(1)`, `BIGINT`, `DATETIME`, `TEXT`, backtick quoting for reserved words like `` `key` ``).

**Known Dolt quirks in beads code:**
- Views use `LEFT JOIN` instead of `NOT EXISTS` to avoid `mergeJoinIter` panics
- Views use subqueries instead of three-table joins for the same reason
- `INSERT IGNORE` works but `ON DUPLICATE KEY UPDATE` is preferred
- Error messages differ from MySQL (`"can't drop"` vs `"doesn't exist"` for missing FKs)

**Connection from any MySQL client:**
```bash
mysql -u root -h 127.0.0.1 -P 3307 beads
```

## 6. Locking Model

### Embedded Mode: Advisory File Locking

Embedded Dolt is single-writer. Beads adds an advisory `flock` layer on top to prevent multiple `bd` processes from competing for Dolt's internal LOCK file:

```
.beads/dolt-access.lock     <-- beads advisory lock (flock)
.beads/dolt/beads/.dolt/    <-- Dolt internal LOCK file
```

From `access_lock.go`:

```go
// Shared locks for concurrent readers; exclusive locks for single-writer
func AcquireAccessLock(doltDir string, exclusive bool, timeout time.Duration) (*AccessLock, error) {
    lockPath := filepath.Join(filepath.Dir(doltDir), "dolt-access.lock")
    f, _ := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)

    lockFn := lockfile.FlockSharedNonBlock
    if exclusive {
        lockFn = lockfile.FlockExclusiveNonBlock
    }
    // Poll until timeout...
}
```

**What happens with concurrent access in embedded mode:**
1. First `bd` process acquires exclusive flock, opens embedded Dolt
2. Second `bd` process tries to acquire flock, blocks (polls every 50ms)
3. If timeout expires (default configurable), returns "another bd process is using the database"
4. Dolt itself also has internal LOCK file contention -- the advisory flock prevents reaching that level

### Server Mode: MySQL Transactions

In server mode, standard SQL transactions provide isolation:

- **Isolation level:** REPEATABLE_READ
- **Concurrent writers:** Multiple connections can write simultaneously
- **Write serialization:** Under the hood, Dolt serializes all commits through a single internal lock
- **Throughput ceiling:** ~300 writes/second (varies with database size and update complexity)
- **Optimistic locking:** Transactions use merge semantics at commit time; conflicts cause retry

### Embedded Connector Lifecycle

Critical detail: the embedded Dolt connector must be explicitly closed to release filesystem locks. Beads uses a "unit of work" pattern for initialization:

```go
// withEmbeddedDolt opens a connector, executes work, then closes everything
func withEmbeddedDolt(ctx context.Context, dsn string, configure func(*Config), fn func(ctx, db) error) error {
    connector, _ := embedded.NewConnector(cfg)
    db := sql.OpenDB(connector)
    defer func() {
        db.Close()
        connector.Close() // THIS releases filesystem locks
    }()
    return fn(ctx, db)
}
```

## 7. Change Detection

This is the most relevant section for the VS Code extension -- how to detect when data changes.

### Commit Hash Comparison

The simplest approach: compare HEAD commit hashes.

```sql
SELECT DOLT_HASHOF('HEAD');
-- Returns: "abc123def456..."
```

If the hash changed since the last check, data was committed. Beads exposes this via:

```go
func (s *DoltStore) GetCurrentCommit(ctx context.Context) (string, error) {
    var hash string
    s.db.QueryRowContext(ctx, "SELECT DOLT_HASHOF('HEAD')").Scan(&hash)
    return hash, nil
}
```

**Limitation:** Only detects committed changes. Uncommitted working set changes are invisible.

### dolt_status for Uncommitted Changes

```sql
SELECT table_name, staged, status FROM dolt_status;
```

If this returns rows, there are uncommitted changes.

### Diff Between Commits

To see exactly what changed between two known commits:

```sql
SELECT from_id, to_id, diff_type
FROM dolt_diff('old_commit_hash', 'new_commit_hash', 'issues');
```

### CommitExists Check

Beads has a helper to check if a commit hash is valid (useful for the daemon):

```go
func (s *DoltStore) CommitExists(ctx context.Context, commitHash string) (bool, error) {
    var count int
    s.db.QueryRowContext(ctx, `
        SELECT COUNT(*) FROM dolt_log
        WHERE commit_hash = ? OR commit_hash LIKE ?
    `, commitHash, commitHash+"%").Scan(&count)
    return count > 0, nil
}
```

### Practical Change Detection for VS Code Extension

For the daemon/extension polling scenario:

1. **Store last known commit hash**
2. **Poll `DOLT_HASHOF('HEAD')` on an interval**
3. **If hash changed:** use `dolt_diff(old_hash, new_hash, 'issues')` to get specific changes
4. **If hash unchanged but want working set changes:** check `dolt_status`

The auto-commit feature (next section) means most changes get committed immediately, so commit hash comparison is usually sufficient.

## 8. Dolt vs SQLite -- Why Beads Switched

### What SQLite provided
- Single-file simplicity
- Extremely fast reads (100k+ SELECTs/second)
- Mature, battle-tested
- No CGO variant available (with modernc.org/sqlite)

### What Dolt provides that SQLite cannot
- **Native version control:** Branch, diff, merge, history -- all built in
- **Federation:** Push/pull between instances (Gas Town peer-to-peer sync)
- **Time-travel queries:** `SELECT * FROM issues AS OF 'commit_hash'`
- **Cell-level merge:** Two agents modifying different fields on the same issue merge cleanly
- **Audit trail via commits:** Every change is tracked with author, timestamp, message
- **No sync layer needed:** SQLite required a JSONL export/import layer for multi-clone sync

### The trade-offs beads accepted

| Aspect | SQLite | Dolt |
|--------|--------|------|
| Read performance | Faster (optimized for OLTP reads) | ~33% slower than MySQL on reads |
| Write performance | Fast | ~10% faster than MySQL on writes |
| Diff performance | O(table_size) | O(diff_size) -- much better for large tables |
| Disk usage | Minimal | More (stores all versions) |
| CGO requirement | Optional (modernc.org/sqlite) | Required for embedded mode |
| Startup time | Instant | Schema init overhead (~20 DDL statements, mitigated by version check) |
| Maturity | Decades | Younger, occasional bugs (mergeJoinIter panics, etc.) |
| Concurrency | Single-writer (WAL mode) | Single-writer embedded, multi-writer server |
| Binary size | Small | Large (bundles full SQL engine) |

### The schema migration

Beads maintains the schema in `schema.go` as a MySQL-compatible DDL string (not SQLite syntax). The schema is versioned (`currentSchemaVersion = 3`) and additional migrations live in `internal/storage/dolt/migrations/`. Schema initialization is skipped when the version matches.

## 9. Performance Characteristics

### Known Numbers

- **vs MySQL:** ~10% slower overall; ~10% faster on writes, ~33% slower on reads
- **Write throughput (server mode):** ~300 writes/second ceiling due to serialized commits
- **Diff computation:** O(diff_size) not O(table_size), thanks to Prolly Trees
- **Read latency:** Slightly higher than MySQL due to content-address indirection

### Write Amplification

Prolly Trees have higher write amplification than traditional B-trees:
- Internal node pointers go through content-address lookups (extra index hop)
- Random inserts cause rewrites across the tree (not clustered)
- Each commit creates new table files for changed chunks

### Startup Optimization

Beads mitigates Dolt's startup cost with a schema version check:

```go
// From store.go -- skip ~20 DDL statements if schema is current
const currentSchemaVersion = 3

func initSchemaOnDB(ctx context.Context, db *sql.DB) error {
    var version int
    err := db.QueryRowContext(ctx,
        "SELECT `value` FROM config WHERE `key` = 'schema_version'").Scan(&version)
    if err == nil && version >= currentSchemaVersion {
        return nil // Fast path: schema already current
    }
    // ... execute full schema creation
}
```

### Embedded Mode Retry

The embedded driver has built-in exponential backoff for open contention:

```go
const embeddedOpenMaxElapsed = 30 * time.Second

func newEmbeddedOpenBackoff() backoff.BackOff {
    bo := backoff.NewExponentialBackOff()
    bo.MaxElapsedTime = embeddedOpenMaxElapsed
    return bo
}
```

### Server Mode Connection Pool

```go
db.SetMaxOpenConns(10)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

With transient error retry (bad connection, broken pipe, connection refused, etc.) and a watchdog that monitors health every 10 seconds.

## 10. How Beads Uses Dolt

### Directory Structure

```
.beads/
  config.yaml              # Project configuration
  dolt-access.lock         # Advisory flock for embedded mode
  dolt/                    # Dolt database directory
    beads/                 # Database named "beads" (or prefix-based)
      .dolt/               # Dolt internal files (commit graph, manifest, etc.)
        config.json
        noms/              # Prolly Tree chunk storage
```

### Initialization Flow

1. `NewFromConfig()` reads `config.yaml` to determine embedded vs server mode
2. `New()` creates the `DoltStore`:
   - **Embedded:** `withEmbeddedDolt()` for schema init, then fresh connector for the store
   - **Server:** TCP probe, then `sql.Open("mysql", ...)`
3. Schema initialized via `initSchemaOnDB()` (idempotent, version-checked)
4. Migrations run via `RunMigrations()` (also idempotent)
5. Branch checkout if `BD_BRANCH` is set (server mode only)
6. Watchdog started for server mode health monitoring

### Auto-Commit

The `bd` CLI auto-commits after every write command when enabled:

```go
// From dolt_autocommit.go
func maybeAutoCommit(ctx context.Context, p doltAutoCommitParams) error {
    mode, _ := getDoltAutoCommitMode()
    if mode != doltAutoCommitOn {
        return nil
    }
    msg := formatDoltAutoCommitMessage(p.Command, getActor(), p.IssueIDs)
    // e.g., "bd: create (auto-commit) by jdillon [bd-abc]"
    if err := st.Commit(ctx, msg); err != nil {
        if isDoltNothingToCommit(err) {
            return nil
        }
        return err
    }
    return nil
}
```

This means every `bd create`, `bd update`, `bd close`, etc. results in a Dolt commit. The daemon's `--auto-commit` flag controls this.

**Commit message format:** `bd: <command> (auto-commit) by <actor> [<issue-ids>]`

### Schema (Key Tables)

From `schema.go` (12 user tables + 2 views):

| Table | Purpose |
|-------|---------|
| `issues` | Primary issue data (80+ columns including agents, gates, molecules) |
| `dependencies` | Issue-to-issue edges (blocks, parent-child, related) |
| `labels` | Issue labels (many-to-many) |
| `comments` | Structured comments on issues |
| `events` | Audit trail (status changes, comments, etc.) |
| `config` | Key-value configuration store |
| `metadata` | Key-value metadata store |
| `child_counters` | Auto-incrementing child issue counters |
| `issue_snapshots` | Compaction snapshots |
| `compaction_snapshots` | Compaction data |
| `repo_mtimes` | Multi-repo sync tracking |
| `routes` | Prefix-to-path routing |
| `interactions` | Agent audit log |
| `federation_peers` | Peer credentials for federation |

**Views:**
- `ready_issues` -- Unblocked open work (recursive CTE)
- `blocked_issues` -- Issues with active blockers

### Version Control Operations Used

All via SQL stored procedures through `DoltStore` methods:

| Operation | SQL | Store Method |
|-----------|-----|-------------|
| Commit | `CALL DOLT_COMMIT('-Am', ?, '--author', ?)` | `Commit()` |
| Push | `CALL DOLT_PUSH(?, ?)` | `Push()` |
| Pull | `CALL DOLT_PULL(?)` | `Pull()` |
| Branch | `CALL DOLT_BRANCH(?)` | `Branch()` |
| Checkout | `CALL DOLT_CHECKOUT(?)` | `Checkout()` |
| Merge | `CALL DOLT_MERGE('--author', ?, ?)` | `Merge()` |
| Fetch | `CALL DOLT_FETCH(?)` | `Fetch()` |
| Add Remote | `CALL DOLT_REMOTE('add', ?, ?)` | `AddRemote()` |
| Resolve | `CALL DOLT_CONFLICTS_RESOLVE(?, ?)` | `ResolveConflicts()` |

### System Tables Queried

| System Table | Where Used |
|-------------|------------|
| `dolt_log` | `Log()`, `CommitExists()` |
| `dolt_status` | `Status()` |
| `dolt_history_issues` | `getIssueHistory()` |
| `dolt_diff()` | `Diff()` |
| `dolt_conflicts` | `getInternalConflicts()` |
| `dolt_branches` | `ListBranches()` |
| `dolt_remotes` | `ListRemotes()` |
| `DOLT_HASHOF('HEAD')` | `GetCurrentCommit()` |
| `active_branch()` | `CurrentBranch()` |

### Bootstrap from JSONL

When a Dolt database doesn't exist but JSONL files do (fresh clone scenario), `Bootstrap()` handles cold-start:

1. Detects `.beads/issues.jsonl` exists but no Dolt DB
2. Acquires bootstrap lock (prevents concurrent bootstraps)
3. Creates DoltStore with schema
4. Imports routes, issues, interactions from JSONL
5. Creates initial Dolt commit "Bootstrap from JSONL"

### Config: `config.yaml`

Dolt-relevant settings:

```yaml
# Sync mode: "dolt-native" means Dolt handles sync, not JSONL
sync.mode: "dolt-native"

# Protected branch for beads metadata (separate from code branches)
sync-branch: "beads-metadata"
```

The `metadata.json` (loaded by `configfile.Load()`) additionally controls:
- `backend`: `"dolt"` (default and only current option)
- `dolt_mode`: `"embedded"` or `"server"`
- `dolt_server_host`, `dolt_server_port`, `dolt_server_user`
- `dolt_database`: Database name (supports prefix-based naming)

### Non-CGO Fallback

All Dolt code is behind `//go:build cgo`. The `store_nocgo.go` provides stub implementations that return `errNoCGO` for every method. This allows building `bd` without CGO (e.g., for testing or environments where CGO is unavailable) while giving clear runtime errors if Dolt operations are attempted.

## Implications for the VS Code Extension

### What the Extension Sees

The VS Code extension communicates with `bd` CLI via `--json` output. The extension does not directly access Dolt. The daemon handles all database access.

### Change Detection Strategy

The daemon likely uses `DOLT_HASHOF('HEAD')` polling. When the hash changes, it can diff to find exactly which issues changed. This is the recommended approach for any tool building on beads.

### Things to Know

1. **All writes auto-commit** (when daemon has `--auto-commit`), so commit hash polling catches all changes
2. **Working set changes are transient** -- between a `bd update` and the auto-commit, changes exist only in the working set
3. **History is cheap to query** -- `dolt_history_issues` gives full audit trail per issue
4. **Diffs are cheap** -- O(diff_size), so checking "what changed since commit X" is efficient even for large databases
5. **Branches are real** -- `BD_BRANCH` creates isolated workspaces; the extension should be branch-aware if federation is used
6. **Cell-level merge** -- two agents updating different fields on the same issue don't conflict; the extension may see merged results that combine changes from multiple sources

### Potential Extension Features Enabled by Dolt

- **Issue history view** -- query `dolt_history_issues` for full change timeline
- **Diff view** -- show what changed between any two points in time
- **Branch awareness** -- show which branch the daemon is on
- **Commit log** -- show recent Dolt commits (who changed what, when)
- **Conflict resolution UI** -- when merges have conflicts, present ours/theirs/base

## Sources

- [Dolt Architecture Overview](https://docs.dolthub.com/architecture/architecture)
- [Dolt Storage Engine](https://docs.dolthub.com/architecture/storage-engine)
- [Dolt System Tables](https://docs.dolthub.com/sql-reference/version-control/dolt-system-tables)
- [Dolt SQL Functions](https://docs.dolthub.com/sql-reference/version-control/dolt-sql-functions)
- [Embedding Dolt in Go](https://www.dolthub.com/blog/2022-07-25-embedded/)
- [Writing a Go SQL Driver (2026)](https://www.dolthub.com/blog/2026-01-23-golang-sql-drivers/)
- [How Dolt Got as Fast as MySQL](https://www.dolthub.com/blog/2025-12-12-how-dolt-got-as-fast-as-mysql/)
- [Dolt Diff vs SQLite Diff](https://www.dolthub.com/blog/2022-06-03-dolt-diff-vs-sqlite-diff/)
- [dolt sql-server Concurrency](https://www.dolthub.com/blog/2021-03-12-dolt-sql-server-concurrency/)
- [Dolt Latency Benchmarks](https://docs.dolthub.com/sql-reference/benchmarks/latency)
- [dolthub/driver (Go embedded driver)](https://github.com/dolthub/driver)
- beads source: `internal/storage/dolt/` (schema.go, store.go, versioned.go, history.go, etc.)
