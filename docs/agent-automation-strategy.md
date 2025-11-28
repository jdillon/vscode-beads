# Agent Automation Strategy for VS Code Extension Development

## Current Stack

```
Chrome DevTools MCP + code-server (local, headed)
```

Agent can see and interact with VS Code running in browser. Human watches same window.

## Workflow

1. Agent writes/edits code
2. Agent runs build: `bun run compile`
3. Agent packages: `bun run package`
4. Agent installs: `code-server --install-extension *.vsix`
5. **Human reloads window** (saves ~120KB context per reload)
6. Limited DevTools MCP use for single-feature verification

## Context Cost Problem

Both Chrome DevTools MCP and Playwright MCP return full accessibility tree (~400 lines) after every action. This burns context fast.

**Current mitigations:**
- Human handles reloads
- Minimal MCP interactions
- Compact sessions frequently

**Future:** Build custom optimized tooling (see vsbeads-n64)

## Capabilities

| Capability | How |
|------------|-----|
| Extension install | `code-server --install-extension` |
| Window reload | Command palette (human) |
| Screenshots | `take_screenshot` |
| Console logs | `list_console_messages` |
| UI interaction | `click`, `fill`, `press_key` |
| Command palette | `press_key` Meta+Shift+P |

---

## Ruled Out Options

| Option | Why Ruled Out |
|--------|---------------|
| **vscode.dev** | No local extension support |
| **OpenVSCode Server (Docker)** | Unix socket blocked in container, bd CLI can't connect |
| **Playwright MCP** | Same context bloat as Chrome DevTools MCP |
| **Browser MCP** | Less capable than Chrome DevTools MCP |
| **@vscode/test-electron** | Tests API only, not visual UI |
| **F5 Dev Host** | Agent can't see/interact |
| **Headless + VNC** | Unnecessary complexity for local dev |

## References

- [code-server](https://github.com/coder/code-server)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Context optimization discussion](https://scottspence.com/posts/optimising-mcp-server-context-usage-in-claude-code)
