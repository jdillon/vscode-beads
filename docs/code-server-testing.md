# code-server Testing Environment

> **Living document for agents.** Keep updated with working commands, config,
> and lessons learned. The `vscode-server` skill is the executable procedure;
> this document is the detailed test protocol.

## Quick Start

```bash
.agent/skills/vscode-server/scripts/start-dev-environment.sh
.agent/skills/vscode-server/scripts/status.sh
```

Startup builds the extension, starts or reuses this worktree's watcher and
code-server, recreates the embedded 23-bead fixture, and prints `BROWSER_URL`.
Open that exact `?folder=` URL in the isolated MCP Chrome; never open the bare
server root, which can restore an unrelated workspace. After changes, wait for
the watcher to rebuild and use a cache-bypassing browser reload.

## Browser Automation

The project pins Chrome DevTools MCP in both `.mcp.json` and `opencode.json`.
It launches an isolated Chrome profile, not the user's main Chrome. To avoid
interrupting the user's work, agents must always open pages with
`background: true` and select pages with `bringToFront: false`. Never foreground
the browser unless the user explicitly asks to see it or an unavoidable
interaction requires their attention; explain that requirement first. Ordinary
navigation, clicks, snapshots, screenshots, and console reads do not request
foreground activation. Chrome may still focus its window when the visible
browser process first launches because the MCP has no server-wide "visible but
never activate" option. OpenCode loads project MCP configuration at process
startup, so config changes require a fresh session.

| Capability | Chrome DevTools MCP | claude-in-chrome fallback |
|---|---|---|
| Open explicit URL | `new_page background=true` | `navigate` |
| Hard reload, cache bypass | `navigate_page type=reload ignoreCache=true` | `computer key Cmd+Shift+R` |
| Inspect UI | `take_snapshot` or DOM evaluation | `read_page` |
| Click | `click` | `computer` |
| Console messages | `list_console_messages` | `read_console_messages pattern=<regex>` |
| Screenshot | `take_screenshot` | `computer` |
| Browser instance | isolated MCP-owned Chrome | user's main Chrome |

Prefer Chrome DevTools MCP for this workflow. Do not open manual DevTools while
MCP owns the target; Chrome permits only one DevTools client and the MCP session
can disconnect.

The fallback needs extension site permission for `127.0.0.1`. With either
driver, extension-host logs do not appear in the page console. Read the newest
matching `~/.local/share/code-server/logs/<session>/exthost*/planet57.vscode-beads/Beads.log`.

## Workspace Trust

Fresh code-server sessions can start in **Restricted Mode**. The extension will
not activate and the activity icon stays hidden. An agent may grant trust
without asking only when the loaded folder exactly matches `WORKSPACE_DIR` and
is a fixture created by this repository's fixture script during the current
workflow. Trusting the current worktree requires explicit approval for that
checkout unless the user already granted it for this task. Stop and ask before
trusting any other folder. After trust changes reload the window, then confirm
`Activating` and `Extension activated` in the current `Beads.log`.

## Test Fixtures

**Build a fixture. Never mutate a real project's database to produce test data.**
A real database may not contain the states under test, and may be mid
schema-migration and refuse writes entirely (`beads#4566`) — which reads as "the
feature is broken" when it is really the fixture that is missing.

### Generated fixture (preferred)

```bash
.agent/skills/vscode-server/scripts/make-test-fixture.sh [--server] [target-dir]
# default target: tmp/bd-test-fixture
# prints FIXTURE_DIR:<path>, FIXTURE_MODE:<embedded|server>, FIXTURE_BEADS:<count>
```

Destroys and recreates the target, so it is safe to re-run. 23 beads covering:

- every bd built-in status (`open`, `in_progress`, `blocked`, `deferred`,
  `pinned`, `hooked`, `closed`) plus a user-defined one via `status.custom`
- every issue type the extension styles, plus `gate` and `message` — the types
  bd hides from a default `bd list`, which must stay out of the UI too
- all four dependency types (`blocks`, `parent-child`, `related`,
  `discovered-from`) and an epic with two children
- priorities P0–P4, three assignees plus unassigned beads
- a fully populated bead: markdown description (headings, list, code fence,
  link, blockquote), design, acceptance criteria, notes, three labels,
  estimate, external ref, due date, two comments from different authors

