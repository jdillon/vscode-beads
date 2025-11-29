# Start code-server session with Chrome DevTools

Start a code-server instance and open it in Chrome for browser-based VS Code development.

## Instructions

1. Start code-server with authentication disabled:
```bash
code-server --auth none --bind-addr 127.0.0.1:8080 "$PWD" &
```

2. Wait for server to be ready (check port 8080)

3. Use Chrome DevTools MCP to navigate to http://127.0.0.1:8080

4. Take a snapshot to confirm the page loaded

## Notes
- code-server runs on port 8080 by default
- Auth is disabled for local dev (--auth none)
- Server runs in background (&)
- Kill with: `pkill -f "code-server.*8080"`
