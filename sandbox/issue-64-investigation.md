# Issue #64 Investigation: Refresh Command Doesn't Re-discover Projects

## Status: Fixed

The original bug (early-return preventing discovery) was fixed in the v0.13.0 refactor. The secondary gap (discovered projects not auto-activated) was fixed in this PR by adding auto-activation to `refresh()`.

## Current Code Analysis

### `BeadsProjectManager.refresh()` (`src/backend/BeadsProjectManager.ts:116-142`)

```typescript
async refresh(): Promise<void> {
    await this.discoverProjects();          // <-- NOW called unconditionally (line 117)

    const activeId = this.activeProject?.id;
    if (!activeId) {
      this._onDataChanged.fire();           // fires event, but doesn't activate anything
      return;
    }
    // ... rest handles existing active project
}
```

**Original bug**: `refresh()` early-returned when `activeProject` was null, *before* calling `discoverProjects()`. This is **fixed** — `discoverProjects()` is now the first thing called.

### `beads.refresh` command (`src/extension.ts:131-138`)

```typescript
vscode.commands.registerCommand("beads.refresh", async () => {
    log.info("Manual refresh triggered");
    await projectManager.refresh();
    dashboardProvider.hardRefresh();
    beadsPanelProvider.hardRefresh();
    detailsProvider.hardRefresh();
    // ...
});
```

Just calls `refresh()` then hard-refreshes views. No auto-activation logic.

### `discoverProjects()` (`src/backend/BeadsProjectManager.ts:53-79`)

Probes three sources in priority order:
1. `beads.projects` setting (explicit paths)
2. `BEADS_DIR` env var
3. Workspace folders (via `bd where`)

Uses `bd where` to detect `.beads/` directories. This correctly discovers newly-initialized projects.

### FileSystemWatcher

**None exists.** No watcher for `.beads/` directory creation. The only automatic rediscovery trigger is `onDidChangeWorkspaceFolders` (`extension.ts:295`), which fires when folders are added/removed from the workspace — not when subdirectories like `.beads/` are created.

## Previous Gap (fixed in this PR)

Before this fix, after `bd init` in an existing workspace folder:

1. User runs "Beads: Refresh"
2. `refresh()` calls `discoverProjects()` — project IS found and added to `this.projects`
3. `_onProjectsChanged` fires (line 78)
4. Since `activeProject` is still null, `refresh()` fires `_onDataChanged` and returns
5. **No project gets activated** — views stay empty

The fix adds auto-activation to `refresh()`, mirroring the `initialize()` pattern (`src/backend/BeadsProjectManager.ts:41-51`).

## Recommended Fix

Add auto-activation to `refresh()` when projects are discovered but none is active. Minimal change at `src/backend/BeadsProjectManager.ts:120-123`:

```typescript
async refresh(): Promise<void> {
    await this.discoverProjects();

    const activeId = this.activeProject?.id;
    if (!activeId) {
+     // Auto-activate first discovered project (mirrors initialize() behavior)
+     if (this.projects.length > 0) {
+       await this.setActiveProject(this.projects[0].id);
+     }
      this._onDataChanged.fire();
      return;
    }
    // ... rest unchanged
}
```

This mirrors the `initialize()` pattern and ensures that after `bd init` + refresh, the new project is both discovered AND activated.

## Alternative: FileSystemWatcher

A `FileSystemWatcher` for `**/.beads/metadata.json` could auto-trigger rediscovery without manual refresh. This would be a nice enhancement but is a separate concern from the refresh command bug. The watcher approach is used by many extensions (e.g., watching for `package.json` creation) and would provide the best UX.

## Summary

| Aspect | v0.12.0 (reported) | v0.13.0+ (current) |
|--------|-------------------|-------------------|
| `refresh()` calls `discoverProjects()` | No (early-return) | Yes (fixed) |
| New projects found after `bd init` | No | Yes |
| New projects auto-activated | No | Yes (fixed in this PR) |
| FileSystemWatcher for `.beads/` | No | No |
