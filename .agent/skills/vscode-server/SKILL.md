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
- `scripts/make-test-fixture.sh` - Build a throwaway beads project covering every
  status and issue type (see Test Data below)

## Test Data

Build a fixture; never mutate a real project's database to create test state.
A real database may lack the states under test, or be mid schema-migration and
refuse writes, which looks like a broken feature.

```bash
.agent/skills/vscode-server/scripts/make-test-fixture.sh   # -> /tmp/bd-test-fixture
```

Open with `?folder=<FIXTURE_DIR>`. Embedded Dolt (CLI backend) by default;
re-init with `--server` for the Dolt SQL backend.

## Symlink Is Global, Worktrees Are Not

One symlink (`planet57.vscode-beads-dev`) serves every worktree and points at
whichever one set it last. If it points at another worktree, code-server tests
*that* build and your changes appear to do nothing — a false pass. The start
script repoints and verifies, emitting `SYMLINK_TARGET:<path>`; confirm it
matches the worktree under test. Never repoint with `ln -sf` (BSD dereferences
an existing symlink-to-dir and links *inside* it); use `rm -f` then `ln -sn`.

## DevTools Note

Chrome only allows one DevTools client at a time. If you manually open DevTools (F12) while chrome-devtools-mcp is connected, the MCP will crash/disconnect.

**Workaround**: Configure MCP with `--devtools` flag to launch Chrome with DevTools already open.

## Alternative: claude-in-chrome MCP

The claude-in-chrome extension covers the same workflow in the user's real Chrome (no CDP conflict): `navigate` to open, `computer key Cmd+Shift+R` for hard reload, `read_console_messages pattern=<regex>` for filtered console. Needs site permission for `127.0.0.1`. Extension host logs are NOT in the page console — read `~/.local/share/code-server/logs/<session>/exthost*/planet57.vscode-beads/Beads.log`.

## Workspace Trust

Fresh sessions and workspace-folder additions start in Restricted Mode — extension won't activate until trusted. Click "Restricted Mode" status-bar item → Trust. See `docs/code-server-testing.md`.
