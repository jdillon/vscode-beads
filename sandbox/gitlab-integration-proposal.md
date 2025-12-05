# GitLab Integration Proposal for Beads

Analysis of beads integration architecture and proposal for GitLab support.

## Current Architecture

### How Jira Bidirectional Sync Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   bd jira cmd   │────▶│  Python Scripts  │────▶│   Jira API      │
│   (Go/Cobra)    │◀────│  (jira2jsonl.py) │◀────│   REST          │
│                 │     │  (jsonl2jira.py) │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  beads.db       │◀───▶│  JSONL format    │
│  (SQLite)       │     │  (interchange)   │
└─────────────────┘     └──────────────────┘
```

**Key components:**

1. **Go Command** (`cmd/bd/jira.go` - 690 lines)
   - Provides `bd jira sync` and `bd jira status` commands
   - Reads config from `jira.*` namespace
   - Orchestrates pull/push operations
   - Handles conflict detection/resolution
   - Updates `external_ref` after push

2. **Python Scripts** (`examples/jira-import/`)
   - `jira2jsonl.py` (30K) - Fetches from Jira API, outputs JSONL
   - `jsonl2jira.py` (25K) - Reads JSONL, creates/updates Jira issues
   - Use `--from-config` to read bd config values
   - Standard library only (no dependencies)

3. **JSONL Format** (interchange)
   - Standard bd issue format
   - Scripts convert to/from external format
   - `external_ref` field links to source system

### Data Flow

**Pull (Import):**
```
Jira API → jira2jsonl.py → JSONL → importIssuesCore() → beads.db
```

**Push (Export):**
```
beads.db → store.SearchIssues() → JSONL → jsonl2jira.py → Jira API
```

**Conflict Resolution:**
- Tracks `jira.last_sync` timestamp in config
- Issues modified since last sync are potential conflicts
- Resolution modes: timestamp (newer wins), prefer-local, prefer-jira

### GitHub Import (One-Way)

GitHub only has import, no built-in command:

```
gh2jsonl.py → JSONL → bd import
```

No `bd github` command exists - users run the script manually.

## GitLab Integration Options

### Option 1: Follow Jira Pattern (Recommended)

Create `bd gitlab` command with bidirectional sync.

**Pros:**
- Consistent with existing Jira integration
- Full bidirectional support
- Built-in conflict resolution
- First-class UX (`bd gitlab sync`)

**Cons:**
- More code to maintain (Go command + Python scripts)
- Duplicates some logic from Jira implementation

**Files to create:**
```
cmd/bd/gitlab.go              # ~500-700 lines, similar to jira.go
examples/gitlab-import/
  gitlab2jsonl.py             # Import from GitLab API
  jsonl2gitlab.py             # Export to GitLab API
  README.md
```

**Config namespace:**
```bash
bd config set gitlab.url "https://gitlab.com"  # or self-hosted
bd config set gitlab.project "group/project"
bd config set gitlab.token "glpat-..."
```

### Option 2: `forge` CLI Tool (Companion to `bd`)

Create a standalone `forge` CLI tool in this repo that wraps/extends `bd` for external tracker sync. This lets us experiment with the feature before proposing it upstream.

**Architecture:**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   forge CLI     │────▶│   bd CLI        │────▶│   beads.db      │
│   (TypeScript)  │     │   (import/etc)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐
│  GitLab/GitHub  │
│  REST APIs      │
└─────────────────┘
```

**Project structure:**
```
tools/forge/
  src/
    index.ts              # CLI entry point
    commands/
      sync.ts             # forge sync [--pull|--push]
      status.ts           # forge status
      config.ts           # forge config set/get
    providers/
      provider.ts         # ForgeProvider interface
      gitlab.ts           # GitLab implementation
      github.ts           # GitHub implementation
    utils/
      jsonl.ts            # JSONL conversion
      bd.ts               # bd CLI wrapper
  package.json
  tsconfig.json
  README.md
```

**CLI interface:**
```bash
# Configure
forge config set provider gitlab
forge config set gitlab.url "https://gitlab.com"
forge config set gitlab.project "group/project"
forge config set gitlab.token "glpat-..."  # or use env var

# Sync
forge sync                    # Bidirectional (pull then push)
forge sync --pull             # Import from GitLab
forge sync --push             # Export to GitLab
forge sync --dry-run          # Preview without changes

# Status
forge status                  # Show sync status, pending issues
```

