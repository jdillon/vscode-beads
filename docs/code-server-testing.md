# code-server Testing Environment

> **Living document for agents.** Keep updated with working commands, config, and lessons learned. Future SKILL candidate.

## Quick Start

```bash
# 1. Start watch mode (background) - auto-rebuilds on save
bun run watch &

# 2. Start code-server (no auth for local dev)
code-server --auth none .

# 3. Open browser (either MCP works — see Browser Automation below)
mcp__chrome-devtools__new_page url=http://127.0.0.1:8080/
# or: mcp__claude-in-chrome__navigate url=http://127.0.0.1:8080/

# 4. After code changes: just reload browser window
# Run: codeserver reload
```

## Browser Automation

Two MCP options, both verified working (2026-07):

| Need | chrome-devtools MCP | claude-in-chrome |
|---|---|---|
| Open page | `new_page` | `navigate` (or `tabs_create_mcp`) |
| Hard reload (cache bypass) | `navigate_page type=reload ignoreCache=true` | `computer key Cmd+Shift+R` |
| Console logs | `list_console_messages` | `read_console_messages pattern=<regex>` (filterable) |
| Screenshot / click | yes | yes (`computer`) |
| Browser instance | separate CDP Chrome — crashes if DevTools opened manually | user's real Chrome, no CDP conflict |

claude-in-chrome caveats:
- Needs extension site permission for `127.0.0.1`
- Extension host logs do NOT appear in page console — read from disk instead:
  `~/.local/share/code-server/logs/<session>/exthost*/planet57.vscode-beads/Beads.log`

## Workspace Trust (gotcha)

Fresh code-server sessions (and any workspace-folder addition) start in **Restricted Mode**
— the extension will not activate and the activity bar icon stays hidden. Click
"Restricted Mode" in the status bar → Trust. Trust persists per folder, but adding a new
folder to the workspace re-triggers Restricted Mode for the whole workspace.

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

Open either with `?folder=<FIXTURE_DIR>` (the absolute path the script prints) and
accept the workspace-trust prompt.

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

1. **Start watch mode first** (background task) - keeps it running for the session
2. **Start code-server** (background task)
3. **Confirm the symlink target** (see below) — this is the #1 source of false passes
4. **Build a fixture** with the state under test
5. **Open browser** via Chrome DevTools MCP
6. **After edits**: just reload the browser window - no manual compile needed
7. **Check watch output** if changes aren't appearing (may need restart after new files)

Before trusting any UI result, confirm the change is actually in the running
build — e.g. `grep -c "<new string>" dist/extension.js`. A UI that looks
unchanged is more often a stale/mispointed build than a broken fix.

## Setup

### Extension Symlink

Extension installed via symlink to pick up changes on reload:

```bash
# Location (from project root)
~/.local/share/code-server/extensions/planet57.vscode-beads-dev -> $(pwd)

# Create or REPOINT the symlink (-n is required — see warning below)
ln -sfn "$(pwd)" ~/.local/share/code-server/extensions/planet57.vscode-beads-dev

# Always read back — the link is global, but worktrees are not
readlink ~/.local/share/code-server/extensions/planet57.vscode-beads-dev
```

> **Multiple worktrees share one symlink.** It points at whichever worktree set
> it last. If it points elsewhere, code-server silently tests *that* worktree's
> build and your changes appear to have no effect — a false pass, not a bug.
> `start-dev-environment.sh` now repoints and verifies automatically.
>
> **Never use `ln -sf` without `-n` here.** On BSD/macOS, `ln -sf` applied to an
> existing symlink-to-directory dereferences it and creates the new link *inside*
> the old target rather than repointing it — leaving the stale target in place
> while appearing to succeed. `-n` prevents that; `ln -sfn` is the correct idiom.

### Config

Default config at `~/.config/code-server/config.yaml` uses password auth. Override with `--auth none` flag.

```yaml
# ~/.config/code-server/config.yaml
bind-addr: 127.0.0.1:8080
auth: password  # Override with --auth none
cert: false
```

## Commands

| Action | Command |
|--------|---------|
| Start (no auth) | `code-server --auth none .` |
| Start (custom port) | `code-server --auth none --bind-addr 127.0.0.1:3000 .` |
| Build extension | `bun run compile:quiet` |
| Watch mode | `bun run watch` |
| Reload window | `codeserver reload` ← cheap! (vs Cmd+Shift+P → "Developer: Reload Window") |

## Workflow

### Recommended: Background Watch Mode

Run `bun run watch` as a background task - esbuild auto-rebuilds on file save. Only reload the browser window to pick up changes.

```bash
# Start watch in background (agent manages this)
bun run watch &

# After code changes: just reload browser window
# Run: codeserver reload
```

**Benefits:**
- Saves context (no repeated `bun run compile:quiet` calls)
- Fast iteration - changes rebuild in ~50ms
- Only need full rebuild (`bun run compile`) if watch gets confused

### Manual Build (fallback)

1. Start code-server: `code-server --auth none .`
2. Open http://127.0.0.1:8080
3. Make changes, run `bun run compile:quiet`
4. Reload window: `codeserver reload`
5. Test changes

Use manual builds when watch mode isn't running or after major changes (new files, config changes).

## Extensions Directory

- Path: `~/.local/share/code-server/extensions/`
- Manifest: `extensions.json` - tracks installed extensions
- Symlinked extensions use `-dev` suffix convention

## Troubleshooting

### Testing the wrong checkout (worktrees)
`readlink ~/.local/share/code-server/extensions/planet57.vscode-beads-dev` must point at the
checkout you are editing. `ln -sf` on an existing symlink-to-directory writes the new link
*inside* the old target instead of replacing it — use `ln -sfn` (the start script now does).

### Extension not loading
- Check symlink exists: `ls -la ~/.local/share/code-server/extensions/`
- Check `extensions.json` has entry
- Rebuild: `bun run compile:quiet`
- Full reload: restart code-server process

### Port in use
- Check: `lsof -i :8080`
- Use different port: `--bind-addr 127.0.0.1:3000`

## Notes

- `--auth none` safe for localhost only
- Symlink means no reinstall needed - just rebuild and reload
- Watch mode (`bun run watch`) + browser reload = fast iteration
