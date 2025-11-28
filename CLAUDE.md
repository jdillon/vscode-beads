# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
bun install              # Install dependencies
bun run compile          # Build extension + webview
bun run compile:quiet    # Build (quiet output - use this to save context)
bun run watch            # Watch mode (extension + webview in parallel)
bun run lint             # ESLint on src/**/*.{ts,tsx}
bun run test             # Jest tests (experimental VM modules)
bun run package          # Create VSIX package
```

## Development Workflow

**Testing workflow with Chrome DevTools MCP**: After building, ask the user to reload code-server and test. Don't automate the reload/test cycle via browser tools - it wastes context.

**Option 1: Extension Development Host (recommended for debugging)**
1. Open this repo in VS Code
2. Run `bun run watch` in terminal
3. Press `F5` to launch Extension Development Host
4. `Cmd+R` (Mac) / `Ctrl+R` (Win/Linux) to reload after changes

**Option 2: Symlink for local testing**
```bash
# Link extension to VS Code extensions directory
ln -s "$(pwd)" ~/.vscode/extensions/vscode-beads

# Reload VS Code window: Cmd+Shift+P → "Developer: Reload Window"
# Unlink when done
rm ~/.vscode/extensions/vscode-beads
```

**Option 3: Install VSIX locally**
```bash
bun run package                              # Creates vscode-beads-0.1.0.vsix
code --install-extension vscode-beads-0.1.0.vsix
```

## Architecture

VS Code extension for managing [Beads](https://github.com/steveyegge/beads) issues via `bd` CLI.

### Data Flow

1. **BeadsBackend** (`src/backend/BeadsBackend.ts`) - Single source of truth per project. Spawns `bd` CLI commands with `--json` output, parses responses.
2. **BeadsProjectManager** (`src/backend/BeadsProjectManager.ts`) - Discovers `.beads` directories in workspace, manages active project, daemon lifecycle.
3. **View Providers** (`src/views/`) - Extend `BaseViewProvider`, register webview views, handle message passing.
4. **React Webviews** (`src/webview/`) - Single React app with routing by `viewType`. Receives data via `postMessage`, sends actions back to extension.

### Key Patterns

- All Beads operations go through CLI (`bd list --json`, `bd show <id> --json`, etc.) - never access `.beads` files directly
- Status/priority normalization in `src/backend/types.ts` - CLI returns various formats, extension normalizes to internal types
- Webview↔Extension communication via typed messages (`ExtensionToWebviewMessage`, `WebviewToExtensionMessage`)
- Single webview bundle at `dist/webview/main.js` serves all 5 views; view type determines which component renders

### Build System

- esbuild for both extension (Node/CommonJS) and webview (browser/IIFE)
- Extension entry: `src/extension.ts` → `dist/extension.js`
- Webview entry: `src/webview/index.tsx` → `dist/webview/main.js`

## Status/Priority Mapping

CLI status values are normalized: `in-progress`/`active` → `in_progress`, `completed` → `done`, etc.
Priority is 0-4 where 0 = Critical (P0), 4 = None (P4).

## Beads (Issue Tracking)

Use beads MCP tools for ALL issue tracking. Do NOT use TodoWrite or markdown TODOs.

**Do NOT close issues prematurely.** Wait for explicit user verification that the work is complete before closing. Build succeeding is not enough - the user must confirm the feature works as expected.

**Commit format**: Include `Resolves: platform-xxx` or `Related: platform-xxx` in commit messages.
See `bd onboard` for more information.

## CHANGELOG

Maintain `CHANGELOG.md` using [Keep a Changelog](https://keepachangelog.com/) format.

- Add entries under `## [Unreleased]` as features/fixes are completed
- Only log notable changes: features, bug fixes, breaking changes
- Skip minor/internal changes (refactors, typos, CI tweaks)
- Keep entries terse - one line per change, with bead reference (e.g., `vsbeads-xxx`)
- Use sections: `### Added`, `### Fixed`, `### Changed`, `### Removed`

At release time, `[Unreleased]` content moves to `## [x.y.z] - date`.

## Code Conventions

- **kebab-case**: Source code, docs, configs (`my-module.ts`, `api-reference.md`)
- **UPPERCASE**: Only for standard files (`README.md`, `CHANGELOG.md`, `CLAUDE.md`, `LICENSE`)
