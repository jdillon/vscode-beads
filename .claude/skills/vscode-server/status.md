# Status Action

Check the status of all processes without starting anything.

## Check processes

```bash
PROJECT_HASH=$(echo "$(pwd)" | md5sum | cut -c1-8)
TMP_DIR="/tmp/vscode-dev-${PROJECT_HASH}"

echo "=== Watch Mode ==="
if pgrep -f "bun run watch" > /dev/null; then
  PID=$(cat "$TMP_DIR/watch.pid" 2>/dev/null || pgrep -f "bun run watch" | head -1)
  echo "Running (PID: $PID)"
else
  echo "Not running"
fi

echo "=== code-server ==="
if pgrep -f "code-server" > /dev/null; then
  PORT=$(cat "$TMP_DIR/port" 2>/dev/null || echo "unknown")
  echo "Running (Port: $PORT)"
else
  echo "Not running"
fi
```

## Report status

Tell the user the current state of:

- Watch mode: running/not running (with PID if running)
- code-server: running/not running (with port if running)