**Pros:**
- Standalone CLI - usable outside VS Code
- Experiment before upstreaming to `bd`
- TypeScript - familiar, type-safe
- Can integrate with VS Code extension later
- Uses `bd import` for actual data operations
- No changes to upstream `bd` required

**Cons:**
- Separate tool to install/maintain
- Users need both `bd` and `forge`
- May diverge from eventual upstream implementation

**Implementation approach:**

```typescript
// tools/forge/src/providers/provider.ts
export interface ForgeProvider {
  readonly name: string;

  testConnection(): Promise<boolean>;
  fetchIssues(state?: 'open' | 'closed' | 'all'): Promise<ExternalIssue[]>;
  createIssue(issue: BeadIssue): Promise<ExternalIssue>;
  updateIssue(externalId: string, issue: BeadIssue): Promise<ExternalIssue>;
}

// tools/forge/src/providers/gitlab.ts
export class GitLabProvider implements ForgeProvider {
  constructor(private config: GitLabConfig) {}

  async fetchIssues(state = 'all'): Promise<ExternalIssue[]> {
    const url = `${this.config.url}/api/v4/projects/${encodeURIComponent(this.config.project)}/issues`;
    // ... fetch and convert
  }
}

// tools/forge/src/commands/sync.ts
export async function syncCommand(opts: SyncOptions) {
  const provider = getProvider();  // GitLab, GitHub, etc.

  if (opts.pull) {
    // 1. Fetch from external
    const issues = await provider.fetchIssues(opts.state);

    // 2. Convert to JSONL
    const jsonl = issues.map(i => convertToBeadJsonl(i)).join('\n');

    // 3. Import via bd
    await exec(`echo '${jsonl}' | bd import`);
  }

  if (opts.push) {
    // 1. Get issues without external_ref
    const issues = JSON.parse(await exec('bd list --json'));
    const toPush = issues.filter(i => !i.external_ref);

    // 2. Create in external tracker
    for (const issue of toPush) {
      const created = await provider.createIssue(issue);

      // 3. Update external_ref via bd
      await exec(`bd update ${issue.id} --external-ref "${created.web_url}"`);
    }
  }
}
```

**Integration with vscode-beads:**
```typescript
// src/backend/ForgeIntegration.ts
// Shell out to `forge` CLI for operations
async function forgeSync(): Promise<void> {
  const result = await exec('forge sync --json');
  // Show results in UI
}
```

**Config storage:**
- Store in `.beads/forge.yaml` or use `bd config` namespace
- Tokens via environment variables (`GITLAB_TOKEN`, `GITHUB_TOKEN`)

### Option 3: Script-Only (Like Current GitHub)

Just add Python scripts, no Go command.

**Pros:**
- Minimal effort
- Users can customize scripts

