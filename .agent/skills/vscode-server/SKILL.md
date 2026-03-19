---
name: vscode-server
description: "USE THIS SKILL for all /vscode-server:* commands"
allowed-tools: Bash, Read, TaskOutput, mcp__chrome-devtools__new_page, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__close_page
---

# VS Code Server Skill

Manage code-server development environment for testing VS Code extensions.

## Action Routing

| Action     | File        |
| ---------- | ----------- |
| **start**  | `start.md`  |
| **stop**   | `stop.md`   |
| **reload** | `reload.md` |
| **status** | `status.md` |

Read the file, then follow its instructions.

## Commands

| Command                              | Action |
| ------------------------------------ | ------ |
| `/vscode-server:start`               | start  |
| `/vscode-server:stop`                | stop   |
| `/vscode-server:reload [--devtools]` | reload |
| `/vscode-server:status`              | status |

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

## Helper Scripts

- `scripts/start-dev-environment.sh` - Start symlink, build, watch, and code-server
- `scripts/status.sh` - Show status of watch mode and code-server
- `scripts/stop.sh` - Stop all processes and clean up temp files
- `scripts/get-port.sh` - Get the code-server port from temp file

## DevTools Note

Chrome only allows one DevTools client at a time. If you manually open DevTools (F12) while chrome-devtools-mcp is connected, the MCP will crash/disconnect.

**Workaround**: Configure MCP with `--devtools` flag to launch Chrome with DevTools already open.
