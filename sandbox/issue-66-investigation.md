# Issue #66 Investigation: Custom issue-prefix not respected by extension

**Bead**: vsbeads-375
**Date**: 2026-03-23
**Branch**: `fix/custom-issue-prefix`
**Reporter versions**: bd 0.49.6 / extension v0.12.0 / Windows 11
**Current versions**: bd 0.62.0 / extension v0.13.0+

## Summary

**The extension does not have an issue creation UI.** The `createBead` message type exists in the type definitions but is never sent from the webview and never handled by any provider. Issue creation is not a feature of the extension — users create issues via the CLI (`bd create`).

## Detailed Findings

### 1. Issue creation flow through the extension

There is **no issue creation flow**. The extension is read-only for issue creation:

- **`CreateIssueArgs`** interface defined at `src/backend/BeadsBackend.ts:25-34` — has `title`, `issue_type`, `priority`, `description`, `design`, `acceptance_criteria`, `assignee`, `labels`. **No `prefix` field.**
- **`BeadsCommandRunner.create()`** at `src/backend/BeadsCommandRunner.ts:116-136` — builds CLI args: `["create", "--title", ..., "--type", ..., "--priority", ..., "--json"]`. **Does NOT pass `--prefix`.**
- **`BeadsDoltBackend.create()`** at `src/backend/BeadsDoltBackend.ts:216-218` — delegates to `this.cli.create(args)` (i.e., `BeadsCommandRunner`).
- **`createBead` message type** defined in `src/backend/types.ts:186` and `src/webview/types.ts:109` — **dead code**. Never sent from any webview component, never handled in any provider's `handleCustomMessage()`.

### 2. Does the extension read `.beads/config.yaml`?

**No.** The extension never reads config.yaml directly. It relies entirely on the CLI:
- All operations go through `BeadsCommandRunner` which spawns `bd` with `--json`
- The `BEADS_DIR` env var is set when spawning `bd` commands (`src/backend/BeadsCommandRunner.ts:219`)
- No file reads of `config.yaml` anywhere in the codebase

### 3. How does `bd create` determine the prefix?

From `bd create --help`, the resolution order is:
1. `--prefix` flag (explicit override)
2. `--rig` flag (create in a different rig)
3. Config from `.beads/config.yaml` (`issue-prefix` setting)
4. Database name / directory name fallback

The `--force` flag exists to allow creation even if prefix doesn't match database prefix.

### 4. Is there any prefix logic in the webview?

**No.** Grep for "prefix" across `src/` finds only:
- `src/utils/__tests__/resolve-env-variables.test.ts` — unrelated (env var prefix)
- `src/utils/logger.ts` — logger scope prefix

No prefix derivation, hardcoding, or manipulation in the webview.

### 5. Is the extension passing or overriding prefix?

**Neither.** `BeadsCommandRunner.create()` does not pass `--prefix` to `bd create`. This means `bd` will use its own config resolution (config.yaml > directory name fallback). This is the correct behavior — the CLI handles prefix resolution.

### 6. Assessment: Is this still a bug?

**Not reproducible on the current codebase.** The extension v0.13.0+ does not have issue creation UI. The `createBead` message type is dead code that was likely planned but never implemented.

If the reporter was seeing "mixed prefixes" on v0.12.0, there are two possibilities:
1. **v0.12.0 had a create UI that passed an incorrect prefix** — this code has since been removed
2. **The reporter was confused** — they may have been using `bd create` from the terminal (which works correctly) while the extension was displaying issues with the directory-name prefix from a misconfigured project

Since the extension cannot create issues, this bug **cannot occur through the extension UI**. The `CreateIssueArgs` interface doesn't even have a `prefix` field.

## Recommended Action

1. **Close GitHub issue #66** as "not applicable to current version" — the extension has no create UI
2. **Clean up dead code**: Remove the `createBead` message type from both `src/backend/types.ts:186` and `src/webview/types.ts:109` since it's unused
3. **If/when create UI is added**: Ensure it does NOT pass `--prefix` to `bd create`, letting the CLI resolve prefix from config.yaml. The `CreateIssueArgs` interface should not gain a `prefix` field.

## Files Examined

| File | Lines | Relevant Finding |
|------|-------|-----------------|
| `src/backend/BeadsBackend.ts` | 25-34, 91 | `CreateIssueArgs` interface, `create()` method signature |
| `src/backend/BeadsCommandRunner.ts` | 116-136 | CLI args construction — no `--prefix` |
| `src/backend/BeadsDoltBackend.ts` | 216-218 | Delegates to CLI runner |
| `src/backend/types.ts` | 186 | Dead `createBead` message type |
| `src/webview/types.ts` | 109 | Dead `createBead` message type (mirror) |
| `src/providers/BaseViewProvider.ts` | 118-191 | Message handler — no `createBead` case |
| `src/providers/BeadsPanelViewProvider.ts` | 93-120 | Custom message handler — no `createBead` case |
| `src/providers/DashboardViewProvider.ts` | full | No create handling |
| `src/providers/BeadDetailsViewProvider.ts` | full | No create handling |
| `src/extension.ts` | full | No create command registered |
| `package.json` | full | No create command contribution |
