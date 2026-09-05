# Start Action

Start the current worktree's code-server environment and complete fixture-backed
browser readiness. Default to `--workspace fixture`; pass source, no-project, or
server fixture options only when explicitly requested.

1. Run `.agents/skills/vscode-server/scripts/start-dev-environment.sh` and wait
   for it to exit. It writes the same output to the printed `START_LOG` location
   (`STATE_DIR/start.log`), so runtimes that background the command can poll that
   file without a task-output API.
2. Run `.agents/skills/vscode-server/scripts/status.sh`, then require
   `BUILD:success`, validated watcher/server PIDs, `PORT:ready`, a matching
   `WORKSPACE_MODE` and `SYMLINK_TARGET`, and `READY:true`. Stop on any `ERROR`
   marker.
3. For fixture mode, require `FIXTURE_MODE` to match embedded or server mode and
   require `FIXTURE_BEADS:23`. Source and no-project modes do not emit fixture
   markers.
4. Open the emitted `BROWSER_URL` in a background page with the available Chrome
   DevTools browser driver, then hard reload with cache bypass. Do not request
   `bringToFront` unless the user asks to see the browser. Never open the bare
   server root.
5. Verify the loaded URL/workspace is the emitted `WORKSPACE_DIR`. If Restricted
   Mode is shown, trust a generated fixture without asking. Require explicit
   approval for the current repository unless the user already granted it for
   this task; stop and ask for any other folder.
6. Read the current extension-host `Beads.log` and confirm `Activating` followed
   by `Extension activated` for this code-server session.
7. Open the Beads activity view and capture a screenshot. For fixture modes,
   assert Dashboard and Issues contain the 23-bead fixture data. For no-project
   mode, assert the "No Beads project found" state. For source mode, assert the
   project state requested by the task.

Use the browser capability adapter and full assertions in
`docs/code-server-testing.md`. Browser console output does not replace
extension-host logs.
