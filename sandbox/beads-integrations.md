# Beads External Integrations

Research on beads integration capabilities with external issue trackers.

## Current Status (as of 2025-12-04)

| Integration | Status | Implementation |
|-------------|--------|----------------|
| **Jira** | ✅ Implemented | Built-in `bd jira` command |
| **GitHub** | ✅ Import only | Python script (`examples/github-import/`) |
| **Linear** | ⚠️ Placeholder | Config namespace exists, no implementation |
| **GitLab** | ❌ Not implemented | No config or code found |

## Jira Integration (Full Implementation)

The most complete integration. Provides bidirectional sync.

### Configuration

```bash
bd config set jira.url "https://company.atlassian.net"
bd config set jira.project "PROJ"
bd config set jira.api_token "YOUR_TOKEN"
bd config set jira.username "your_email@company.com"
```

Or via environment:
```bash
export JIRA_API_TOKEN=YOUR_TOKEN
export JIRA_USERNAME=your@email.com
```

### Commands

```bash
bd jira sync --pull         # Import issues from Jira
bd jira sync --push         # Export issues to Jira
bd jira sync                # Bidirectional sync (pull then push)
bd jira sync --dry-run      # Preview sync without changes
bd jira status              # Show sync status
```

### Features

- **Bidirectional sync**: Pull from Jira, push to Jira
- **Conflict resolution**: Timestamp-based (newer wins), or prefer local/Jira
- **External ref**: Preserves Jira URLs in `external_ref` field
- **State filtering**: Sync open, closed, or all issues

### Implementation

Uses Python scripts in `examples/jira-import/`:
- `jira2jsonl.py` - Fetches from Jira API, outputs JSONL
- `jsonl2jira.py` - Pushes JSONL to Jira API

## GitHub Integration (Import Only)

One-way import from GitHub Issues to beads.

### Usage

```bash
# Set token
export GITHUB_TOKEN=ghp_your_token_here

# Import from repo
python examples/github-import/gh2jsonl.py --repo owner/repo | bd import

# Or save to file first
python examples/github-import/gh2jsonl.py --repo owner/repo > issues.jsonl
bd import -i issues.jsonl
```

### Features

- **API or JSON**: Fetch via API or parse exported JSON
- **Label mapping**: Auto-maps GitHub labels to priority/type
- **Status mapping**: Maps GitHub state + labels to bd status
- **Cross-references**: Converts `#123` to dependencies
- **External links**: Preserves GitHub URLs in `external_ref`
- **PR filtering**: Automatically excludes pull requests

### Mapping Tables

**Priority:**
| GitHub Labels | bd Priority |
|---------------|-------------|
| critical, p0, urgent | 0 (Critical) |
| high, p1, important | 1 (High) |
| (default) | 2 (Medium) |
| low, p3, minor | 3 (Low) |
| backlog, p4, someday | 4 (Backlog) |

**Type:**
| GitHub Labels | bd Type |
|---------------|---------|
| bug, defect | bug |
| feature, enhancement | feature |
| epic, milestone | epic |
| chore, maintenance | chore |
| (default) | task |

### Config Settings (Future?)

The config namespace exists but isn't used by the script:
```
github.org    # Organization name
github.repo   # Repository name
```

These may be for a future built-in `bd github` command.

## Linear Integration (Not Implemented)

Config namespace exists but no implementation found:
```
linear.url
linear.api-key
```

This appears to be planned but not yet built.

## GitLab Integration (Not Present)

No config namespace, code, or issues found for GitLab. Would need to be implemented from scratch or contributed.

## External Ref Field

All integrations use the `external_ref` field to link beads back to external systems:

```json
{
  "id": "proj-123",
  "title": "Example issue",
  "external_ref": "https://company.atlassian.net/browse/PROJ-456"
}
```

This enables:
- Tracking which issues came from where
- Avoiding duplicate imports
- Linking back to source systems

## Potential Improvements

1. **Built-in `bd github` command** - Similar to `bd jira`, with bidirectional sync
2. **Linear implementation** - Use the existing config namespace
3. **GitLab support** - Follow GitHub pattern with `gl2jsonl.py`
4. **Generic external tracker** - Abstract pattern for any REST API

## Sources

- `/cmd/bd/jira.go` - Jira integration (690 lines)
- `/examples/github-import/` - GitHub import scripts
- `/cmd/bd/config.go` - Config namespace documentation
