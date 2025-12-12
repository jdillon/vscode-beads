# Beads - VS Code Extension

<img src="resources/icon.png" alt="Beads icon" width="128" align="right">

VS Code extension for managing [Beads](https://github.com/steveyegge/beads) issues. Communicates with the Beads daemon via `bd` CLI.

![Beads VS Code Extension](docs/images/beads-vscode-screenshot.png)

## Features

**Issues Panel**

- Sortable, filterable table with global search
- Filter by status, priority, type, assignee, and labels
- Multi-column sorting (shift+click for secondary sort)
- Persistent column visibility, order, and sort preferences
- Filter presets: Not Closed, Blocked, Epics
- Click-to-copy bead IDs

**Details Panel**

- View/edit title, description, status, priority, type, labels, assignee
- Colored inline dropdowns for quick field editing
- Markdown rendering in description/notes with timezone-aware timestamps
- Dependency management with grouped relationship types (blocks, related, parent-child)

**Multi-Project & Daemon**

- Auto-detects `.beads` directories in workspace
- Status bar indicator with daemon health
- Auto-start daemon, auto-recover from stale sockets
- Windows TCP socket support

## Development

See [docs/development.md](docs/development.md) for build commands, architecture, and beads setup.

## Requirements

- VS Code 1.85.0+
- Beads CLI (`bd`) in PATH
- Initialized project (`bd init`)

## Installation

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=planet57.vscode-beads) or [Open VSX](https://open-vsx.org/extension/planet57/vscode-beads), or search "Beads" in VS Code/Cursor/VSCodium Extensions.

## Usage

1. Initialize: `bd init`
2. Start daemon: `bd daemon start`
3. Click Beads icon in Activity Bar

### Issues Panel

- Click column headers to sort (shift+click for multi-column)
- Search by title, description, or bead ID
- Filter by status, priority, type, assignee, labels
- Use filter presets or create custom filter combinations
- Show/hide and reorder columns via ⋮ menu
- Click row to view details, click bead ID to copy

### Details Panel

- Click badges to edit type/status/priority inline
- "Assign to me" quick action for assignee
- Add/remove labels with auto-generated colors
- Markdown rendering in description/notes
- View dependencies grouped by relationship type

## Commands

| Command                   | Description                     |
| ------------------------- | ------------------------------- |
| `Beads: Switch Project`   | Select active project           |
| `Beads: Refresh`          | Refresh all views               |
| `Beads: Create New Issue` | Create issue via quick input    |
| `Beads: Start Daemon`     | Start daemon for active project |
| `Beads: Stop Daemon`      | Stop daemon                     |
| `Beads: Restart Daemon`   | Restart daemon                  |

## Settings

| Setting                 | Default | Description                                         |
| ----------------------- | ------- | --------------------------------------------------- |
| `beads.pathToBd`        | `"bd"`  | Path to `bd` CLI                                    |
| `beads.autoStartDaemon` | `true`  | Auto-start daemon on project switch                 |
| `beads.refreshInterval` | `30000` | Auto-refresh interval in ms (0 = disable)           |
| `beads.renderMarkdown`  | `true`  | Render markdown in text fields                      |
| `beads.userId`          | `""`    | Your user ID for "Assign to me" (defaults to $USER) |

## Troubleshooting

**"No Beads projects found"** - Run `bd init` in project root

**"Daemon not running"** - Click "Start Daemon" or run `bd daemon start`

**Commands fail** - Check "Beads" output channel, verify `bd` in PATH

## Credits

Built with ❤️ using [Claude Code](https://claude.ai/code)

Icon inspired by <a href="https://www.flaticon.com/free-icons/beads" title="Beads icons">Beads icons created by imaginationlol - Flaticon</a>

Issue type icons from [Font Awesome Free](https://fontawesome.com) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))

## License

Apache License 2.0
