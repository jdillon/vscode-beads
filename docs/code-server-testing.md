# code-server Testing Environment

> **Living document for agents.** Keep updated with working commands, config, and lessons learned. Future SKILL candidate.

## Quick Start

```bash
# Start code-server (no auth for local dev)
code-server --auth none .

# Open browser via Chrome DevTools MCP
mcp__chrome-devtools__new_page url=http://127.0.0.1:8080/

# Build extension
bun run compile:quiet

# Reload in browser: Cmd+Shift+P → "Developer: Reload Window"
```

## Setup

### Extension Symlink

Extension installed via symlink to pick up changes on reload:

```bash
# Location (from project root)
~/.local/share/code-server/extensions/planet57.vscode-beads-dev -> $(pwd)

# Create symlink
ln -s "$(pwd)" ~/.local/share/code-server/extensions/planet57.vscode-beads-dev
```

### Config

Default config at `~/.config/code-server/config.yaml` uses password auth. Override with `--auth none` flag.

```yaml
# ~/.config/code-server/config.yaml
bind-addr: 127.0.0.1:8080
auth: password  # Override with --auth none
cert: false
```

## Commands

| Action | Command |
|--------|---------|
| Start (no auth) | `code-server --auth none .` |
| Start (custom port) | `code-server --auth none --bind-addr 127.0.0.1:3000 .` |
| Build extension | `bun run compile:quiet` |
| Watch mode | `bun run watch` |
| Reload window | Cmd+Shift+P → "Developer: Reload Window" |

## Workflow

### Recommended: Background Watch Mode

Run `bun run watch` as a background task - esbuild auto-rebuilds on file save. Only reload the browser window to pick up changes.

```bash
# Start watch in background (agent manages this)
bun run watch &

# After code changes: just reload browser window
# Cmd+Shift+P → "Developer: Reload Window" (or Cmd+R)
```

**Benefits:**
- Saves context (no repeated `bun run compile:quiet` calls)
- Fast iteration - changes rebuild in ~50ms
- Only need full rebuild (`bun run compile`) if watch gets confused

### Manual Build (fallback)

1. Start code-server: `code-server --auth none .`
2. Open http://127.0.0.1:8080
3. Make changes, run `bun run compile:quiet`
4. Reload window in browser (Cmd+Shift+P → Developer: Reload Window)
5. Test changes

Use manual builds when watch mode isn't running or after major changes (new files, config changes).

## Extensions Directory

- Path: `~/.local/share/code-server/extensions/`
- Manifest: `extensions.json` - tracks installed extensions
- Symlinked extensions use `-dev` suffix convention

## Troubleshooting

### Extension not loading
- Check symlink exists: `ls -la ~/.local/share/code-server/extensions/`
- Check `extensions.json` has entry
- Rebuild: `bun run compile:quiet`
- Full reload: restart code-server process

### Port in use
- Check: `lsof -i :8080`
- Use different port: `--bind-addr 127.0.0.1:3000`

## Notes

- `--auth none` safe for localhost only
- Symlink means no reinstall needed - just rebuild and reload
- Watch mode (`bun run watch`) + browser reload = fast iteration
