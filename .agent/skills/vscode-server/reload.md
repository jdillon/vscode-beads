# Reload Action

1. Run `.agent/skills/vscode-server/scripts/status.sh` and require a validated
   watcher, code-server process, ready port, matching symlink, and explicit
   `BROWSER_URL`.
2. Check `watch.log` for a successful rebuild after the latest change.
3. Select without `bringToFront`, or open `BROWSER_URL` in a background page in
   the isolated Chrome DevTools browser, then hard reload with cache bypass.
4. Verify the loaded workspace still matches `WORKSPACE_DIR`, then repeat the
   relevant populated UI assertion. Read browser console messages and the
   current extension-host `Beads.log` when diagnosing failures.

If the browser driver disconnected, restart the agent session/MCP server and
open the recorded URL again. Do not attach manual DevTools to the MCP target.
