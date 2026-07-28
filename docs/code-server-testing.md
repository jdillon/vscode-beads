# code-server Testing Environment

> **Living document for agents.** Keep updated with working commands, config, and lessons learned. Future SKILL candidate.

## Quick Start

```bash
# 1. Start watch mode (background) - auto-rebuilds on save
bun run watch &

# 2. Start code-server (no auth for local dev)
code-server --auth none .

# 3. Open browser (either MCP works — see Browser Automation below)
mcp__chrome-devtools__new_page url=http://127.0.0.1:8080/
# or: mcp__claude-in-chrome__navigate url=http://127.0.0.1:8080/

# 4. After code changes: just reload browser window
# Run: codeserver reload
```

## Browser Automation

Two MCP options, both verified working (2026-07):

| Need | chrome-devtools MCP | claude-in-chrome |
|---|---|---|
| Open page | `new_page` | `navigate` (or `tabs_create_mcp`) |
| Hard reload (cache bypass) | `navigate_page type=reload ignoreCache=true` | `computer key Cmd+Shift+R` |
| Console logs | `list_console_messages` | `read_console_messages pattern=<regex>` (filterable) |
| Screenshot / click | yes | yes (`computer`) |
| Browser instance | separate CDP Chrome — crashes if DevTools opened manually | user's real Chrome, no CDP conflict |

claude-in-chrome caveats:
- Needs extension site permission for `127.0.0.1`
- Extension host logs do NOT appear in page console — read from disk instead:
  `~/.local/share/code-server/logs/<session>/exthost*/planet57.vscode-beads/Beads.log`

## Workspace Trust (gotcha)

Fresh code-server sessions (and any workspace-folder addition) start in **Restricted Mode**
— the extension will not activate and the activity bar icon stays hidden. Click
"Restricted Mode" in the status bar → Trust. Trust persists per folder, but adding a new
folder to the workspace re-triggers Restricted Mode for the whole workspace.

## Test Fixtures

Reusable fixture projects in `beads-test.code-workspace`:

- `~/ws/jdillon/beads-fixture` — shared Dolt server mode, bd 1.1.0+ schema
  (`depends_on_issue_id`), issues with a `blocks` dependency
- `~/ws/jdillon/beads-fixture-embedded` — embedded Dolt mode, 1 open + 1 closed issue
  (exercises CLI backend routing and the `All` filter)
- `example-project` — pre-1.1 schema (`depends_on_id`), per-project Dolt server

Throwaway fixture for the "no project found" path (#76) — folder with no `.beads` and a
`beads.pathToBd` that does not resolve:

```bash
mkdir -p /tmp/beads-fixture-noproject/.vscode
echo '{"beads.pathToBd": "tools/bd"}' > /tmp/beads-fixture-noproject/.vscode/settings.json
# open via http://127.0.0.1:<port>/?folder=/tmp/beads-fixture-noproject
```

Expected: Dashboard and Issues show "No Beads project found" (no spinner), and Beads.log
warns about the unresolved `beads.pathToBd` and the failed `bd where` probe.

### Agent Protocol

When testing with code-server, agents should:

1. **Start watch mode first** (background task) - keeps it running for the session
2. **Start code-server** (background task)
3. **Open browser** via Chrome DevTools MCP
4. **After edits**: just reload the browser window - no manual compile needed
5. **Check watch output** if changes aren't appearing (may need restart after new files)

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
| Reload window | `codeserver reload` ← cheap! (vs Cmd+Shift+P → "Developer: Reload Window") |

## Workflow

### Recommended: Background Watch Mode

Run `bun run watch` as a background task - esbuild auto-rebuilds on file save. Only reload the browser window to pick up changes.

```bash
# Start watch in background (agent manages this)
bun run watch &

# After code changes: just reload browser window
# Run: codeserver reload
```

**Benefits:**
- Saves context (no repeated `bun run compile:quiet` calls)
- Fast iteration - changes rebuild in ~50ms
- Only need full rebuild (`bun run compile`) if watch gets confused

### Manual Build (fallback)

1. Start code-server: `code-server --auth none .`
2. Open http://127.0.0.1:8080
3. Make changes, run `bun run compile:quiet`
4. Reload window: `codeserver reload`
5. Test changes

Use manual builds when watch mode isn't running or after major changes (new files, config changes).

## Extensions Directory

- Path: `~/.local/share/code-server/extensions/`
- Manifest: `extensions.json` - tracks installed extensions
- Symlinked extensions use `-dev` suffix convention

## Troubleshooting

### Testing the wrong checkout (worktrees)
`readlink ~/.local/share/code-server/extensions/planet57.vscode-beads-dev` must point at the
checkout you are editing. `ln -sf` on an existing symlink-to-directory writes the new link
*inside* the old target instead of replacing it — use `ln -sfn` (the start script now does).

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
