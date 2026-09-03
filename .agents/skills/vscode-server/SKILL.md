---
name: vscode-server
description: Start, stop, reload, inspect, or test the project's code-server extension environment.
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

## Invocation

Invoke the `vscode-server` skill with one action: `start`, `stop`, `reload`, or
`status`. Claude uses `/vscode-server <action>`; Codex uses
`$vscode-server <action>`. Other agents should invoke the skill through their
native skill interface.

## Temp Directory

Temp files are stored in `/tmp/vscode-dev-<hash>/`, where the hash is derived
from the canonical project path. Consume the exact `STATE_DIR` printed by the
scripts instead of recomputing it.

Important files:

- `start.log` - startup markers and errors
- `watch.log`, `watch.pid` - watcher output and validated owner PID
- `code-server.log`, `code-server.pid` - server output and validated owner PID
- `port` - validated code-server port
- `browser-url` - explicit URL for the selected workspace

## Helper Scripts

- `scripts/start-dev-environment.sh` - Start symlink, build, watch, and code-server
- `scripts/status.sh` - Show status of watch mode and code-server
- `scripts/stop.sh` - Stop validated processes owned by this worktree
- `scripts/get-port.sh` - Validate and report the port and browser URL
- `scripts/make-test-fixture.sh` - Build a throwaway beads project covering every
  status and issue type

The `.agents` skill and scripts are canonical. `.claude/skills` is a
compatibility link; do not create provider-specific copies.

## Test Protocol

Default startup recreates the canonical embedded 23-bead fixture. Source and
no-project workspaces require `--workspace source` or `--workspace no-project`.
Use `--server` for the Dolt SQL fixture. Follow
`docs/code-server-testing.md` for trust policy, browser capability adapters,
readiness assertions, logs, and release coverage.

## Symlink Is Global, Worktrees Are Not

One symlink (`planet57.vscode-beads-dev`) serves every worktree. The scripts use
a global owner lock and fail instead of taking over a live environment. Startup
repoints with `ln -sfn`, reads the link back, and emits `SYMLINK_TARGET`; confirm
it matches the worktree under test.

## DevTools Note

Chrome allows only one DevTools client per target. Do not open manual DevTools
while MCP controls its isolated Chrome. Follow
`.agents/rules/browser-automation.md`. Use browser capabilities, not an
agent-specific tool spelling: open URL, hard reload with cache bypass, inspect
DOM/accessibility state, click, read console messages, and capture screenshots.

## Workspace Trust

Trust only a fixture generated during the current workflow without asking. For
the current repository, require explicit approval to trust that exact checkout
unless the user already granted it for this task. Stop and ask before trusting
any other folder. Extension-host logs, not the browser console, prove
activation; see `docs/code-server-testing.md`.