Without `--server` the fixture uses embedded Dolt, routing through the **CLI
backend**. With `--server` bd runs a real `dolt sql-server`, routing through the
**Dolt SQL backend**. The two backends have separate query paths and have
diverged before (#79, F2/F4 of the bd 1.1.2 audit), so a release check needs
both:

```bash
.agent/skills/vscode-server/scripts/make-test-fixture.sh tmp/bd-release-fixture
.agent/skills/vscode-server/scripts/make-test-fixture.sh --server tmp/bd-release-fixture-server
```

Stop a server fixture with `bd dolt stop` from its directory when done; re-running
the script against the same path does this for you.

Fixtures live in the repo's gitignored `tmp/`. Relative targets resolve against the
current directory, so run the script from the repo root. The script pins `BEADS_DIR`
to the fixture's own `.beads` before `bd init` — without that, a fixture created
inside another beads project inherits that project's config and comes up in
shared-server mode, so the "embedded" fixture would not actually be embedded.

Open either with the URL-encoded `?folder=<FIXTURE_DIR>` URL emitted by startup.

### Release verification pass

Against both fixtures, checking Dashboard, Issues and Details:

| Check | Expected |
|---|---|
| Bead count | 23 total; `gate` and `message` beads absent from the issue list |
| Dashboard BY STATUS | all 8 statuses listed, badge and bar colors agree, fills proportional |
| Type icons | every type renders its own icon and color, none fall back to a blank |
| Filters | status chips include deferred/pinned/hooked; custom `awaiting_review` filterable |
| Details → rich bead | markdown renders; design, acceptance, notes sections present; labels, assignee, estimate, external ref in header |
| Details → dependencies | BLOCKS, related, discovered-from and parent-child all render; dependents ("blocked by") non-empty |
| Details → dropdowns | status dropdown on the `awaiting_review` bead shows its own value as selected |
| Details → comments | rich bead shows 2 comments with distinct authors |
| Kanban | columns derived from data, including the custom status |

### Demo fixture (screenshots)

```bash
.agent/skills/vscode-server/scripts/make-demo-fixture.sh [--server] [target-dir]
# default target: tmp/bd-demo-fixture
```

Same coverage as the test fixture — every status including a custom one, every
styled issue type, all dependency kinds, a markdown-heavy Details panel — but the
titles read like a product backlog ("Orbit", prefix `orbit-`), so the output is
usable in the README and marketplace listing. Use it, not the test fixture, for
anything a user will see.

For screenshots, create it at a neutral path (`/tmp/orbit-app`): the Dashboard
prints PROJECT DIR verbatim, so a fixture under the repo leaks the local checkout
path into the image.

### Long-lived fixtures in `beads-test.code-workspace`

- `~/ws/jdillon/beads-fixture` — shared Dolt server mode, bd 1.1.0+ schema
  (`depends_on_issue_id`), issues with a `blocks` dependency
- `~/ws/jdillon/beads-fixture-embedded` — embedded Dolt mode, 1 open + 1 closed issue
  (exercises CLI backend routing and the `All` filter)
- `example-project` — pre-1.1 schema (`depends_on_id`), per-project Dolt server

Throwaway fixture for the "no project found" path (#76) — folder with no `.beads` and a
`beads.pathToBd` that does not resolve:

```bash
mkdir -p tmp/beads-fixture-noproject/.vscode
echo '{"beads.pathToBd": "tools/bd"}' > tmp/beads-fixture-noproject/.vscode/settings.json
# open via http://127.0.0.1:<port>/?folder=<repo>/tmp/beads-fixture-noproject
```

Expected: Dashboard and Issues show "No Beads project found" (no spinner), and Beads.log
warns about the unresolved `beads.pathToBd` and the failed `bd where` probe.

### Agent Protocol

When testing with code-server, agents should:

1. Run `start-dev-environment.sh`; default startup owns fixture creation.
2. Require `BUILD:success`, `FIXTURE_MODE:embedded`, `FIXTURE_BEADS:23`,
   `READY:true`, and matching owner/symlink/worktree state.
3. Run `status.sh` and require validated watcher/server PIDs and `PORT:ready`.
4. Open the exact emitted `BROWSER_URL` in the isolated MCP Chrome.
5. Confirm the loaded URL/workspace is the emitted `WORKSPACE_DIR`.
6. Resolve trust only under the safe-folder policy above.
7. Confirm extension activation in the current `Beads.log`.
8. Open Beads and assert populated Dashboard and Issues state, then capture a
   screenshot as readiness evidence.
9. After edits, wait for successful watcher output and hard reload with cache
   bypass. Check both browser console messages and `Beads.log` on failures.
10. Run `stop.sh` when done; it never stops unrecorded or foreign processes.

Before trusting any UI result, confirm the change is actually in the running
`dist` build. A UI that looks unchanged is more often a stale or mispointed
build than a broken fix.

## Setup

### Ownership and Extension Symlink

Extension installed via symlink to pick up changes on reload:

```bash
# Location (from project root)
~/.local/share/code-server/extensions/planet57.vscode-beads-dev -> $(pwd)

# Manual recovery only; normal startup owns this operation
ln -sfn "$(pwd)" ~/.local/share/code-server/extensions/planet57.vscode-beads-dev

# Always read back — the link is global, but worktrees are not
readlink ~/.local/share/code-server/extensions/planet57.vscode-beads-dev
```

> **Multiple worktrees share one symlink.** Startup records a single owner in
> `/tmp/vscode-beads-dev-owner` and refuses to repoint the link while another
> validated worktree environment is live. The error names the owner and its
> stop command. Stop that owner explicitly, then retry; there is no silent
> takeover mode.
>
> **Never use `ln -sf` without `-n` here.** On BSD/macOS, `ln -sf` applied to an
> existing symlink-to-directory dereferences it and creates the new link *inside*
> the old target rather than repointing it — leaving the stale target in place
> while appearing to succeed. `-n` prevents that; `ln -sfn` is the correct idiom.

### Config

The lifecycle script overrides local config with `--auth none` and a dynamic
localhost port. Fixed port `8080` examples below apply only to manual debugging.

```yaml
# ~/.config/code-server/config.yaml
bind-addr: 127.0.0.1:8080
auth: password  # Override with --auth none
cert: false
```

## Commands

| Action | Command |
|--------|---------|
| Managed start | `.agent/skills/vscode-server/scripts/start-dev-environment.sh` |
| Managed status | `.agent/skills/vscode-server/scripts/status.sh` |
| Managed stop | `.agent/skills/vscode-server/scripts/stop.sh` |
| Manual start on 8080 | `code-server --auth none --bind-addr 127.0.0.1:8080` |
| Build extension | `bun run compile:quiet` |
| Watch mode | `bun run watch` |
| Reload window | Browser-driver hard reload with cache bypass |

## Workflow

### Recommended: Managed Watch Mode

Startup records the watcher PID and logs output in the emitted `STATE_DIR`.
After a source change, verify the latest rebuild in `watch.log`, then hard reload
the browser with cache bypass. A full compile is only needed when watch mode
cannot pick up a structural change.

### Manual Build (fallback)

1. Start code-server: `code-server --auth none --bind-addr 127.0.0.1:8080`
2. Open `http://127.0.0.1:8080/?folder=<url-encoded-absolute-fixture-path>`
3. Make changes, run `bun run compile:quiet`
4. Hard reload with cache bypass through the browser driver
5. Test changes

Use manual builds when watch mode isn't running or after major changes (new files, config changes).

## Extensions Directory

- Path: `~/.local/share/code-server/extensions/`
- Manifest: `extensions.json` - tracks installed extensions
- Symlinked extensions use `-dev` suffix convention

## Troubleshooting

### Testing the wrong checkout (worktrees)
Run `status.sh`. `OWNER:other`, `SYMLINK:other`, or mismatched
`WORKSPACE_DIR`/URL means the UI is not testing this checkout. Stop the named
owner instead of repointing the global link beneath a live server.

### Extension not loading
- Check symlink exists: `ls -la ~/.local/share/code-server/extensions/`
- Check `extensions.json` has entry
- Rebuild: `bun run compile:quiet`
- Confirm workspace trust and activation in `Beads.log`
- Stop and restart the managed environment if reload cannot recover it

### Stale state

`status.sh` reports recorded but invalid PIDs and unresponsive ports as
`stale`. `stop.sh` never signals stale PID values because they may have been
reused by unrelated processes. After reporting `stale-not-stopped`, it removes
the state directory as long as every validated process stopped successfully.
Inspect logs before running `stop.sh` when diagnosing stale state.

## Notes

- `--auth none` is safe for localhost only.
- The managed port is dynamic; always consume `CODE_SERVER_PORT` or
  `BROWSER_URL` from current state.
- Source and no-project checks are explicit modes:
  `--workspace source` and `--workspace no-project`.
