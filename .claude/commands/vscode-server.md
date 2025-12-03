---
description: "Manage code-server for extension testing: start|stop|status"
allowed-tools: Bash, Read, mcp__chrome-devtools__new_page, mcp__chrome-devtools__list_pages
---

Manage code-server development environment for testing VS Code extensions.

**Usage**: `/vscode-server [start|stop|status]`

- `start` (default) - Start code-server and watch mode
- `stop` - Stop code-server and watch mode
- `status` - Show current status of processes

**Arguments**: $ARGUMENTS

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
