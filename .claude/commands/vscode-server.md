---
description: "Manage code-server for extension testing: start|stop|status (project)"
allowed-tools: Bash, Read, TaskOutput, mcp__chrome-devtools__new_page, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__close_page
---

Manage code-server development environment for testing VS Code extensions.

**Usage**: `/vscode-server [start|stop|reload|status]`

- `start` (default) - Start code-server and watch mode
- `stop` - Stop code-server and watch mode
- `reload [--devtools]` - Hard reload browser (cache bypass). With `--devtools`, closes and reopens the page (useful if MCP disconnected)
- `status` - Show current status of processes

**Arguments**: $ARGUMENTS

## Temp Directory

Temp files are stored in `/tmp/vscode-dev-<hash>/` where hash is derived from project path:

```bash
PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
TMP_DIR="/tmp/vscode-dev-${PROJECT_HASH}"
```

Files:
- `$TMP_DIR/port` - code-server port
- `$TMP_DIR/watch.pid` - watch mode PID
- `$TMP_DIR/watch.log` - watch mode output

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

## Instructions

Parse the argument (default to "start" if empty or not provided).

---

## Command: status

Check the status of all processes without starting anything.

### Check processes

```bash
PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
TMP_DIR="/tmp/vscode-dev-${PROJECT_HASH}"

echo "=== Watch Mode ==="
if pgrep -f "bun run watch" > /dev/null; then
  PID=$(cat "$TMP_DIR/watch.pid" 2>/dev/null || pgrep -f "bun run watch" | head -1)
  echo "Running (PID: $PID)"
else
  echo "Not running"
fi

echo "=== code-server ==="
if pgrep -f "code-server" > /dev/null; then
  PORT=$(cat "$TMP_DIR/port" 2>/dev/null || echo "unknown")
  echo "Running (Port: $PORT)"
else
  echo "Not running"
fi
```

### Report status

Tell the user the current state of:

- Watch mode: running/not running (with PID if running)
- code-server: running/not running (with port if running)

Then stop (don't execute start or stop commands).

---

## Command: stop

Stop all running processes and clean up temp files.

### Stop processes and cleanup

```bash
PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
TMP_DIR="/tmp/vscode-dev-${PROJECT_HASH}"

pkill -f "bun run watch" && echo "Watch mode stopped" || echo "Watch mode was not running"
pkill -f "code-server" && echo "code-server stopped" || echo "code-server was not running"

# Clean up temp files
rm -rf "$TMP_DIR" && echo "Temp files cleaned up"
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

1. First, get the code-server port:
   ```bash
   PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
   cat "/tmp/vscode-dev-${PROJECT_HASH}/port"
   ```
2. Try to close the existing page using `mcp__chrome-devtools__close_page` (ignore errors if it fails)
3. Open a fresh page using `mcp__chrome-devtools__new_page` with URL `http://127.0.0.1:{PORT}/`
4. Do a hard reload with `mcp__chrome-devtools__navigate_page` (type: reload, ignoreCache: true)

**Note**: The `--devtools` flag name is a hint that this is useful when DevTools caused the disconnect. The actual DevTools panel opening depends on your MCP server config.

---

## Command: start

Start code-server development environment for testing the current VS Code extension.

### Step 1: Run the startup script

Run the comprehensive startup script:

```bash
.claude/scripts/start-dev-environment.sh
```

Use `run_in_background: true` for this command.

Wait 4 seconds for everything to start up.

### Step 2: Get results from script output

Read the background task output using `TaskOutput` with `block: false`. Parse the structured output:

- `EXTENSION_ID:<id>` - The extension identifier
- `SYMLINK:<created|verified>` - Symlink status
- `BUILD:<success|failed>` - Build result
- `WATCH_PID:<pid>` - Watch mode process ID
- `CODE_SERVER_PORT:<port>` - The port to use for browser
- `ERROR:<message>` - If present, something failed

If `ERROR:` is present, report the error and stop.

If `CODE_SERVER_PORT:` not found yet, wait another second and retry (up to 3 retries).

### Step 3: Open browser with Chrome DevTools MCP

Use the `mcp__chrome-devtools__new_page` tool to open:

- URL: `http://127.0.0.1:{PORT}/` (use the port from step 2)

Then immediately do a hard reload to bypass cache:

Use `mcp__chrome-devtools__navigate_page` with:
- `type`: `"reload"`
- `ignoreCache`: `true`

### Step 4: Report status

Tell the user:

- Extension: `{EXTENSION_ID}`
- Symlink: {SYMLINK status}
- Build: {BUILD status}
- Watch mode: running (PID: {WATCH_PID})
- code-server: running on port {PORT}
- Browser: opened at `http://127.0.0.1:{PORT}/`

Remind them:

- After code changes, reload the browser (Cmd+R or `/vscode-server reload`)
- Watch mode auto-rebuilds on save
