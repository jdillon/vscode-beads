# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Assignee and Estimate columns (hidden by default) (`vsbeads-kz0`)
- Comments render with markdown support (`vsbeads-rtk`)

### Fixed

- Column resize now works properly in Issues list (`vsbeads-oqb`)
- Table fills container width while respecting column minimums (`vsbeads-385`)
- Labels column shows all labels with ellipsis overflow (`vsbeads-8et`)
- Badge cells clip cleanly without ellipsis on overflow
- Column menu closes on click outside (`vsbeads-1nq`)
- Removing labels via X button now persists on save (`vsbeads-7g6`)
- Save button disabled when no pending changes
- Menus close when clicking outside VS Code webview
- Filter preset selector now uses styled dropdown (`vsbeads-cp3`)

### Changed

- Removed unused Kanban and Graph view code

## [0.3.0] - 2025-11-30

### Added

- Colored dropdowns for type/status/priority in edit mode (`vsbeads-fwp`)
- TypeBadge and FilterChip components (`vsbeads-fwp`)
- Inline editing from Details view with auto-save (`vsbeads-fwp`)

### Changed

- Badge text normalized to lowercase with small-caps (`vsbeads-fwp`)
- Badge sizing unified with CSS variables (`vsbeads-fwp`)

### Fixed

- Filter count overlay stays fixed when scrolling (`vsbeads-eeg`)
- Filter menu: added submenu indicators and click-outside dismiss (`vsbeads-3zm`)

## [0.2.0] - 2025-11-29

### Added

- Auto-generated label colors from label name with contrast-aware text (`vsbeads-gfr`)
- Version and timestamp logging on extension activation

### Changed

- Dependencies now grouped by relationship type: Parent/Children, Blocked By/Blocks, Discovered From/Spawned, Related (`vsbeads-bci`)

### Fixed

- Daemon client resilience with exponential backoff (1s → 30s) on polling errors (`vsbeads-5nm`)
- CLI syntax for daemon commands: `start/stop` → `--start/--stop`
- Null/undefined API response handling to prevent "Cannot read properties of null" errors

## [0.1.2] - 2025-11-28

### Added

- Click-to-copy bead ID in issues list rows (`vsbeads-fyn`)
- Blocked, Closed, and Epics filter presets (`vsbeads-fb7`)
- Copy ID button in Details panel title bar (`vsbeads-jru`)
- "Blocks" section in Details showing dependent issues with type-colored badges (`vsbeads-jue`)
- Status and priority badges in dependency/dependent lists (`vsbeads-c04`)
- Sort dependency lists by status then priority (blocked→in_progress→open→closed, then P0→P4)
- `compile:quiet` script for reduced build output

## [0.1.1] - 2025-11-27

### Added

- GitHub Actions CI workflow for PR/push validation (`vsbeads-vt6`)
- GitHub Actions release workflow for marketplace publishing (`vsbeads-vt6`)
- VSIX artifact upload on CI runs for manual testing (`vsbeads-vt6`)
- Marketplace icon and README attribution

## [0.1.0] - 2025-11-27

First public release.

### Features

- **Issues Panel** - Sortable, filterable table with search and column customization
- **Details Panel** - View/edit individual issues with markdown rendering
- **Multi-Project** - Auto-detects `.beads` directories, switch between projects
- **Daemon Management** - Auto-start option, status monitoring

### Technical

- React-based webviews with VS Code theming
- Communicates with Beads via `bd` CLI (JSON output)
- esbuild for extension and webview bundling
