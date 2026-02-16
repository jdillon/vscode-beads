# Upstream Homebrew Migration

Beads moved from a custom Homebrew tap to the official homebrew-core formula catalog.

## Timeline

| Date | Event |
|------|-------|
| ~Nov 1, 2025 | Old tap `steveyegge/homebrew-beads` effectively deprecated (CHANGELOG v0.21.2) |
| Jan 22, 2026 | PR #1261 merged: "update to use core tap for beads installation" |
| Jan 22, 2026 | homebrew-core PR #261139 merged (formula added) |
| Jan 22, 2026 | homebrew-core PR #262885 merged (shell completions) |
| Feb 7, 2026 | PR #1557 merged: fix `brew upgrade bd` → `brew upgrade beads` in Go code |
| Feb 9, 2026 | PR #1622 merged: fix brew commands in docs + remove dead homebrew CI job |
| Feb 14, 2026 | PR #1738 merged: fix Homebrew upgrade command in INSTALLING.md |
| Feb 16, 2026 | Homebrew core serving v0.51.0 |

## Key Changes

### Formula Name Change

| Before | After |
|--------|-------|
| Tap: `steveyegge/beads` | Core: `homebrew-core` |
| Formula: `bd` | Formula: `beads` |
| Install: `brew tap steveyegge/beads && brew install bd` | Install: `brew install beads` |
| Upgrade: `brew upgrade bd` | Upgrade: `brew upgrade beads` |
| Binary: `bd` | Binary: `bd` (unchanged) |

The binary name is still `bd`, but the Homebrew formula name changed from `bd` to `beads`.

### Current State

- **homebrew-core**: Serving v0.51.0 (~2,569 installs in last 30 days)
- **Old tap**: Stuck at v0.49.0, not archived, README still promotes old install method
- **Formula page**: https://formulae.brew.sh/formula/beads
- **Dependencies**: Requires `icu4c@78`, Go 1.26.0 for source builds

### Old Tap Status (#1563)

The old tap `steveyegge/homebrew-beads` is:
- **Not archived** — appears as a normal, maintained repo
- **Not deprecated** — no `deprecate!` in the formula
- **Stuck at v0.49.0** — 2 minor versions and 1 major version behind
- **Still promotes itself** — README says `brew tap steveyegge/beads && brew install bd`
- **Has unanswered issues** — signaling abandonment

Issue #1563 proposes:
1. Add deprecation notice to old tap README
2. Add `deprecate!` to the formula file
3. Archive the repository
4. Respond to open issues directing to homebrew-core

This hasn't been done yet.

## Impact on vscode-beads

### For our README / installation docs

Update any references to beads installation:
```bash
# Old (broken)
brew tap steveyegge/beads
brew install bd

# New (correct)
brew install beads
```

### For version checking

The extension could check `bd version` output and warn if running < v0.50.0. Users on the old tap will be stuck at v0.49.0 and need to:

```bash
# Remove old tap version
brew untap steveyegge/beads
brew uninstall bd 2>/dev/null

# Install from homebrew-core
brew install beads
```

### For our package.json

Consider adding a minimum beads version requirement and surfacing a warning in the extension UI if the detected version is too old.

## Related Issues

| Issue | Title | Status |
|-------|-------|--------|
| #1261 | feat: update to use core tap for beads installation | MERGED (PR) |
| #1563 | chore: deprecate/archive the old Homebrew tap | OPEN |
| #1654 | Homebrew tap formula stuck at 0.49.0 | OPEN |
| #1561 | docs: replace "brew upgrade bd" with "brew upgrade beads" | CLOSED |
| #1562 | ci: remove dead update-homebrew job from release workflow | OPEN |
| #1357 | Brew upgrade fails | OPEN |
| #1426 | The Homebrew version hasn't updated past v0.49.1 | CLOSED |

## References

- Formula page: https://formulae.brew.sh/formula/beads
- Core tap PR: https://github.com/steveyegge/beads/pull/1261
- Old tap: https://github.com/steveyegge/homebrew-beads
- homebrew-core formula PR: https://github.com/Homebrew/homebrew-core/pull/261139
