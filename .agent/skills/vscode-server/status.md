# Status Action

Check this worktree's recorded processes, port, owner, symlink, workspace, and
browser URL without starting or adopting anything.

Run the status script:

```bash
.agent/skills/vscode-server/scripts/status.sh
```

Treat `stale`, `other`, `missing`, or a non-ready port as not ready. Never fall
back to global process discovery.