**Cons:**
- No bidirectional sync orchestration
- No conflict resolution
- Inconsistent UX (Jira has command, GitLab doesn't)
- Manual workflow

**Files:**
```
examples/gitlab-import/
  gitlab2jsonl.py
  jsonl2gitlab.py  # Optional
  README.md
```

## Recommendation

**Option 2 (`forge` CLI companion tool)** is the best approach for experimentation:

- Build `tools/forge/` in this repo as a standalone TypeScript CLI
- Uses `bd` for data operations (import, update, list)
- Handles external API communication (GitLab, GitHub)
- Can be integrated into vscode-beads via shell-out
- If successful, patterns can inform upstream `bd` contribution

**Why not upstream first?**

Adding integrations as `bd` subcommands (like `bd jira`, `bd gitlab`, `bd github`, `bd linear`, ...) doesn't scale well:
- Each integration adds ~700 lines of Go code + Python scripts
- `bd` binary grows with every integration
- Users install integrations they don't need
- No plugin system to load integrations on demand

A companion tool like `forge` is more modular - users only install it if they need external tracker sync. If `bd` eventually gets a plugin system, `forge` could become a plugin.

**Workflow:**
1. Build `forge` CLI with GitLab support
2. Test manually, iterate on UX
3. Integrate into vscode-beads extension
4. If proven useful, propose upstream to `bd` (Option 1)

---

### Implementation Plan for `forge` CLI

**Phase 1: Scaffold**
```bash
mkdir -p tools/forge/src/{commands,providers,utils}
cd tools/forge && bun init
```

**Phase 2: Core**
- `ForgeProvider` interface
- `GitLabProvider` implementation
- Config management (`.beads/forge.yaml`)
- bd CLI wrapper utilities

**Phase 3: Commands**
- `forge sync [--pull|--push|--dry-run]`
- `forge status`
- `forge config set/get`

**Phase 4: vscode-beads Integration**
- Shell out to `forge` for operations
- Show results in webview
- Add commands to palette

**Phase 5: GitHub Support**
- Implement `GitHubProvider`
- Use `GITHUB_TOKEN` env var

---

### If upstreaming to `bd` later (Option 1):

### Implementation Plan

**Phase 1: Import Script**
```python
# examples/gitlab-import/gitlab2jsonl.py
# - Fetch issues via GitLab API
# - Map labels to priority/type/status
# - Preserve external_ref URLs
# - Support both gitlab.com and self-hosted
```

**Phase 2: Export Script**
```python
# examples/gitlab-import/jsonl2gitlab.py
# - Create issues in GitLab
# - Update existing issues
# - Handle label mapping (reverse)
# - Return mapping for external_ref updates
```

**Phase 3: Go Command**
```go
// cmd/bd/gitlab.go
// - bd gitlab sync (--pull, --push)
// - bd gitlab status
// - Config validation
// - Conflict detection/resolution
// - external_ref management
```

### GitLab API Considerations

| Feature | GitLab API | Notes |
|---------|------------|-------|
| List issues | `GET /projects/:id/issues` | Paginated |
| Create issue | `POST /projects/:id/issues` | Returns iid |
| Update issue | `PUT /projects/:id/issues/:iid` | |
| Labels | Via `labels` param | Comma-separated |
| Assignee | Via `assignee_ids` | Array |
| State | `state` (opened/closed) | |
| Auth | `PRIVATE-TOKEN` header | Personal/Project token |

### Label Mapping (Similar to GitHub)

**Priority:**
| GitLab Labels | bd Priority |
|---------------|-------------|
| priority::critical, P0 | 0 |
| priority::high, P1 | 1 |
| (default) | 2 |
| priority::low, P3 | 3 |
| priority::backlog, P4 | 4 |

**Type:**
| GitLab Labels | bd Type |
|---------------|---------|
| type::bug | bug |
| type::feature | feature |
| epic | epic |
| (default) | task |

### Config Settings

```yaml
# Proposed gitlab.* namespace
gitlab.url: "https://gitlab.com"        # or self-hosted URL
gitlab.project: "group/project"         # Project path
gitlab.token: "glpat-..."               # Personal/Project access token
gitlab.last_sync: "2025-12-04T..."      # Last sync timestamp
gitlab.status_map.*                     # Custom status mapping
gitlab.reverse_status_map.*             # Reverse mapping for push
```

## Alternative: Unified Forge in Future

After GitLab is implemented following the Jira pattern, a future refactor could unify:

```go
// cmd/bd/forge.go - common interface
type ForgeProvider interface {
    Pull(ctx context.Context, opts PullOptions) (*PullStats, error)
    Push(ctx context.Context, opts PushOptions) (*PushStats, error)
    Status(ctx context.Context) (*ForgeStatus, error)
    ValidateConfig() error
}

// cmd/bd/forge_jira.go
type JiraProvider struct { ... }

// cmd/bd/forge_gitlab.go
type GitLabProvider struct { ... }

// cmd/bd/forge_github.go
type GitHubProvider struct { ... }
```

This could be done as a refactor after individual integrations exist.

## Effort Estimate

| Component | Effort | Notes |
|-----------|--------|-------|
| gitlab2jsonl.py | Medium | Adapt from gh2jsonl.py |
| jsonl2gitlab.py | Medium | Adapt from jsonl2jira.py |
| gitlab.go | Medium-High | Adapt from jira.go |
| README.md | Low | Documentation |
| Tests | Medium | API mocking |
| **Total** | ~2-3 days | For experienced contributor |

## Questions to Resolve

1. **Self-hosted support** - How important? Affects URL handling.
2. **Project vs Group issues** - GitLab has both, which to support?
3. **Epics** - GitLab has separate Epic API, sync those too?
4. **Milestones** - Map to bd epics or ignore?
5. **MRs** - Exclude like GitHub PRs?

## Conclusion

Following the Jira pattern (Option 1) provides the best UX and maintains consistency. The architecture is proven and the code can be largely adapted from existing implementations.

A future "forge" abstraction (Option 2) could unify the integrations but should come after individual implementations exist to understand the common patterns.
