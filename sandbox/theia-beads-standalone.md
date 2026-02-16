# Standalone Beads App on Theia

> Walkthrough for building a standalone "Beads" application using Eclipse Theia as the shell, with the issues panel as the main content area and a project directory selector.

## Goal

A standalone desktop app (not VS Code with an extension) that:

1. Opens to a project picker — browse/select directories with `.beads/` in them
2. Main panel shows the Beads issues table (currently `IssuesView`)
3. Side panel shows bead details (currently `DetailsView`)
4. Dashboard available as a secondary view
5. No code editor, no terminal, no file explorer — just Beads

## Code Reuse Analysis

The current vscode-beads codebase has three layers with very different portability:

### Fully Portable (zero changes needed)

| File | Why |
|------|-----|
| `src/backend/BeadsDaemonClient.ts` | Pure Node.js `net` sockets + JSON-RPC. No `vscode` imports. |
| `src/backend/types.ts` | Pure TypeScript interfaces |
| `src/webview/views/IssuesView.tsx` | Pure React + TanStack Table. Uses `vscode.postMessage` only via prop callbacks. |
| `src/webview/views/DetailsView.tsx` | Pure React. Same callback pattern. |
| `src/webview/views/DashboardView.tsx` | Pure React. |
| `src/webview/views/KanbanBoard.tsx` | Pure React. |
| `src/webview/common/*` | All 19 components are pure React — `StatusBadge`, `FilterChip`, `Dropdown`, etc. |
| `src/webview/icons/*` | SVG icons, framework-agnostic |
| `src/webview/hooks/*` | React hooks, no vscode dependency |

**The entire React UI layer is portable.** The only `vscode` coupling is a single `acquireVsCodeApi()` call at the bottom of `src/webview/types.ts` (line 231), used for `postMessage`. This is easily abstracted.

### Needs Reimplementation

| File | What depends on vscode | Theia equivalent |
|------|----------------------|------------------|
| `src/backend/BeadsProjectManager.ts` | `vscode.workspace`, `vscode.EventEmitter`, `vscode.ExtensionContext` | Theia's `WorkspaceService`, `Emitter`, DI lifecycle |
| `src/providers/BaseViewProvider.ts` | `vscode.WebviewViewProvider`, `vscode.Webview` | Theia `ReactWidget` (renders React directly, no webview needed) |
| `src/providers/BeadsPanelViewProvider.ts` | Same | Same |
| `src/providers/BeadDetailsViewProvider.ts` | Same | Same |
| `src/providers/DashboardViewProvider.ts` | Same | Same |
| `src/extension.ts` | Everything — activation, commands, status bar | Theia `FrontendApplicationContribution` + DI module |

### Key Insight: No Webview Layer Needed

In VS Code, extensions render custom UI via webviews — an embedded iframe with its own HTML document, communicating via `postMessage`. This is why we have the provider→webview→React pipeline.

In Theia, compile-time extensions render directly in the main process. `ReactWidget` extends Lumino's `Widget` and renders a React component tree directly into the DOM. **No iframe, no postMessage, no serialization boundary.** The React components get direct access to injected services.

This means:
- The `BaseViewProvider` → webview → `App.tsx` → routing layer **goes away entirely**
- Each view becomes a `ReactWidget` that directly renders its React component
- Data flows via injected services, not message passing

---

## Approaches

### Approach A: VS Code Extension in Stripped Theia

Install the existing vscode-beads `.vsix` as a runtime VS Code extension in a minimal Theia app. Use contribution filters to remove the editor, terminal, etc.

**Pros:**
- Zero code changes to vscode-beads
- Working in days, not weeks

