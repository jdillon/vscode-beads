# Beads Dashboard - VS Code Extension

A VS Code extension for visualizing and managing [Beads](https://github.com/steveyegge/beads) issues via multiple rich views. This extension talks to the Beads daemon via the `bd` CLI, providing a modern UI for issue tracking directly within your editor.

## Features

### Multiple Views

- **Beads Panel**: Table/list view with sorting, filtering, and search
- **Dashboard**: Summary cards, status/priority breakdowns, and quick access to important issues
- **Kanban Board**: Drag-and-drop cards between status columns
- **Dependency Graph**: Visual representation of issue dependencies
- **Bead Details**: Full view/edit of individual issues

### Multi-Project Support

- Automatic detection of Beads projects in your workspace
- Project selector to switch between multiple projects
- Daemon status monitoring per project
- Auto-start daemon option

### Key Capabilities

- Real-time synchronization with the Beads daemon
- Keyboard-accessible workflows
- VS Code theme integration (light and dark themes)
- Configurable refresh intervals
- Status updates via drag-and-drop or context menu

## Requirements

- **VS Code** 1.85.0 or higher
- **Beads CLI** (`bd`) installed and available in your PATH
- A Beads project initialized with `bd init`

## Installation

### From Source

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile the extension:
   ```bash
   npm run compile
   ```
4. Press `F5` in VS Code to launch the Extension Development Host

### From VSIX (coming soon)

```bash
code --install-extension beads-dashboard-0.1.0.vsix
```

## Usage

### Getting Started

1. Initialize a Beads project in your workspace:
   ```bash
   bd init
   ```

2. Start the Beads daemon:
   ```bash
   bd daemon start
   ```

3. Open the Beads sidebar in VS Code (click the Beads icon in the Activity Bar)

4. The extension will automatically detect your project and load issues

### Commands

| Command | Description |
|---------|-------------|
| `Beads: Switch Project` | Select which Beads project to view |
| `Beads: Open Dashboard` | Focus the Dashboard view |
| `Beads: Open Beads Panel` | Focus the Beads Panel view |
| `Beads: Open Kanban Board` | Focus the Kanban Board view |
| `Beads: Open Dependency Graph` | Focus the Dependency Graph view |
| `Beads: Open Bead Details` | View details for a specific bead |
| `Beads: Refresh All Views` | Refresh data in all views |
| `Beads: Create New Bead` | Create a new bead with quick input |
| `Beads: Start Daemon` | Start the Beads daemon for the active project |
| `Beads: Stop Daemon` | Stop the Beads daemon for the active project |

### Views

#### Beads Panel
The main list view showing all beads in a sortable, filterable table.

- Click column headers to sort
- Use the search box to filter by title/description/ID
- Click the Filters button to filter by status, priority, labels
- Click any row to open bead details

#### Dashboard
A high-level overview of your project's issues.

- Summary cards show total counts by status
- Bar charts break down issues by status and priority
- Quick lists show Ready, In Progress, and Blocked issues

#### Kanban Board
Trello-style board for visual task management.

- Drag cards between columns to change status
- Cards show priority badges, labels, and assignees
- Click the ⋮ menu on a card for quick status changes

#### Dependency Graph
Visual representation of issue dependencies.

- Nodes are colored by status
- Edges show "depends on" relationships
- Pan and zoom with mouse
- Click nodes to view details
- Search to highlight specific nodes

#### Bead Details
Full editing interface for a single issue.

- Edit title, description, status, priority, type, labels, assignee
- View and manage dependencies
- See creation/update timestamps

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `beads.pathToBd` | `"bd"` | Path to the Beads CLI executable |
| `beads.autoStartDaemon` | `true` | Automatically start daemon when switching projects |
| `beads.statusColumns` | `["backlog", "ready", "in_progress", "blocked", "done"]` | Column order for Kanban board |
| `beads.maxGraphNodes` | `100` | Maximum nodes to display in dependency graph |
| `beads.refreshInterval` | `30000` | Auto-refresh interval in ms (0 to disable) |

## Development

### Building

```bash
# Install dependencies
npm install

# Compile extension and webview
npm run compile

# Watch mode for development
npm run watch
```

### Project Structure

```
vscode-beads/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── backend/
│   │   ├── types.ts          # TypeScript data models
│   │   ├── BeadsBackend.ts   # CLI wrapper
│   │   └── BeadsProjectManager.ts  # Multi-project support
│   ├── views/
│   │   ├── BaseViewProvider.ts
│   │   ├── BeadsPanelViewProvider.ts
│   │   ├── DashboardViewProvider.ts
│   │   ├── KanbanViewProvider.ts
│   │   ├── DependencyGraphViewProvider.ts
│   │   └── BeadDetailsViewProvider.ts
│   └── webview/
│       ├── index.tsx         # Webview entry point
│       ├── App.tsx           # Main React app
│       ├── styles.css        # CSS styles
│       ├── common/           # Shared components
│       ├── beads-panel/
│       ├── dashboard/
│       ├── kanban/
│       ├── graph/
│       └── details/
├── resources/
│   └── beads-icon.svg
├── package.json
├── tsconfig.json
└── README.md
```

### Data Flow

1. The extension host (`BeadsBackend`) is the single source of truth per project
2. All data operations go through the `bd` CLI with `--json` output
3. Webviews receive data via VS Code message passing
4. On mutations, the backend broadcasts updates to all views

### Status Mapping

The extension normalizes Beads status values to an internal set:

| CLI Status | Internal Status |
|------------|-----------------|
| `backlog` | `backlog` |
| `ready` | `ready` |
| `in_progress`, `in-progress`, `active` | `in_progress` |
| `blocked` | `blocked` |
| `done`, `completed` | `done` |
| `closed`, `cancelled` | `closed` |

### Priority Mapping

| Value | Label |
|-------|-------|
| 0 | Critical (P0) |
| 1 | High (P1) |
| 2 | Medium (P2) |
| 3 | Low (P3) |
| 4 | None (P4) |

## Troubleshooting

### "No Beads projects found"

- Ensure you have a `.beads` directory in your workspace
- Run `bd init` in your project root to initialize Beads

### "Daemon not running"

- Click "Start Daemon" in the notification, or
- Run `bd daemon start` in your terminal, or
- Enable `beads.autoStartDaemon` in settings

### Commands fail with errors

- Check the "Beads Dashboard" output channel for detailed logs
- Ensure `bd` is in your PATH or configure `beads.pathToBd`
- Verify the daemon is running with `bd info`

## Contributing

Contributions are welcome! Please see the [Beads repository](https://github.com/steveyegge/beads) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [Beads Project](https://github.com/steveyegge/beads)
- [Beads CLI Reference](https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md)
- [Beads Daemon Documentation](https://github.com/steveyegge/beads/blob/main/docs/DAEMON.md)
