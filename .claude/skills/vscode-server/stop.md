# Stop Action

Stop all running processes and clean up temp files.

## Stop processes and cleanup

```bash
PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
TMP_DIR="/tmp/vscode-dev-${PROJECT_HASH}"

pkill -f "bun run watch" && echo "Watch mode stopped" || echo "Watch mode was not running"
pkill -f "code-server" && echo "code-server stopped" || echo "code-server was not running"

# Clean up temp files
rm -rf "$TMP_DIR" && echo "Temp files cleaned up"
```

## Report

Tell the user what was stopped.
