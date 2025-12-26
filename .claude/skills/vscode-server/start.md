# Start Action

Start code-server development environment for testing the current VS Code extension.

## Step 1: Run the startup script

Run the comprehensive startup script:

```bash
.claude/skills/vscode-server/scripts/start-dev-environment.sh
```

Use `run_in_background: true` for this command.

Wait 4 seconds for everything to start up.

## Step 2: Get results from script output

Read the background task output using `TaskOutput` with `block: false`. Parse the structured output:

- `EXTENSION_ID:<id>` - The extension identifier
- `SYMLINK:<created|verified>` - Symlink status
- `BUILD:<success|failed>` - Build result
- `WATCH_PID:<pid>` - Watch mode process ID
- `CODE_SERVER_PORT:<port>` - The port to use for browser
- `ERROR:<message>` - If present, something failed

If `ERROR:` is present, report the error and stop.

If `CODE_SERVER_PORT:` not found yet, wait another second and retry (up to 3 retries).

## Step 3: Open browser with Chrome DevTools MCP

Use the `mcp__chrome-devtools__new_page` tool to open:

- URL: `http://127.0.0.1:{PORT}/` (use the port from step 2)

Then immediately do a hard reload to bypass cache:

Use `mcp__chrome-devtools__navigate_page` with:
- `type`: `"reload"`
- `ignoreCache`: `true`

## Step 4: Report status

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
