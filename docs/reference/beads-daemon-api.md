# Beads Daemon RPC API Reference

Reference for the beads daemon Unix socket RPC API. See [steveyegge/beads](https://github.com/steveyegge/beads) for the canonical implementation.

## Connection

- **Socket**: `.beads/bd.sock` (Unix domain socket)
- **Protocol**: Line-delimited JSON-RPC
- **Request format**: `{"operation": "...", "args": {...}, "actor": "...", "cwd": "..."}\n`
- **Response format**: `{"success": true, "data": {...}}` or `{"success": false, "error": "..."}`

## Operations

| Operation | Description | Key File |
|-----------|-------------|----------|
| `ping` | Health check | `internal/rpc/server_lifecycle_conn.go` |
| `status` | Daemon metadata | `internal/rpc/server_lifecycle_conn.go` |
| `health` | Detailed health + version compat | `internal/rpc/server_lifecycle_conn.go` |
| `list` | List issues with filters | `internal/rpc/server_issues_epics.go` |
| `show` | Get single issue with deps | `internal/rpc/server_issues_epics.go:857` |
| `create` | Create issue | `internal/rpc/server_issues_epics.go` |
| `update` | Update issue fields | `internal/rpc/server_issues_epics.go` |
| `close` | Close issue | `internal/rpc/server_issues_epics.go` |
| `ready` | Issues ready to work | `internal/rpc/server_issues_epics.go` |
| `stats` | Project statistics | `internal/rpc/server_issues_epics.go` |
| `dep_add` | Add dependency | `internal/rpc/server_labels_deps_comments.go` |
| `dep_remove` | Remove dependency | `internal/rpc/server_labels_deps_comments.go` |
| `dep_tree` | Dependency tree | `internal/rpc/server_labels_deps_comments.go` |
| `comment_add` | Add comment | `internal/rpc/server_labels_deps_comments.go` |
| `comment_list` | List comments | `internal/rpc/server_labels_deps_comments.go` |
| `get_mutations` | Recent changes (polling) | `internal/rpc/server_core.go:175` |
| `epic_status` | Epic completion status | `internal/rpc/server_issues_epics.go` |

## Key Response Structures

### `show` Response

Returns full issue with **both dependencies and dependents**:

```go
// internal/rpc/server_issues_epics.go:917-922
type IssueDetails struct {
    *types.Issue
    Labels       []string                              `json:"labels,omitempty"`
    Dependencies []*types.IssueWithDependencyMetadata `json:"dependencies,omitempty"`
    Dependents   []*types.IssueWithDependencyMetadata `json:"dependents,omitempty"`
}
```

Each dependency/dependent includes metadata:
```go
// internal/types/types.go
type IssueWithDependencyMetadata struct {
    Issue
    DependencyType string `json:"dependency_type"` // blocks, related, parent-child, discovered-from
}
```

### `list` Response

Returns array of issues. Does **not** include dependencies/dependents (use `show` for those).

### `get_mutations` Response

For real-time updates (polling approach):
```go
// internal/rpc/server_core.go:68-72
type MutationEvent struct {
    Type      string    `json:"type"`      // create, update, delete, comment
    IssueID   string    `json:"issue_id"`
    Timestamp time.Time `json:"timestamp"`
}
```

## Dependency Types

```go
// internal/types/types.go
const (
    DepBlocks         = "blocks"          // Hard blocker
    DepRelated        = "related"         // Soft link
    DepParentChild    = "parent-child"    // Epic/subtask
    DepDiscoveredFrom = "discovered-from" // Found during work
)
```

## Key Implementation Files

```
internal/rpc/
├── protocol.go                              # Request/response types, operation constants
├── server_core.go                           # Server setup, mutation events
├── server_issues_epics.go                   # CRUD operations, show, list, ready
├── server_labels_deps_comments.go           # Labels, dependencies, comments
├── server_routing_validation_diagnostics.go # Request routing
├── server_lifecycle_conn.go                 # Connection handling, health, status
└── client.go                                # Go client implementation

internal/storage/
├── storage.go                               # Storage interface
└── sqlite/
    └── sqlite.go                            # SQLite implementation
```

## vscode-beads Integration

The extension has two backends:

1. **BeadsBackend** (`src/backend/BeadsBackend.ts`) - Uses CLI (`bd show --json`)
2. **BeadsDaemonClient** (`src/backend/BeadsDaemonClient.ts`) - Direct socket RPC

Both support dependencies/dependents. The daemon client is faster for real-time updates.
