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
bd init --branch beads-metadata
bd sync                        # creates branch and worktree
bd hooks install
bd daemon --start --auto-commit
```

> **Note:** `bd init --branch` only sets config. Run `bd sync` to create the actual branch and worktree.

After setup, update `.beads/.gitignore` - see Step 3 in Migration section for the correct ignore patterns.

## Migration (Existing Project)

If you have an existing beads setup committing to main:

### Step 1: Prepare

```bash
git checkout main              # must be on main
bd daemon --stop
mkdir -p tmp
cp .beads/*.jsonl tmp/         # backup for safety
cp .beads/config.yaml tmp/     # preserve custom config (prefix, settings)
```

> **Important:** Review `config.yaml` for customizations like `issue-prefix`. After reinit, you may need to reapply these settings. The fresh init auto-detects prefix from directory name, which may differ from your original.

### Step 2: Remove old .beads and reinitialize

The `--force` flag doesn't work with existing databases. You must remove `.beads/` entirely:

```bash
rm -rf .beads
bd init --branch beads-metadata
```

This will:
- Create fresh `.beads/` with SQLite database
- Import existing issues from git history automatically
- Set sync branch config to `beads-metadata`

> **Note:** Your issues are preserved in git history and will be reimported. The tmp/ backup is just extra safety.

### Step 3: Fix .gitignore for protected branch mode

The fresh init creates a `.gitignore` with whitelist entries (`!issues.jsonl`) for normal mode. For protected branch mode, we need to ignore JSONL files on main.

Edit `.beads/.gitignore` - find and replace:

**Remove these lines:**
```
!issues.jsonl
!beads.jsonl
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

### Step 4: Untrack JSONL from main and commit

```bash
git rm --cached .beads/issues.jsonl 2>/dev/null
git rm --cached .beads/beads.jsonl 2>/dev/null   # legacy filename
git add .beads/.gitignore
git commit -m "chore: migrate to protected branch workflow for beads"
```

### Step 5: Create branch and worktree

```bash
bd sync
```

This creates the `beads-metadata` branch and sets up the worktree at `.git/beads-worktrees/beads-metadata`.

### Step 6: Install hooks and start daemon

```bash
bd hooks install --force
bd daemon --start --auto-commit
```

## Verification

After setup or migration, verify everything is working:

```bash
# Check worktree exists
git worktree list
# Should show:
# /path/to/project                                      abc1234 [main]
# /path/to/project/.git/beads-worktrees/beads-metadata  def5678 [beads-metadata]

# Check branch exists
git branch | grep beads-metadata

# Check daemon running with auto-commit
bd daemon --status

# Check issues are intact
bd stats

# Check JSONL not tracked on main
git ls-files .beads/ | grep jsonl      # should return nothing

# Check prefix preserved (compare with tmp/config.yaml if needed)
bd config get issue-prefix
```

## How It Works

```
main branch                    beads-metadata branch
├── src/                       ├── .beads/
├── package.json               │   ├── issues.jsonl
├── .beads/                    │   └── deletions.jsonl
│   ├── beads.db (local)       └── (auto-committed by daemon)
│   └── config.yaml
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

## Sync Commands

```bash
bd sync              # Push local changes, pull remote changes
bd sync --status     # Check sync status without syncing
bd sync --dry-run    # Preview what would sync
```

## Troubleshooting

**Worktree missing after init:**
```bash
bd sync   # creates branch and worktree
```

**"Database exists" error with --force:**
```bash
# --force doesn't override this. Remove and reinit:
cp .beads/*.jsonl tmp/   # backup
rm -rf .beads
bd init --branch beads-metadata
bd sync
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

**JSONL still being committed to main:**
Check `.beads/.gitignore` has ignore entries (not whitelist `!` entries) for JSONL files, and run `git rm --cached .beads/issues.jsonl`.

**Update hooks after upgrading bd:**
```bash
bd hooks install --force
```
