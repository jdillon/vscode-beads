# Reload Action

Hard reload the browser with cache bypass. Useful after rebuilding the extension.

## Arguments

- `--devtools` - Do a full page close/reopen instead of just reload (recovers from MCP disconnection)

## Without --devtools (default)

Use `mcp__chrome-devtools__navigate_page` with:
- `type`: `"reload"`
- `ignoreCache`: `true`

This bypasses browser cache, ensuring the latest extension code is loaded.

## With --devtools

If the `--devtools` flag is present, do a full page close/reopen instead of just reload. This recovers from MCP disconnection (e.g., if you opened DevTools manually).

1. First, get the code-server port:
   ```bash
   PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
   cat "/tmp/vscode-dev-${PROJECT_HASH}/port"
   ```
2. Try to close the existing page using `mcp__chrome-devtools__close_page` (ignore errors if it fails)
3. Open a fresh page using `mcp__chrome-devtools__new_page` with URL `http://127.0.0.1:{PORT}/`
4. Do a hard reload with `mcp__chrome-devtools__navigate_page` (type: reload, ignoreCache: true)

**Note**: The `--devtools` flag name is a hint that this is useful when DevTools caused the disconnect.