**Cons:**
- Beads views are stuck in the sidebar (VS Code extension API can't render in the main area)
- The main content area would be empty or show an unhelpful welcome tab
- Still feels like "VS Code with stuff removed" rather than a purpose-built app
- Can't customize the project picker experience
- Extension runs in a sandboxed extension host process — extra overhead for what should be a simple app

**Verdict:** Gets something running fast, but doesn't achieve the goal of a standalone Beads product.

### Approach B: Native Theia Extension (Recommended)

Create a compile-time Theia extension that:
- Reuses the React components directly (no webview wrapper)
- Wraps `BeadsDaemonClient` in a Theia backend service
- Contributes `ReactWidget`s for Issues, Details, Dashboard
- Opens Issues as the main panel widget (not sidebar)
- Filters out all default IDE contributions (editor, terminal, file explorer)
- Adds a custom project picker

**Pros:**
- React components reused with minimal changes (swap postMessage for injected services)
- Full control over layout — Issues in main area, Details in right panel
- Custom branding, welcome screen, project picker
- Smaller binary — only include needed `@theia/*` packages
- Direct DOM rendering — no iframe overhead

**Cons:**
- Need to write Theia-specific glue code (~500-800 lines estimated)
- Need to maintain two builds (VS Code extension + Theia app) or extract shared code
- Learning curve on Theia's DI system (Inversify)

**Verdict:** The right approach if the goal is a polished standalone product.

### Approach C: Electron from Scratch

Skip Theia entirely. Build a plain Electron app that renders the React components directly.

**Pros:**
- Simplest architecture — just Electron + React
- Smallest binary
- No framework overhead

**Cons:**
- Lose window management (panels, splitting, resizing, docking)
- Lose theming infrastructure
- Lose command palette
- Lose keyboard shortcut framework
- Lose extension ecosystem entirely
- Need to build all chrome from scratch

**Verdict:** Only makes sense if Theia's overhead is unacceptable. The panel management alone justifies using Theia.

---

## Recommended: Approach B Walkthrough

### Project Structure

```
theia-beads/
├── package.json                    # Root monorepo
├── packages/
│   ├── beads-core/                 # Shared code (extracted from vscode-beads)
│   │   ├── package.json
│   │   └── src/
│   │       ├── daemon-client.ts    # BeadsDaemonClient (as-is)
│   │       ├── types.ts            # Shared types
│   │       └── project-discovery.ts # Project discovery logic (no vscode dep)
│   │
│   ├── beads-theia/                # Theia extension (compile-time)
│   │   ├── package.json
│   │   └── src/
│   │       ├── common/             # Shared interfaces
│   │       ├── browser/            # Frontend (widgets, contributions)
│   │       │   ├── beads-frontend-module.ts
│   │       │   ├── beads-issues-widget.tsx
│   │       │   ├── beads-details-widget.tsx
│   │       │   ├── beads-dashboard-widget.tsx
│   │       │   ├── beads-contribution.ts
│   │       │   ├── beads-project-picker.tsx
│   │       │   └── styles/
│   │       └── node/               # Backend services
│   │           ├── beads-backend-module.ts
│   │           └── beads-backend-service.ts
│   │
│   └── beads-app/                  # Theia application assembly
│       ├── package.json            # Lists @theia/* deps + beads-theia
│       ├── electron-app/
│       │   └── package.json
│       └── browser-app/
│           └── package.json
```

### Step 1: Application Package (`beads-app/package.json`)

The app's `package.json` defines which Theia packages to include. Strip it to the minimum:

```json
{
  "name": "beads-app",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@theia/core": "1.68.0",
    "@theia/filesystem": "1.68.0",
    "@theia/workspace": "1.68.0",
    "@theia/messages": "1.68.0",
    "@theia/preferences": "1.68.0",
    "beads-theia": "0.1.0"
  },
  "devDependencies": {
    "@theia/cli": "1.68.0"
  },
  "theia": {
    "frontend": {
      "config": {
        "applicationName": "Beads",
        "preferences": {
          "window.title": "Beads - ${activeProject}"
        }
      }
    }
  },
  "scripts": {
    "build": "theia build",
    "start": "theia start",
    "package": "theia package"
  }
}
```

**What's NOT included** (and why it matters):
- `@theia/editor` — no code editor
- `@theia/monaco` — no Monaco
- `@theia/terminal` — no terminal
- `@theia/navigator` — no file explorer
- `@theia/scm` — no git
- `@theia/search-in-files` — no search
- `@theia/ai-*` — no AI features
- `@theia/plugin-ext` — no VS Code extension runtime

This produces a much smaller binary. The app has a shell (panels, menus, status bar, command palette) and filesystem access, but nothing else — the beads extension fills the rest.

### Step 2: Backend Service

Expose `BeadsDaemonClient` as a Theia backend service accessible from the frontend via JSON-RPC.

```typescript
// packages/beads-theia/src/common/beads-service.ts
// Shared interface — used by both frontend and backend

import { Bead, BeadsProject, BeadsSummary } from 'beads-core';

export const BeadsService = Symbol('BeadsService');
export const BEADS_SERVICE_PATH = '/services/beads';

export interface BeadsService {
  discoverProjects(roots: string[]): Promise<BeadsProject[]>;
  listBeads(projectPath: string): Promise<Bead[]>;
  showBead(projectPath: string, beadId: string): Promise<Bead>;
  createBead(projectPath: string, opts: CreateBeadOptions): Promise<Bead>;
  updateBead(projectPath: string, beadId: string, updates: object): Promise<Bead>;
  getSummary(projectPath: string): Promise<BeadsSummary>;
  // ... other operations from BeadsDaemonClient
}
```

```typescript
// packages/beads-theia/src/node/beads-backend-service.ts
// Backend implementation — runs in Node.js, has access to filesystem/sockets

import { injectable } from '@theia/core/shared/inversify';
import { BeadsService } from '../common/beads-service';
import { BeadsDaemonClient } from 'beads-core';

@injectable()
export class BeadsBackendService implements BeadsService {
  // Map of project path → daemon client
  private clients = new Map<string, BeadsDaemonClient>();

  private getClient(projectPath: string): BeadsDaemonClient {
    if (!this.clients.has(projectPath)) {
      this.clients.set(projectPath, new BeadsDaemonClient(projectPath));
    }
    return this.clients.get(projectPath)!;
  }

  async discoverProjects(roots: string[]): Promise<BeadsProject[]> {
    // Walk roots looking for .beads/ directories
    // This is the logic from BeadsProjectManager.discoverProjects()
    // but without vscode.workspace dependency
  }

  async listBeads(projectPath: string): Promise<Bead[]> {
    return this.getClient(projectPath).list();
  }

  async showBead(projectPath: string, beadId: string): Promise<Bead> {
    return this.getClient(projectPath).show(beadId);
  }

  // ... delegate all operations to the daemon client
}
```

```typescript
// packages/beads-theia/src/node/beads-backend-module.ts
// DI bindings for the backend

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { BeadsService, BEADS_SERVICE_PATH } from '../common/beads-service';
import { BeadsBackendService } from './beads-backend-service';

export default new ContainerModule(bind => {
  bind(BeadsService).to(BeadsBackendService).inSingletonScope();
  bind(ConnectionHandler).toDynamicValue(ctx =>
    new RpcConnectionHandler(BEADS_SERVICE_PATH, () =>
      ctx.container.get(BeadsService)
    )
  ).inSingletonScope();
});
```

### Step 3: Issues Widget (Main Panel)

```typescript
// packages/beads-theia/src/browser/beads-issues-widget.tsx

import * as React from 'react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core';
import { BeadsService } from '../common/beads-service';
import { IssuesView } from 'beads-core/webview/views/IssuesView';

@injectable()
export class BeadsIssuesWidget extends ReactWidget {
  static readonly ID = 'beads:issues';
  static readonly LABEL = 'Issues';

  @inject(BeadsService) protected readonly beadsService!: BeadsService;
  @inject(MessageService) protected readonly messageService!: MessageService;

  private beads: Bead[] = [];
  private selectedBeadId: string | null = null;
  private loading = true;
  // ... other state

  @postConstruct()
  protected init(): void {
    this.id = BeadsIssuesWidget.ID;
    this.title.label = BeadsIssuesWidget.LABEL;
    this.title.closable = false;  // Main view shouldn't be closable
    this.title.iconClass = 'fa fa-list';
    this.loadData();
  }

  protected async loadData(): Promise<void> {
    this.loading = true;
    this.update();
    try {
      this.beads = await this.beadsService.listBeads(this.projectPath);
      this.loading = false;
    } catch (err) {
      this.messageService.error(`Failed to load beads: ${err}`);
      this.loading = false;
    }
    this.update();  // Triggers re-render
  }

  protected render(): React.ReactNode {
    // Render the SAME React component used in vscode-beads
    return (
      <IssuesView
        beads={this.beads}
        loading={this.loading}
        error={this.error}
        selectedBeadId={this.selectedBeadId}
        projects={this.projects}
        activeProject={this.activeProject}
        tooltipHoverDelay={1000}
        onSelectProject={(projectId) => this.switchProject(projectId)}
        onSelectBead={(beadId) => this.selectBead(beadId)}
        onUpdateBead={(beadId, updates) => this.updateBead(beadId, updates)}
        onStartDaemon={() => this.startDaemon()}
        onRetry={() => this.loadData()}
      />
    );
  }
}
```

The key insight: **`IssuesView` receives all data via props and communicates via callbacks.** It doesn't know or care whether those callbacks call `vscode.postMessage` or a Theia service. We just wire different callbacks.

### Step 4: View Contribution (Layout)

```typescript
// packages/beads-theia/src/browser/beads-contribution.ts

import { injectable } from '@theia/core/shared/inversify';
import {
  AbstractViewContribution,
  FrontendApplicationContribution,
  FrontendApplication,
} from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core';
import { BeadsIssuesWidget } from './beads-issues-widget';

export const BEADS_ISSUES_COMMAND: Command = { id: 'beads.openIssues' };

@injectable()
export class BeadsContribution
  extends AbstractViewContribution<BeadsIssuesWidget>
  implements FrontendApplicationContribution, MenuContribution
{
  constructor() {
    super({
      widgetId: BeadsIssuesWidget.ID,
      widgetName: BeadsIssuesWidget.LABEL,
      defaultWidgetOptions: { area: 'main' },  // <-- Main content area, not sidebar
      toggleCommandId: BEADS_ISSUES_COMMAND.id,
    });
  }

  // Auto-open Issues on startup
  async onStart(app: FrontendApplication): Promise<void> {
    // Open the main Issues view
    await this.openView({ activate: true, reveal: true });

    // Open Details in the right panel
    // (similar contribution for BeadsDetailsWidget with area: 'right')
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(BEADS_ISSUES_COMMAND, {
      execute: () => this.openView({ activate: true, reveal: true }),
    });
  }

  registerMenus(menus: MenuModelRegistry): void {
    // Minimal menu — just Beads operations
    const BEADS_MENU = [...MAIN_MENU_BAR, 'beads'];
    menus.registerSubmenu(BEADS_MENU, 'Beads');
    menus.registerMenuAction(BEADS_MENU, {
      commandId: 'beads.refresh',
      label: 'Refresh',
    });
    menus.registerMenuAction(BEADS_MENU, {
      commandId: 'beads.createBead',
      label: 'New Issue',
    });
  }
}
```

### Step 5: Remove Default IDE Features

Use contribution filtering to strip everything not needed:

```typescript
// packages/beads-theia/src/browser/beads-filter-contribution.ts

import { injectable } from '@theia/core/shared/inversify';
import { FilterContribution, ContributionFilterRegistry } from '@theia/core/lib/common';

@injectable()
export class BeadsFilterContribution implements FilterContribution {
  registerContributionFilters(registry: ContributionFilterRegistry): void {
    // Keep only Beads-related contributions
    // Filter out editor, terminal, search, git, etc.
    registry.addFilters('*', [
      contrib => {
        const name = contrib.constructor?.name || '';
        // Whitelist: only keep core shell + beads contributions
        const allowed = [
          'BeadsContribution',
          'BeadsDetailsContribution',
          'BeadsDashboardContribution',
          // Core shell contributions needed for the app to function
          'CommonFrontendContribution',
          'StatusBarContribution',
          'ThemeServiceContribution',
          // ... other essentials
        ];
        return allowed.includes(name);
      }
    ]);
  }
}
```

> Note: Contribution filtering is powerful but can be fragile — filtering too aggressively breaks the app. An alternative is to simply not include the `@theia/*` packages for unwanted features in `package.json` (Step 1). If the package isn't there, its contributions never register.

### Step 6: Project Picker

A custom widget that shows on first launch when no project is selected:

```typescript
// packages/beads-theia/src/browser/beads-project-picker.tsx

@injectable()
export class BeadsProjectPickerWidget extends ReactWidget {
  static readonly ID = 'beads:project-picker';

  @inject(BeadsService) protected readonly beadsService!: BeadsService;

  protected render(): React.ReactNode {
    return (
      <div className="beads-project-picker">
        <h2>Open a Beads Project</h2>
        <p>Select a directory containing a .beads/ folder</p>

        {/* List recently opened projects */}
        <div className="recent-projects">
          {this.recentProjects.map(project => (
            <button key={project.id} onClick={() => this.openProject(project)}>
              <span className="project-name">{project.name}</span>
              <span className="project-path">{project.rootPath}</span>
            </button>
          ))}
        </div>

        {/* Browse button */}
        <button onClick={() => this.browseForProject()}>
          Browse...
        </button>
      </div>
    );
  }

  private async browseForProject(): Promise<void> {
    // Use Theia's file dialog service
    const dir = await this.fileDialogService.showOpenDialog({
      title: 'Select Beads Project',
      canSelectFolders: true,
      canSelectFiles: false,
    });

    if (dir) {
      // Verify .beads/ exists in selected directory
      // Set as active project, open main views
    }
  }
}
```

### Step 7: Frontend Module (Wire It All Together)

```typescript
// packages/beads-theia/src/browser/beads-frontend-module.ts

import { ContainerModule } from '@theia/core/shared/inversify';
import {
  WidgetFactory,
  FrontendApplicationContribution,
  bindViewContribution,
} from '@theia/core/lib/browser';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { FilterContribution } from '@theia/core/lib/common';
import { BeadsService, BEADS_SERVICE_PATH } from '../common/beads-service';
import { BeadsIssuesWidget } from './beads-issues-widget';
import { BeadsDetailsWidget } from './beads-details-widget';
import { BeadsContribution } from './beads-contribution';
import { BeadsFilterContribution } from './beads-filter-contribution';

export default new ContainerModule(bind => {
  // Connect to backend service via JSON-RPC
  bind(BeadsService).toDynamicValue(ctx => {
    const connection = ctx.container.get(WebSocketConnectionProvider);
    return connection.createProxy<BeadsService>(BEADS_SERVICE_PATH);
  }).inSingletonScope();

  // Register widgets
  bind(BeadsIssuesWidget).toSelf();
  bind(WidgetFactory).toDynamicValue(ctx => ({
    id: BeadsIssuesWidget.ID,
    createWidget: () => ctx.container.get(BeadsIssuesWidget),
  })).inSingletonScope();

  bind(BeadsDetailsWidget).toSelf();
  bind(WidgetFactory).toDynamicValue(ctx => ({
    id: BeadsDetailsWidget.ID,
    createWidget: () => ctx.container.get(BeadsDetailsWidget),
  })).inSingletonScope();

  // Register contributions
  bindViewContribution(bind, BeadsContribution);
  bind(FrontendApplicationContribution).toService(BeadsContribution);
  bind(FilterContribution).to(BeadsFilterContribution).inSingletonScope();
});
```

---

## What Changes in the Existing React Components

Very little. The components use a callback-based architecture that's already decoupled from VS Code:

### 1. Swap the `vscode` postMessage Abstraction

Current (`src/webview/types.ts:220-231`):
```typescript
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: WebviewMessage) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
  }
}
export const vscode = window.acquireVsCodeApi();
```

In Theia, this goes away entirely. The components already receive callbacks as props (`onSelectBead`, `onUpdateBead`, etc.) — those callbacks just point to different implementations.

### 2. Files That Import `vscode` from types.ts

Only 3 files beyond `types.ts` itself reference `vscode.postMessage`:
- `App.tsx` — the routing layer (replaced by individual widgets)
- `IssuesView.tsx` — one `vscode.postMessage({ type: 'toggleKanban' })` call for state persistence
- `Markdown.tsx` — unclear, needs investigation

The `IssuesView` persistence call would use Theia's `StorageService` instead.

### 3. State Persistence

Current: `vscode.getState()` / `vscode.setState()` for persisting filter/sort state across reloads.

Theia equivalent: `StorageService` for persisting widget state. Inject it and use `setData(key, value)` / `getData(key)`.

---

## Shared Code Strategy

If maintaining both the VS Code extension and the Theia app, extract shared code:

```
packages/
├── beads-core/               # Shared (no framework dependency)
│   ├── daemon-client.ts      # BeadsDaemonClient
│   ├── types.ts              # All shared types
│   └── webview/              # React components
│       ├── views/            # IssuesView, DetailsView, etc.
│       ├── common/           # StatusBadge, FilterChip, etc.
│       ├── hooks/
│       └── icons/
│
├── beads-vscode/             # VS Code extension (thin wrapper)
│   └── src/
│       ├── extension.ts
│       ├── providers/
│       └── webview-bridge.ts # acquireVsCodeApi + postMessage
│
└── beads-theia/              # Theia extension (thin wrapper)
    └── src/
        ├── browser/          # Widgets that render shared React components
        └── node/             # Backend service wrapping daemon client
```

The React components live in `beads-core` and are consumed by both wrappers. Each wrapper provides the glue (message passing for VS Code, DI services for Theia).

---

## Build and Distribution

### Electron Desktop

```bash
cd packages/beads-app/electron-app
npm run build
npm run package  # Creates .dmg / .exe / .AppImage
```

Theia uses `electron-builder` under the hood. The `theia package` command produces platform-specific installers.

### Browser (Optional)

The same app can run as a web server:

```bash
cd packages/beads-app/browser-app
npm run build
npm run start  # Serves at http://localhost:3000
```

This would let teams run a shared Beads instance accessible via browser — useful for teams who want to view issues without installing anything.

---

## Effort Estimate

| Component | Description | Rough LOC |
|-----------|-------------|-----------|
| Backend service | Wrap `BeadsDaemonClient` in Theia service + JSON-RPC bindings | ~200 |
| Issues widget | `ReactWidget` rendering `IssuesView` | ~150 |
| Details widget | `ReactWidget` rendering `DetailsView` | ~100 |
| Dashboard widget | `ReactWidget` rendering `DashboardView` | ~80 |
| View contributions | Layout, commands, menus | ~150 |
| Project picker | Browse/recent projects UI | ~200 |
| Frontend module | DI bindings | ~60 |
| Contribution filters | Remove default IDE features | ~50 |
| Shared code extraction | Move React components to `beads-core` | Refactor (no new code) |
| Build/package config | `package.json` files, esbuild/webpack config | ~100 |

**Total new code**: ~1,000-1,200 lines of Theia-specific glue. The React UI is reused as-is.

---

## Risks and Open Questions

### Technical

1. **Theia minimum viable package set** — Need to verify that the app boots correctly with only `@theia/core`, `@theia/filesystem`, `@theia/workspace`, `@theia/messages`, and `@theia/preferences`. There may be implicit dependencies on other packages.

2. **ReactWidget rendering model** — Theia's `ReactWidget.update()` triggers a full re-render via `ReactDOM.render()`. The current vscode-beads components use React's own state management (useState, useCallback). Need to verify that TanStack Table's internal state (column resizing, sorting, drag-drop) survives `ReactWidget.update()` cycles. This is likely fine since `update()` calls `render()` which returns new JSX, and React reconciles — but should be tested early.

3. **Stylesheet conflicts** — The existing `styles.css` uses VS Code CSS variables (`--vscode-*`). Theia provides many of the same variables but naming may differ. Need an audit.

4. **BeadsDaemonClient in browser-only mode** — The daemon client uses Node.js `net` sockets. In browser deployments, this only works via the backend service over JSON-RPC. In Electron, could theoretically run in the renderer process but the backend service approach is cleaner.

5. **Build system complexity** — Theia uses webpack by default for bundling. The current vscode-beads uses esbuild. May need to adapt or use Theia's build system for the Theia app while keeping esbuild for the VS Code extension.

### Strategic

6. **Maintenance burden** — Two wrappers (VS Code + Theia) around shared code. Every new feature needs to be wired in both places. Is the standalone app worth this ongoing cost?

7. **Theia version churn** — Monthly releases mean regular dependency updates. Breaking changes in the DI API or widget system require adaptation.

8. **Install size** — Even a stripped-down Theia+Electron app will be 200-400 MB. For a project management tool, this feels heavy. The browser deployment option partially mitigates this.

9. **Who is the audience?** — Developers already have vscode-beads in their editor. A standalone app would appeal to project managers, product owners, or team leads who don't use VS Code. Is that audience worth building for?

---

## References

- [Theia: Composing Applications](https://theia-ide.org/docs/composing_applications/)
- [Theia: Widgets](https://theia-ide.org/docs/widgets/)
- [Theia: Services and Contributions](https://theia-ide.org/docs/services_and_contributions/)
- [Theia: Communication via JSON-RPC](https://theia-ide.org/docs/json_rpc/)
- [Theia: Contribution Filtering](https://theia-ide.org/docs/contribution_filter/)
- [Eclipse Theia Deep Dive](~/Documents/Obsidian/Wonderland/Sandbox/Eclipse%20Theia%20Deep%20Dive.md) — companion research document
