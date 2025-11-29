# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Auto-generated label colors from label name with contrast-aware text (`vsbeads-gfr`)

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
