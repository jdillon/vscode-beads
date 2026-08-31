# Start Action

Start the current worktree's code-server environment and complete fixture-backed
browser readiness. Default to `--workspace fixture`; pass source, no-project, or
server fixture options only when explicitly requested.

1. Run `.agent/skills/vscode-server/scripts/start-dev-environment.sh` and wait
   for it to exit. It writes the same output to the printed `START_LOG` location
   (`STATE_DIR/start.log`), so runtimes that background the command can poll that
   file without a task-output API.
2. Require `BUILD:success`, validated watcher/server PIDs, `PORT:ready` from the
   status action, `FIXTURE_MODE:embedded`, `FIXTURE_BEADS:23`, a matching
   `SYMLINK_TARGET`, and `READY:true`. Stop on any `ERROR` marker.
3. Open the emitted `BROWSER_URL` in a background page with the available Chrome
   DevTools browser driver, then hard reload with cache bypass. Do not request
   `bringToFront` unless the user asks to see the browser. Never open the bare
   server root.
4. Verify the loaded URL/workspace is the emitted `WORKSPACE_DIR`. If Restricted
   Mode is shown, trust only the generated fixture or current repository; stop
   and ask for any other folder.
5. Read the current extension-host `Beads.log` and confirm `Activating` followed
   by `Extension activated` for this code-server session.
6. Open the Beads activity view. Assert Dashboard and Issues contain fixture
   data and capture a screenshot showing the populated UI before declaring the
   environment ready.

Use the browser capability adapter and full assertions in
`docs/code-server-testing.md`. Browser console output does not replace
extension-host logs.
