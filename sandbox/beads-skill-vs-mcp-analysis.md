# Beads: Skill vs MCP Analysis

**Date**: 2025-12-17
**Purpose**: Evaluate moving from MCP to Skill for beads integration

## Summary

The beads repo contains both an MCP server (`integrations/beads-mcp/`) and a Skill (`skills/beads/`). The Skill approach is lighter weight and more maintainable, but has some gaps.

## Gap Analysis: CLI vs MCP vs Skill

| Capability | CLI (`bd`) | MCP | Skill |
|------------|------------|-----|-------|
| **Core CRUD** | Full | Full | Via CLI docs |
| **Filtering/Search** | Full | Basic | Via CLI docs |
| **Batch ops** | Multi-ID support | Single only | Via CLI docs |
| **Compaction** | `bd compact` | ❌ | ✅ |
| **Daemon mgmt** | `bd daemons` | ❌ | ✅ |
| **Sync** | `bd sync` | ❌ | ✅ |
| **Comments** | `bd comments` | ❌ | ❌ |
| **Labels** | `bd label` | ❌ | ✅ |
| **Epics** | Hierarchical IDs | ❌ | ✅ |
| **Stale detection** | `bd stale` | ❌ | ❌ |
| **Duplicates** | `bd duplicates` | ❌ | ❌ |
| **Migration** | `bd migrate` | Partial | ❌ |
| **Import/Export** | Full | ❌ | ❌ |
| **Mail/Messaging** | `bd message` (new) | ❌ | ❌ |
| **Relate** | `bd relate` (new) | ❌ | ❌ |

## MCP Bloat Assessment

**22 tools registered**, breakdown:
- **Core (useful)**: ~10 tools - ready, list, show, create, update, close, reopen, dep, stats, blocked, init
- **Context mgmt**: 2 tools - set_context, where_am_i (needed for workspace routing)
- **Debugging**: 3 tools - debug_env, inspect_migration, get_schema_info
- **Health checks**: 3 tools - repair_deps, detect_pollution, validate
- **Meta**: 2 tools - discover_tools, get_tool_info (context optimization)

## Skill Advantages

1. **No Python dependency** - CLI is Go binary, skill just references CLI
2. **Always current** - Skill documents CLI which is source of truth
3. **Richer guidance** - Workflows, checklists, decision trees, session protocols
4. **Smaller footprint** - ~645 lines SKILL.md + refs vs 950 lines Python
5. **No process overhead** - No MCP server to start/manage

## Skill Gaps to Fill

Missing documentation for:
- `bd stale` - stale issue detection
- `bd duplicates` - duplicate detection/merge
- `bd message` / `bd mail` - new messaging feature (v0.30+)
- `bd relate` - new relationship command (v0.30+)
- `bd info` - database/daemon info
- Import/export orphan handling options
- `bd comments` - comment management

## Plugin Structure

```
.claude-plugin/
├── marketplace.json     # Marketplace definition
├── plugin.json          # Plugin config (mcpServers, hooks)
└── agents/              # Agent definitions (task-agent.md)

skills/
└── beads/
    ├── SKILL.md         # Main skill definition
    └── references/      # Supporting docs (7 files)

commands/               # Slash commands (30 files)
└── *.md
```

**Current state**: The skill exists in repo but isn't referenced in plugin.json. Plugin only configures:
- `mcpServers` - the MCP server
- `hooks` - SessionStart/PreCompact hooks

The skill appears intended for manual installation or reference.

## Migration Path

To move from MCP to Skill:

1. **Verify plugin skill support** - Check if plugins can distribute skills
2. **Fill skill gaps** - Add missing command documentation
3. **Update plugin.json** - Reference skill, remove/optional MCP
4. **Manual fallback** - Copy `skills/beads/` to `~/.claude/skills/beads/`

## Recommendation

The Skill approach is cleaner:
- Claude shells out to `bd` CLI with `--json` when needed
- Guided by comprehensive workflow documentation
- No server process, no Python, no context bloat from tool schemas

**Action items**:
1. Contribute skill gap fixes upstream (stale, duplicates, message, relate, comments)
2. Test skill-only workflow locally
3. Determine if/how plugins distribute skills
4. Consider keeping MCP as optional for IDEs that need it
