# Upstream Notable Issues

Issues and PRs in the beads repo that are relevant to the vscode-beads extension but don't fit neatly into the daemon removal or Dolt categories.

## Agent Ecosystem

### #1351 — Agent-friendly worktree isolation (OPEN)

Well-designed proposal for per-worktree beads databases. Currently, AI agents (Claude Code, Codex CLI, Gemini CLI) in git worktrees share the main repo's `.beads/` directory, causing:
- Agents can't use worktree-specific databases (no `--db` flags in standard usage)
- `bd init` blocks in worktrees ("cannot run 'bd init' from within a git worktree")
- No isolation between worktree task tracking and main branch issues

Proposes `bd worktree init` with database isolation + prefix isolation. Relevant because our extension would need to handle multi-worktree scenarios.

### #1754 — Beads lifecycle hooks (OPEN)

Filed by Compass (AI agent). Proposes `.beads/hooks/post-create`, `post-close`, `post-update`, `post-claim` scripts that receive issue JSON on stdin. Would enable push-style notifications without polling.

**Direct impact on vscode-beads**: If implemented, the extension could register hooks that signal the webview to refresh. More efficient than fsnotify polling.

### #747 — Setting up multi-agent workflows with worktree (OPEN)

Documentation request for multi-agent beads workflows. Labels: `documentation`, `enhancement`. Open since Jan 11.

## Documentation & DX

### #376 — "I want to love Beads but the AI generated docs make it impossible" (OPEN)

User complaint about documentation quality. Labels: `documentation`. Has been open since Dec 2025, 51 days with no resolution. Suggests the project has a documentation debt problem.

### #486 — "Claude progressively forgets beads workflow within sessions" (OPEN)

Labels: `documentation`. About context window management when using beads with Claude. Relevant because our extension aims to provide a persistent UI alternative to CLI-in-context workflows.

### #780 — "Simplify CLI UX: overwhelming number of commands and flags" (OPEN)

User feedback about CLI complexity. May drive future simplification that affects our `--json` parsing.

## Installation & Setup

### #1744 — "Impossible to install cleanly" (OPEN, 6 comments)

Detailed walkthrough showing that even `git init && bd init && bd hooks install && bd doctor` produces 4 warnings. After 10+ commands, still can't achieve a clean state. This is the UX our extension can improve by abstracting the setup complexity.

### #1805 — v0.51.0 Linux binary without CGO (OPEN)

The latest release's Linux binary can't use Dolt at all. This means Linux users can't use beads v0.51.0. Our extension should handle this gracefully if a user reports it.

## Sync & Collaboration

### #1259 — "bd sync fails in crew worktree with redirect" (OPEN)

Git status exit 128 in worktree scenarios. Relevant for multi-agent setups.

### #1379 — "Local JSONL repeatedly diverges on Windows" (OPEN)

Windows-specific sync issues. If we support Windows, this matters.

### #1663 — "bd init --branch: issues.jsonl gets committed to main" (OPEN)

Protected branch initialization putting JSONL on main instead of sync branch. Causes pull conflicts.

## Type System & Schema

### #1347 — "Issue type validation rejects 'message' type" (CLOSED)

The `message` type wasn't being accepted by validation. Fixed. Our extension needs to handle all current types including `message`.

### #1179 — "Storage layer ValidateIssueIDPrefix ignores allowed_prefixes" (OPEN)

Blocks custom type creation (e.g., convoy). May affect future type support in the extension.

## Interesting Community Tools

### monitor-webui (#342, CLOSED)

The example we originally based our extension on. Old issue about daemon detection. The entire example is now broken (imports deleted `internal/rpc`).

### Beadbox (PR #1662)

Added to `COMMUNITY_TOOLS.md`. Another community tool building on beads. Worth watching for patterns.

## Issues to Track for Extension Development

**High priority** (directly affects our rewrite):
| Issue | Why |
|-------|-----|
| #1754 | Lifecycle hooks = push notifications for us |
| #1351 | Worktree isolation affects multi-workspace support |
| #1769 | Dolt lockups affect CLI reliability |
| #1805 | Linux build broken = no Linux users on v0.51.0 |

**Medium priority** (affects UX decisions):
| Issue | Why |
|-------|-----|
| #1744 | Setup complexity we can abstract |
| #780 | CLI simplification may change our parsing |
| #1661 | Server mode would enable richer integration |

**Low priority** (background awareness):
| Issue | Why |
|-------|-----|
| #376 | Documentation quality context |
| #1379 | Windows support considerations |
| #1663 | Protected branch edge cases |
