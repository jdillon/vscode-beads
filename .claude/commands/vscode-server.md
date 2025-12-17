---
description: "Manage code-server for extension testing: start|stop|status"
allowed-tools: Bash, Read, mcp__chrome-devtools__new_page, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__close_page
---

Manage code-server development environment for testing VS Code extensions.

**Usage**: `/vscode-server [start|stop|reload|status]`

- `start` (default) - Start code-server and watch mode
- `stop` - Stop code-server and watch mode
- `reload [--devtools]` - Hard reload browser (cache bypass). With `--devtools`, closes and reopens the page (useful if MCP disconnected)
- `status` - Show current status of processes

**Arguments**: $ARGUMENTS

## Note: Opening DevTools Manually

Chrome only allows one DevTools client at a time. If you manually open DevTools (F12) while chrome-devtools-mcp is connected, the MCP will crash/disconnect.

**Workaround**: Configure the MCP server to launch with `--devtools` flag:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--devtools"]
    }
  }
}
```

This launches Chrome with DevTools already open, avoiding the conflict.

See: `~/Documents/Obsidian/Wonderland/VSCode/chrome-devtools-mcp-crash-when-opening-devtools.md`

## Instructions

Parse the argument (default to "start" if empty or not provided).

---

## Command: status

Check the status of all processes without starting anything.

### Check processes

```bash
echo "=== Watch Mode ==="
pgrep -f "bun run watch" && echo "Running" || echo "Not running"

echo "=== code-server ==="
pgrep -f "code-server" && echo "Running" || echo "Not running"
```

### Report status

Tell the user the current state of:

- Watch mode: running/not running (with PID if running)
- code-server: running/not running (with PID if running)

Then stop (don't execute start or stop commands).

---

## Command: stop

Stop all running processes.

### Stop watch mode

```bash
pkill -f "bun run watch" && echo "Watch mode stopped" || echo "Watch mode was not running"
```

### Stop code-server

```bash
pkill -f "code-server" && echo "code-server stopped" || echo "code-server was not running"
```

### Report

Tell the user what was stopped.

Then stop (don't execute start commands).

---

## Command: reload

Hard reload the browser with cache bypass. Useful after rebuilding the extension.

### Without --devtools (default)

Use `mcp__chrome-devtools__navigate_page` with:
- `type`: `"reload"`
- `ignoreCache`: `true`

This bypasses browser cache, ensuring the latest extension code is loaded.

### With --devtools

If the `--devtools` flag is present, do a full page close/reopen instead of just reload. This recovers from MCP disconnection (e.g., if you opened DevTools manually).

1. First, try to close the existing page using `mcp__chrome-devtools__close_page` (ignore errors if it fails)
2. Then open a fresh page using `mcp__chrome-devtools__new_page` with URL `http://127.0.0.1:8080/`
3. Do a hard reload with `mcp__chrome-devtools__navigate_page` (type: reload, ignoreCache: true)

**Note**: The `--devtools` flag name is a hint that this is useful when DevTools caused the disconnect. The actual DevTools panel opening depends on your MCP server config (see "Opening DevTools Manually" section above).

---

## Command: start

Start code-server development environment for testing the current VS Code extension.

### Step 1: Validate this is a VS Code extension

Read `package.json` and verify it's a VS Code extension by checking:

- Has `engines.vscode` field
- Has `publisher` field
- Has `name` field

If any are missing, stop with error: "This project doesn't appear to be a VS Code extension (missing engines.vscode, publisher, or name in package.json)"

Extract and save:

- `publisher` (e.g., "planet57")
- `name` (e.g., "vscode-beads")

The extension ID is: `{publisher}.{name}-dev` (e.g., "planet57.vscode-beads-dev")

### Step 2: Check/create extension symlink

The symlink path is: `~/.local/share/code-server/extensions/{publisher}.{name}-dev`

Check if the symlink exists and points to the current directory:

```bash
readlink ~/.local/share/code-server/extensions/{publisher}.{name}-dev 2>/dev/null
```

Compare with `$(pwd)`. If missing or pointing elsewhere, create/update it:

```bash
ln -sf "$(pwd)" ~/.local/share/code-server/extensions/{publisher}.{name}-dev
```

**Important**: The symlink must be created at the TARGET path (in `~/.local/share/code-server/extensions/`), NOT in the current directory. Never run `ln` with the project directory as both source and a relative target.

### Step 3: Build the extension

Run a quick build to ensure dist/ is up to date:

```bash
bun run compile:quiet
```

If build fails, stop and report the error.

### Step 4: Check for existing processes

Check if watch mode or code-server are already running:

```bash
pgrep -f "bun run watch" || echo "not running"
pgrep -f "code-server" || echo "not running"
```

### Step 5: Start watch mode (if not running)

If watch mode is not running, start it in background:

```bash
bun run watch
```

Use `run_in_background: true` for this command.

### Step 6: Start code-server (if not running)

If code-server is not running, start it in background:

```bash
code-server --auth none .
```

Use `run_in_background: true` for this command.

Wait 2-3 seconds for code-server to start up.

### Step 7: Open browser with Chrome DevTools MCP

Use the `mcp__chrome-devtools__new_page` tool to open:

- URL: `http://127.0.0.1:8080/`

Then immediately do a hard reload to bypass cache:

Use `mcp__chrome-devtools__navigate_page` with:
- `type`: `"reload"`
- `ignoreCache`: `true`

### Step 8: Report status

Tell the user:

- Extension: `{publisher}.{name}`
- Symlink: created/verified at `~/.local/share/code-server/extensions/{publisher}.{name}-dev`
- Watch mode: running/started
- code-server: running/started
- Browser: opened

Remind them:

- After code changes, reload the browser window (Cmd+R or Cmd+Shift+P → "Developer: Reload Window")
- Watch mode auto-rebuilds on save
- Use `bun run compile:quiet` if watch gets confused
