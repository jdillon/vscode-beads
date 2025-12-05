# Context7 Documentation Hints

Quick reference for fetching up-to-date library documentation via Context7 MCP.

## Usage

Add `use context7` to prompts, or use library IDs directly for faster lookup.

## Libraries Used in vscode-beads

| Library | Context7 ID | Key Topics |
|---------|-------------|------------|
| TanStack Table | `/tanstack/table` | sorting, filtering, column-resize, globalFilterFn |
| React | `/facebook/react` | hooks, context, refs, effects |
| VS Code Extension API | `/microsoft/vscode` | webview, commands, events, TreeDataProvider |
| marked (markdown) | `/markedjs/marked` | parsing, rendering, options |

## Example Prompts

```
# Get TanStack Table sorting docs
use context7 /tanstack/table topic:sorting

# Get VS Code webview docs
use context7 /microsoft/vscode topic:webview

# React hooks reference
use context7 /facebook/react topic:hooks
```

## MCP Configuration

For Cursor (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

For Claude Code (`.mcp.json`):
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

## Alternative: GitMCP

TanStack also has docs via GitMCP: `https://gitmcp.io/TanStack/`

## Notes

- TanStack Table is **headless** - no built-in UI behaviors (menus, click-outside, etc.)
- VS Code webview communication is via `postMessage` - typed messages recommended
- marked v17+ has breaking changes from v4 - check migration guide

## Sources

- [Context7 GitHub](https://github.com/upstash/context7)
- [Context7 Official Site](https://context7.com/)
- [TanStack Table Docs](https://tanstack.com/table/latest)
- [GitMCP for TanStack](https://gitmcp.io/TanStack/)
