# Zed Editor Port Analysis

Analysis of porting vscode-beads to Zed's extension system.

## Executive Summary

Porting vscode-beads to Zed is **not currently feasible** due to fundamental limitations in Zed's extension API. Unlike VS Code's rich webview-based extension model, Zed extensions are sandboxed WebAssembly modules with **no UI capabilities beyond text output**. Zed's extension system is designed for language support, themes, and AI integrations—not custom tool windows or interactive panels.

| Aspect | VS Code | Zed |
|--------|---------|-----|
| Extension Runtime | Node.js (full access) | WebAssembly (sandboxed) |
| UI Capabilities | Webviews, tree views, panels | None (text output only) |
| CLI Integration | Full child_process | Limited process:exec capability |
| Custom Panels | Yes (full React/HTML) | No |
| Status Bar | Yes | No |
| Configuration UI | Yes | JSON only |

**Recommendation**: Wait for Zed to expose UI extension points, or contribute to Zed core. Current extension model cannot support vscode-beads functionality.

---

## Table of Contents

1. [Zed Architecture Overview](#zed-architecture-overview)
2. [Extension System Capabilities](#extension-system-capabilities)
3. [What Extensions Can Do](#what-extensions-can-do)
4. [What Extensions Cannot Do](#what-extensions-cannot-do)
5. [vscode-beads Feature Mapping](#vscode-beads-feature-mapping)
6. [Alternative Approaches](#alternative-approaches)
7. [Effort Estimates](#effort-estimates)
8. [Recommendation](#recommendation)

---

## Zed Architecture Overview

### Core Technology Stack

Zed is built from scratch in Rust for performance, using a custom UI framework called GPUI:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Zed Architecture                            │
├─────────────────────────────────────────────────────────────────┤
│  GPUI (GPU-accelerated UI Framework)                            │
│  ├── Rust-based declarative UI (Tailwind-like styling)         │
│  ├── Flexbox layout                                              │
│  └── Direct GPU rendering via Metal/Vulkan                      │
├─────────────────────────────────────────────────────────────────┤
│  Core Editor                                                     │
│  ├── Tree-sitter for parsing                                    │
│  ├── LSP for language features                                  │
│  └── Native Git integration                                      │
├─────────────────────────────────────────────────────────────────┤
│  Extension Host                                                  │
│  ├── WebAssembly sandbox (WASI)                                 │
│  ├── Limited capability-based permissions                       │
│  └── No UI access                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **No webviews**: Zed explicitly avoids Electron/Chromium. All UI is native Rust/GPUI.
2. **WebAssembly extensions**: Extensions compile to WASM, run in sandbox with limited host access.
3. **Capability-gated permissions**: Extensions must declare and be granted capabilities (process exec, file download, npm install).
4. **Text-first design**: Extensions primarily output text/content, not custom UI.

### GPUI UI Framework

Zed's internal UI uses GPUI with a Tailwind-inspired API:

```rust
// Internal Zed UI code (NOT available to extensions)
impl Render for ContextPicker {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        v_flex()
            .w(px(400.))
            .gap_2()
            .p_4()
            .bg(cx.theme().colors().panel_background)
            .border_1()
            .child(Label::new("Pick context..."))
    }
}
```

**Critical limitation**: This GPUI API is internal to Zed. Extensions cannot create custom UI elements.

---

## Extension System Capabilities

### Extension Types Supported

| Extension Type | Description | Relevant to Beads? |
|----------------|-------------|-------------------|
| **Languages** | Syntax highlighting, LSP integration | No |
| **Debuggers** | DAP adapter integration | No |
| **Themes** | Color schemes | No |
| **Icon Themes** | File icons | No |
| **Slash Commands** | AI assistant commands | Partial (text output only) |
| **Agent Servers** | AI agent via ACP protocol | No |
| **MCP Servers** | Model Context Protocol servers | Partial (tool integration) |

### Extension Structure

```
my-extension/
  extension.toml          # Manifest
  Cargo.toml              # Rust crate config
  src/
    lib.rs                # WebAssembly entry point
  languages/              # Language definitions (optional)
  themes/                 # Theme definitions (optional)
```

### Extension API (zed_extension_api crate)

The `zed_extension_api` Rust crate provides:

```rust
use zed_extension_api as zed;

struct MyExtension {}

impl zed::Extension for MyExtension {
    fn new() -> Self { Self {} }

    // Language server lifecycle
    fn language_server_command(...) -> Result<Command, String>;

    // Slash command execution (text output only)
    fn run_slash_command(...) -> Result<SlashCommandOutput, String>;
    fn complete_slash_command_argument(...) -> Result<Vec<SlashCommandArgumentCompletion>, String>;
}

zed::register_extension!(MyExtension);
```

### Capability System

Extensions must declare capabilities in `extension.toml`:

```toml
# Capability examples
[capabilities]
process_exec = { command = "bd", args = ["**"] }
download_file = { host = "github.com", path = ["**"] }
npm_install = { package = "*" }
```

Users can restrict these in settings:

```json
{
  "granted_extension_capabilities": [
    { "kind": "process:exec", "command": "bd", "args": ["**"] }
  ]
}
```

---

## What Extensions Can Do

### 1. Slash Commands (AI Assistant Integration)

Extensions can add `/slash` commands to the AI assistant:

```toml
# extension.toml
[slash_commands.beads-list]
description = "List all beads in the project"
requires_argument = false
```

```rust
// lib.rs
impl zed::Extension for BeadsExtension {
    fn run_slash_command(
        &self,
        command: SlashCommand,
        args: Vec<String>,
        worktree: Option<&Worktree>,
    ) -> Result<SlashCommandOutput, String> {
        match command.name.as_str() {
            "beads-list" => {
                // Execute bd list --json
                let output = process::Command::new("bd")
                    .args(["list", "--json"])
                    .output()
                    .map_err(|e| e.to_string())?;

                let text = format!("## Current Beads\n\n{}", parse_beads(&output.stdout));

                Ok(SlashCommandOutput {
                    text,
                    sections: vec![SlashCommandOutputSection {
                        range: (0..text.len()).into(),
                        label: "Beads List".to_string(),
                    }],
                })
            }
            _ => Err("Unknown command".to_string()),
        }
    }
}
```

**Output**: Text rendered in the AI assistant panel (markdown supported).

### 2. MCP Server Integration

Extensions can bundle MCP (Model Context Protocol) servers:

```toml
# extension.toml
[context_servers.beads]
name = "Beads"

[context_servers.beads.targets.darwin-aarch64]
archive = "https://github.com/.../beads-mcp-darwin-arm64.tar.gz"
cmd = "./beads-mcp"
```

This allows AI tools to interact with beads through the MCP protocol.

### 3. Execute External Commands

With `process:exec` capability:

```rust
let output = process::Command::new("bd")
    .args(["show", "--json", bead_id])
    .current_dir(worktree.root_path())
    .output()?;
```

### 4. Download Files

With `download_file` capability:

```rust
zed::download_file("https://github.com/.../release.tar.gz", "bd-binary")?;
```

---

## What Extensions Cannot Do

### Critical Limitations for vscode-beads

| Feature | VS Code | Zed Extensions | Impact |
|---------|---------|----------------|--------|
| **Custom Tool Windows** | Webview panels | Not possible | Cannot show issues panel |
| **Tree Views** | Native tree API | Not possible | Cannot show hierarchical issue list |
| **Sidebar Panels** | Webview in sidebar | Not possible | Cannot dock beads panel |
| **Interactive Forms** | HTML forms in webview | Not possible | Cannot edit bead details |
| **Status Bar** | StatusBarItem API | Not possible | Cannot show daemon status |
| **Configuration UI** | Settings editor | JSON only | No visual settings |
| **File Decorations** | Decorator API | Not possible | Cannot annotate files with bead refs |
| **Custom Commands** | Command palette | Slash commands only | Limited to AI panel |
| **Event Subscriptions** | Workspace events | Not available | Cannot react to file saves |
| **State Persistence** | ExtensionContext.globalState | Not available | Cannot cache bead data |

### Why These Limitations Exist

1. **Security**: WASM sandbox prevents arbitrary UI injection
2. **Performance**: Zed prioritizes speed; webviews would compromise this
3. **Philosophy**: Zed favors native features over extension-based UI
4. **Maturity**: Extension system is relatively new, focused on languages first

---

## vscode-beads Feature Mapping

### Current vscode-beads Features

| Feature | vscode-beads Implementation | Zed Possibility |
|---------|----------------------------|-----------------|
| Issues Panel | Webview with React table | No - no custom UI |
| Bead Details | Webview with form editing | No - no forms |
| Quick Actions | Command palette + icons | Partial - slash commands |
| Daemon Status | Status bar widget | No - no status bar |
| Multi-project | Workspace folder detection | Unknown - limited worktree API |
| Filtering/Sorting | React state + UI controls | No - no interactive UI |
| Dashboard | Statistics webview | No - no charts/UI |
| Inline Notes | Editor decorations | No - no decorators |

### What Could Work via Slash Commands

A minimal beads integration via slash commands:

```
/beads-list              → Output markdown table of issues
/beads-show <id>         → Output bead details as markdown
/beads-create <title>    → Create new bead, output confirmation
/beads-status <id> <new> → Update status, output result
/beads-assign <id> <who> → Assign bead, output result
```

**Pros**:
- Works within existing extension model
- Integrates with AI workflows
- Can execute bd CLI commands

**Cons**:
- Text output only, no interactivity
- Must type commands, no browsing/clicking
- No persistent UI, output scrolls away
- No real-time updates

### What Could Work via MCP

An MCP server could expose beads operations as AI tools:

```json
{
  "tools": [
    {
      "name": "list_beads",
      "description": "List all beads in the project",
      "inputSchema": { "type": "object", "properties": {} }
    },
    {
      "name": "update_bead",
      "description": "Update a bead's status or assignee",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "status": { "type": "string" },
          "assignee": { "type": "string" }
        }
      }
    }
  ]
}
```

**Use case**: AI agent manages beads during coding conversations.

---

## Alternative Approaches

### Approach 1: Slash Commands Only

**Scope**: Minimal integration for AI-assisted bead management

**Implementation**:
```rust
// extension.toml
[slash_commands.beads]
description = "Interact with beads issue tracker"
requires_argument = true

// Commands: list, show <id>, create <title>, status <id> <status>
```

**Effort**: 1-2 weeks
**Value**: Low (text output only)

### Approach 2: MCP Server + Slash Commands

**Scope**: AI tools + slash commands for comprehensive CLI access

**Implementation**:
- Rust MCP server wrapping bd daemon
- Slash commands for quick access
- AI can manipulate beads in context

**Effort**: 3-4 weeks
**Value**: Medium (useful in AI workflows)

### Approach 3: Contribute to Zed Core

**Scope**: Add native beads support to Zed itself

**Implementation**:
- Fork Zed, add GPUI-based beads panel
- Integrate with Zed's project system
- Submit as core feature or optional module

**Effort**: 2-3 months (learning Zed codebase, GPUI)
**Value**: High (full native experience)

### Approach 4: Wait for Extension UI APIs

**Scope**: Monitor Zed development for UI extension capabilities

**Signals to watch**:
- GitHub issues/discussions requesting webview support
- Zed roadmap mentions of plugin UI
- New extension API additions

**Timeline**: Unknown (could be 6-12+ months)

---

## Effort Estimates

### Slash Commands Only

| Task | Effort |
|------|--------|
| Extension scaffolding | 1 day |
| bd CLI wrapper | 2-3 days |
| list/show/create commands | 2-3 days |
| Status/assign commands | 1-2 days |
| Testing | 2 days |
| Documentation | 1 day |
| **Total** | **1-2 weeks** |

### MCP Server + Slash Commands

| Task | Effort |
|------|--------|
| MCP server skeleton | 2-3 days |
| bd daemon integration | 3-5 days |
| Tool definitions | 2-3 days |
| Slash commands | 3-5 days |
| Extension packaging | 1-2 days |
| Testing | 3-5 days |
| Documentation | 1-2 days |
| **Total** | **3-4 weeks** |

### Zed Core Contribution

| Task | Effort |
|------|--------|
| Zed codebase familiarization | 2-3 weeks |
| GPUI learning | 1-2 weeks |
| Beads panel implementation | 3-4 weeks |
| Integration with project system | 1-2 weeks |
| Code review / iteration | 2-3 weeks |
| **Total** | **2-3 months** |

---

## Recommendation

### Short-term: Do Nothing

Zed's extension model cannot support vscode-beads functionality. The slash command approach provides minimal value compared to the VS Code experience.

**Rationale**:
- No UI = no value proposition over CLI
- Users can already use `bd` directly in Zed's terminal
- Slash commands add friction, not convenience

### Medium-term: Monitor Zed Development

Watch for:
1. Custom panel/view extension APIs
2. WebView-like capabilities (unlikely given philosophy)
3. GPUI exposure to extensions

**Check periodically**:
- https://github.com/zed-industries/zed/issues (search "extension UI")
- https://zed.dev/roadmap
- https://zed.dev/blog

### Long-term: Consider Core Contribution

If beads gains traction and Zed market share grows:
1. Propose beads integration as Zed feature
2. Contribute GPUI-based implementation
3. Maintain as part of Zed ecosystem

This requires significant investment but provides best user experience.

### Comparison to JetBrains Port

| Factor | Zed | JetBrains |
|--------|-----|-----------|
| Feasibility | Not currently possible | Fully possible |
| UI Capabilities | None for extensions | Full Swing/Compose/JCEF |
| Effort if possible | N/A | 4-8 weeks |
| User base | Growing (developers) | Massive (enterprise) |
| **Recommendation** | Wait | Proceed when prioritized |

---

## Resources

### Zed Documentation
- [Extensions Overview](https://zed.dev/docs/extensions)
- [Developing Extensions](https://zed.dev/docs/extensions/developing-extensions)
- [Extension Capabilities](https://zed.dev/docs/extensions/capabilities)
- [Slash Commands](https://zed.dev/docs/extensions/slash-commands)
- [MCP Extensions](https://zed.dev/docs/extensions/mcp-extensions)

### Zed Source Code
- [Zed GitHub](https://github.com/zed-industries/zed)
- [zed_extension_api crate](https://crates.io/crates/zed_extension_api)
- [Extensions repository](https://github.com/zed-industries/extensions)

### Related
- [Migrating from VS Code](https://zed.dev/docs/migrate/vs-code)
- [Agent Panel](https://zed.dev/docs/ai/agent-panel)

---

## Appendix: Extension API Surface

### zed_extension_api 0.1.0 Traits

```rust
pub trait Extension: Send + Sync {
    fn new() -> Self where Self: Sized;

    // Language server
    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command>;

    fn language_server_initialization_options(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<String>>;

    fn language_server_workspace_configuration(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<String>>;

    // Slash commands
    fn run_slash_command(
        &self,
        command: SlashCommand,
        args: Vec<String>,
        worktree: Option<&Worktree>,
    ) -> Result<SlashCommandOutput, String>;

    fn complete_slash_command_argument(
        &self,
        command: SlashCommand,
        args: Vec<String>,
    ) -> Result<Vec<SlashCommandArgumentCompletion>, String>;

    // Labels
    fn labels_for_completions(
        &self,
        language_server_id: &LanguageServerId,
        completions: Vec<Completion>,
    ) -> Result<Vec<Option<CodeLabel>>>;

    fn labels_for_symbols(
        &self,
        language_server_id: &LanguageServerId,
        symbols: Vec<Symbol>,
    ) -> Result<Vec<Option<CodeLabel>>>;
}
```

### Available Functions

```rust
// Process execution (requires capability)
pub mod process {
    pub struct Command { ... }
    impl Command {
        pub fn new(program: &str) -> Self;
        pub fn args(&mut self, args: &[&str]) -> &mut Self;
        pub fn current_dir(&mut self, dir: &Path) -> &mut Self;
        pub fn output(&mut self) -> Result<Output>;
    }
}

// File operations
pub fn download_file(url: &str, path: &str) -> Result<()>;
pub fn npm_install_package(package: &str) -> Result<()>;

// Worktree access (read-only)
pub struct Worktree { ... }
impl Worktree {
    pub fn root_path(&self) -> &Path;
    pub fn read_text_file(&self, path: &Path) -> Result<String>;
    // Note: No write access
}
```

### What's Notably Absent

- `create_panel()` / `create_view()`
- `show_message()` / `show_notification()`
- `register_command()` (beyond slash commands)
- `create_status_bar_item()`
- `register_tree_data_provider()`
- `open_document()` / `edit_document()`
- `subscribe_to_events()`
- `persist_state()` / `load_state()`
- Any GPUI element creation
