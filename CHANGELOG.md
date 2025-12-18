# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Fixed

### Changed

## [0.10.0] - 2025-12-17

### Added

- Update activity bar icon with improved beads artwork (`vsbeads-94s`)

### Fixed

- Eliminate excessive spacing in markdown lists (`vsbeads-l27`)
- Edit mode now supports external_ref and estimate fields (`vsbeads-96o`, `vsbeads-7r2`)
- Improve external_ref display with clickable URL links (`vsbeads-7ba`)
- Normalize control heights to 20px across all panels (`vsbeads-cf6`)
- Add retry resilience for transient daemon errors (database is closed) (`vsbeads-m98`)

## [0.9.0] - 2025-12-11

### Added

- Label filter option for Issues list with autocomplete and counts (`vsbeads-65h`)
- FontAwesome icons for issue types and UI elements
- Tag/label icon to label displays (`vsbeads-qlp`)
- Time display in timestamps in Details panel footer (`vsbeads-ipb`)
- Improved timestamp display formatting (`vsbeads-vq3`)

### Fixed

- Typography inconsistency across dropdown menus (`vsbeads-efp`)

## [0.8.0] - 2025-12-10

### Added

- Assignee column and filter to Issues view with "Assign to me" quick action (`vsbeads-s2c`)
- Move labels inline with type/status/priority badges at top of Details panel (`vsbeads-677`)
- Timestamp component with timezone-aware display and adaptive formatting (`vsbeads-5bz`, `vsbeads-izh`)

### Fixed

- Clicking bead ID in Issues list now selects row and updates Details panel (`vsbeads-qgo`)
- Dropdown menus now close when clicking outside webview panel (`vsbeads-tbq`)
- Timestamp sorting now handles cross-timezone comparisons correctly (`vsbeads-5bz`)

## [0.7.0] - 2025-12-08

### Added

- Windows TCP socket support for daemon connection ([#30](https://github.com/jdillon/vscode-beads/pull/30) by [@cg-shmoop](https://github.com/cg-shmoop))

### Fixed

- Auto-recover from stale daemon socket after system reboot (`vsbeads-ugm`)
- Centralize daemon error notifications to avoid notification spam (`vsbeads-ugm`)

## [0.6.0] - 2025-12-05

### Added

- Error notifications when bd commands fail with output console access (`vsbeads-ycx`)
- Persist sort order, column visibility, and column order across reloads (`vsbeads-4fw`)
- Multi-column sorting with shift+click for secondary sort (`vsbeads-gsb`)

### Fixed

- Dynamic updates from daemon events now properly registered (`vsbeads-7eg`)
- Project list now refreshes when workspace folders are added/removed (`vsbeads-s4i`)
- Button press feedback now visible on webview buttons (`vsbeads-zsy`)
- Browser context menu disabled on Issues table (`vsbeads-zvs`)
- Global search now works correctly with TanStack Table
- Column resize no longer triggers column reorder

### Changed

- Issues view migrated to TanStack Table v8 (`vsbeads-4uw`, `vsbeads-7yz`)
- Updated beads logo SVG in activity bar icon (`vsbeads-94s`)

## [0.5.0] - 2025-12-03

### Added

- Project selector in Dashboard view for consistency (`vsbeads-xbq`)
- "Start Daemon" button on socket connection errors (`vsbeads-xbq`)
- Custom project dropdown with daemon status indicators per project (`vsbeads-d8u`)
- Status bar item showing daemon health with click-to-manage menu (`vsbeads-ly2`)
- Daemon restart command and zombie daemon detection (`vsbeads-ly2`)
- Prompt to init uninitialized projects with terminal helper (`vsbeads-ly2`)

### Fixed

- UI no longer blocked when daemon not running - project switching always available (`vsbeads-xbq`)
- Improved daemon start logging - shows command, cwd, and errors (`vsbeads-868`)
- Project dropdown now updates status indicators on daemon connect/disconnect (`vsbeads-ly2`)

### Changed

- Extracted reusable `Dropdown` and `ChevronIcon` components for consistent dropdown behavior
- Upgraded logging to use VS Code's `LogOutputChannel` for colored output and log levels (`vsbeads-868`)

## [0.4.0] - 2025-12-01

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
- Sort labels alphabetically (case-insensitive) in Issues and Details views (`vsbeads-qtl`)

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
