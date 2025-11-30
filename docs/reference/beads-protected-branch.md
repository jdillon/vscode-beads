# Beads Protected Branch Workflow

> **Note:** This is a general guide for any project using beads. Read and apply these instructions to your project.

The protected branch workflow keeps beads issue data on a separate branch (`beads-metadata`), keeping your main/feature branches clean of issue tracking commits.

## Why Use Protected Branch?

**Without protected branch:**
- Issue data (`issues.jsonl`, `deletions.jsonl`) commits to your working branch
- PRs include beads sync commits mixed with code changes
- Merge conflicts when multiple people update issues

**With protected branch:**
- Issue data commits to dedicated `beads-metadata` branch via git worktree
- Code PRs stay clean - only code changes
- Daemon handles auto-commit to metadata branch
- No merge conflicts on issue data

## Setup (New Project)

**Important:** You must be on `main` branch when running this command.

```bash
git checkout main
bd init --branch beads-metadata && bd hooks install
```

This:
1. Creates `.beads/` directory with SQLite database
2. Configures sync to `beads-metadata` branch
3. Sets up git worktree at `.git/beads-worktrees/beads-metadata`
4. Installs git hooks for auto-sync

> **Note:** The canonical JSONL filename is `issues.jsonl` (not `beads.jsonl`). If you see references to `beads.jsonl`, update them to `issues.jsonl`.

## Migration (Existing Project)

If you have an existing beads setup committing to main:

### Step 1: Stop daemon and backup
```bash
bd daemon --stop
mkdir -p tmp
cp .beads/*.jsonl tmp/  # backup for sanity
```

### Step 2: Update .beads/.gitignore

The existing `.gitignore` likely has whitelist entries (`!issues.jsonl`, `!beads.jsonl`) to track JSONL files. Change these to ignore entries instead:

**Remove these lines (if present):**
```
!beads.jsonl
!issues.jsonl
```

**Add these lines:**
```
# Protected branch mode: issue data goes to beads-metadata branch via worktree
beads.jsonl
issues.jsonl
deletions.jsonl

# Keep config files on main
!metadata.json
!config.json
```

### Step 3: Remove tracked files from main

Untrack the JSONL files so they're no longer committed to main:

```bash
git rm --cached .beads/issues.jsonl .beads/deletions.jsonl 2>/dev/null
git rm --cached .beads/beads.jsonl 2>/dev/null  # legacy filename
git add .beads/.gitignore
git commit -m "chore: migrate to protected branch workflow for beads"
```

### Step 4: Reinitialize with branch

**Important:** You must be on `main` branch when running this command.

```bash
git checkout main
bd init --branch beads-metadata --force
bd hooks install --force
```

### Step 5: Start daemon with auto-commit
```bash
bd daemon --start --auto-commit
```

## How It Works

```
main branch                    beads-metadata branch
├── src/                       ├── .beads/
├── package.json               │   ├── issues.jsonl
├── .beads/                    │   └── deletions.jsonl
│   ├── beads.db (local)       └── (auto-committed by daemon)
│   └── config.toml
└── (your code)

         ↑                              ↑
    code commits                  issue data commits
    (manual/PR)                   (daemon auto-commit)
```

The daemon:
- Watches for database changes
- Exports to JSONL files in worktree
- Auto-commits to `beads-metadata` branch
- Syncs with remote on `bd sync`

## Verification

Check worktree setup:
```bash
git worktree list
```

Should show:
```
/path/to/project                         abc1234 [main]
/path/to/project/.git/beads-worktrees/beads-metadata  def5678 [beads-metadata]
```

Check daemon status:
```bash
bd daemon --status
```

## Sync Commands

```bash
bd sync              # Push local changes, pull remote changes
bd sync --status     # Check sync status without syncing
bd sync --dry-run    # Preview what would sync
```

## Troubleshooting

**Worktree missing:**
```bash
bd init --branch beads-metadata --force
```

**Daemon not auto-committing:**
```bash
bd daemon --stop
bd daemon --start --auto-commit
```

**Check hooks installed:**
```bash
bd hooks install --force
```

**Update hooks after upgrading bd:**
```bash
bd hooks install --force
```
Run this after upgrading `bd` to ensure hooks match the latest version.
