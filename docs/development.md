# Development

## Beads Setup (Issue Tracking)

After cloning, initialize beads with the protected branch workflow:

```bash
bd init --branch beads-metadata && bd hooks install
```

This sets up the worktree-based sync to `beads-metadata` branch. The extension uses `bd` for project discovery and Dolt lifecycle control, and reads issue data directly from Dolt SQL.

## Build Commands

```bash
bun install              # Install dependencies
bun run compile          # Build extension + webview
bun run watch            # Watch mode (extension + webview in parallel)
bun run lint             # ESLint on src/**/*.{ts,tsx}
bun run test             # Jest tests
bun run package          # Create VSIX package
```

## Development Workflow

**Option 1: Extension Development Host (recommended for debugging)**
1. Open this repo in VS Code
2. Run `bun run watch` in terminal
3. Press `F5` to launch Extension Development Host
4. `Cmd+R` (Mac) / `Ctrl+R` (Win/Linux) to reload after changes

**Option 2: Symlink for local testing**
```bash
ln -s "$(pwd)" ~/.vscode/extensions/vscode-beads
# Reload VS Code: Cmd+Shift+P → "Developer: Reload Window"
# Unlink when done
rm ~/.vscode/extensions/vscode-beads
```

**Option 3: Install VSIX locally**
```bash
bun run package
code --install-extension vscode-beads-*.vsix
```

## Releasing

Use the `project-release` skill (`/project-release` in Claude Code or
`$project-release` in Codex):

1. Invoke the skill from the `main` branch
2. Confirm the computed version (minor bump by default)
3. The skill audits the changelog for missing user-facing changes
4. If complete, it updates CHANGELOG.md, bumps package.json, commits, tags, and pushes
5. Tag push triggers GitHub Actions to publish to VS Code Marketplace

For hotfixes, create a `release-v*` branch and invoke the skill (patch bump).

## Architecture

See [AGENTS.md](../AGENTS.md) for architecture details, data flow, and code conventions.
