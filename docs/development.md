# Development

## Beads Setup (Issue Tracking)

After cloning, initialize beads with the protected branch workflow:

```bash
bd init --branch beads-metadata
```

This sets up the worktree-based sync to `beads-metadata` branch. The extension handles daemon lifecycle automatically.

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

## Architecture

See [CLAUDE.md](../CLAUDE.md) for architecture details, data flow, and code conventions.
