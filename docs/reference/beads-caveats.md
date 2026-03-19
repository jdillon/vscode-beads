# Beads Caveats & Known Issues

Notes on beads behavior, naming changes, and gotchas encountered during development.

## JSONL Filename Change (v0.25.1)

**Canonical filename is now `issues.jsonl`** (not `beads.jsonl`).

- Changed in beads v0.25.1 (JSONL Canonicalization, bd-6xd)
- Old `beads.jsonl` name is legacy
- Source: `internal/configfile/configfile.go:24`
- Reference: https://github.com/steveyegge/beads/issues/409#issuecomment-3592298397

If you have an older setup with `beads.jsonl`, beads should handle migration automatically, but verify your `.beads/.gitignore` references the correct filename.

## bd doctor Warnings After Fresh Init

`bd doctor` may show warnings immediately after `bd init` - this is a known UX issue. A fresh init shouldn't require doctor fixes.

Reference: https://github.com/steveyegge/beads/issues/409

## Protected Branch Worktree

When using `--branch` mode, beads creates a git worktree at `.git/beads-worktrees/<branch>`. If this gets corrupted:

```bash
bd init --branch beads-metadata --force
```

## Dolt Status and Protected Branch Sync

In protected-branch mode, issue data still syncs through the metadata worktree, but daemon-specific guidance is obsolete.

- Use `bd sync` to reconcile metadata branch changes
- Use `bd hooks install --force` after upgrading `bd`
- If the extension cannot read issue data, check the active project's Dolt status from the dashboard or with `bd dolt status`
