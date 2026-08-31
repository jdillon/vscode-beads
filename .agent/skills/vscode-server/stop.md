# Stop Action

Stop only processes recorded and validated for the current worktree, then remove
its state and owner lock.

Run the stop script:

```bash
.agent/skills/vscode-server/scripts/stop.sh
```

If a PID is stale or belongs to another command/worktree, report it and leave
that process untouched.
