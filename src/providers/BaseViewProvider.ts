/**
 * BaseViewProvider - Abstract base class for all Beads webview providers
 *
 * Provides common functionality for:
 * - Setting up webview content
 * - Message passing between extension and webview
 * - Loading/error states
 * - Project context
 *
 * A provider can drive more than one webview surface at a time: the sidebar
 * view registered through `registerWebviewViewProvider`, and an editor tab
 * created through `createWebviewPanel`. Both are wrapped as `WebviewHost` so
 * the rest of the provider does not care which surface it is talking to.
 */

import * as path from "path";
import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../backend/types";
import { Logger } from "../utils/logger";
import { resolveEnvVariables } from "../utils/resolve-env-variables";

/**
 * A webview surface hosting a Beads view - either the sidebar view or an
 * editor tab. VS Code models the two with unrelated types, so providers work
 * against this common shape instead.
 */
export interface WebviewHost {
  readonly kind: "sidebar" | "editor";
  readonly webview: vscode.Webview;
  readonly visible: boolean;
  /** Editor group this surface occupies; undefined for the sidebar. */
  readonly viewColumn: vscode.ViewColumn | undefined;
  reveal(preserveFocus: boolean): void;
}

/**
 * Where a navigation request came from. Carried so a follow-up view opens on
 * the same surface, and in the same editor group, as the click that caused it.
 */
export interface NavigationOrigin {
  surface: WebviewHost["kind"];
  viewColumn?: vscode.ViewColumn;
}

export abstract class BaseViewProvider implements vscode.WebviewViewProvider {
  /** Every surface currently showing this view. */
  protected readonly hosts = new Set<WebviewHost>();
  /** The editor tab, when one is open. At most one per view. */
  private editorPanel?: vscode.WebviewPanel;
  protected readonly extensionUri: vscode.Uri;
  protected readonly projectManager: BeadsProjectManager;
  protected readonly log: Logger;
  /** Identifies the view to the webview app, which routes on it. */
  protected abstract readonly viewType: string;
  /** Webview type of the editor tab, used to register its serializer. */
  protected abstract readonly panelViewType: string;
  /** Title shown on the editor tab. */
  protected abstract readonly panelTitle: string;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    this.extensionUri = extensionUri;
    this.projectManager = projectManager;
    this.log = logger;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = this.getWebviewOptions();
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    const host: WebviewHost = {
      kind: "sidebar",
      webview: webviewView.webview,
      get visible() {
        return webviewView.visible;
      },
      viewColumn: undefined,
      reveal: (preserveFocus) => webviewView.show(preserveFocus),
    };
    this.hosts.add(host);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      await this.handleMessage(message, host);
    });

    // Refresh data when the view becomes visible again (e.g., after being hidden)
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.initializeView(host);
      }
    });

    webviewView.onDidDispose(() => {
      this.hosts.delete(host);
    });

    // Note: We don't call initializeView() here because the webview's React app
    // hasn't loaded yet. Instead, we wait for the "ready" message from the webview
    // (handled in handleMessage) which indicates the app is ready to receive data.
  }

  /**
   * Opens this view as an editor tab, or reveals the tab if already open.
   */
  public showInEditor(column: vscode.ViewColumn = vscode.ViewColumn.Active): void {
    if (this.editorPanel) {
      // Reveal where the tab already lives; moving it between groups would
      // rearrange the editor layout out from under the user. An explicit
      // command takes focus, unlike navigation.
      this.editorPanel.reveal(undefined, false);
      return;
    }

    this.createEditorPanel(column);
  }

  private createEditorPanel(column: vscode.ViewColumn): void {
    const panel = vscode.window.createWebviewPanel(
      this.panelViewType,
      this.panelTitle,
      column,
      { ...this.getWebviewOptions(), retainContextWhenHidden: true }
    );
    this.adoptEditorPanel(panel);
  }

  /**
   * Wires an editor tab to this provider. Used both for freshly created panels
   * and for panels VS Code restores after a window reload.
   */
  public adoptEditorPanel(panel: vscode.WebviewPanel, restoredState?: unknown): void {
    if (this.editorPanel && this.editorPanel !== panel) {
      // Only one editor tab per view; a restored duplicate replaces the old one.
      this.editorPanel.dispose();
    }

    // Restore before the HTML loads, so the first data load already targets
    // whatever the tab was showing when the window closed
    if (restoredState !== undefined) {
      this.restoreEditorState(restoredState);
    }

    // Options and HTML are not preserved across a reload, so always re-apply.
    panel.webview.options = this.getWebviewOptions();
    panel.webview.html = this.getHtmlForWebview(panel.webview);
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "resources", "beads-icon.svg");
    this.editorPanel = panel;

    const host: WebviewHost = {
      kind: "editor",
      webview: panel.webview,
      get visible() {
        return panel.visible;
      },
      get viewColumn() {
        return panel.viewColumn;
      },
      reveal: (preserveFocus) => panel.reveal(undefined, preserveFocus),
    };
    this.hosts.add(host);

    panel.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      await this.handleMessage(message, host);
    });

    // onDidChangeViewState also fires on focus changes, so only re-initialize on
    // an actual hidden -> visible transition.
    let wasVisible = panel.visible;
    panel.onDidChangeViewState(() => {
      if (panel.visible && !wasVisible) {
        this.initializeView(host);
      }
      wasVisible = panel.visible;
    });

    panel.onDidDispose(() => {
      this.hosts.delete(host);
      if (this.editorPanel === panel) {
        this.editorPanel = undefined;
      }
    });
  }

  /**
   * Reveals this view on the surface the request came from, so a sidebar
   * action stays in the sidebar and an editor action stays in the editor.
   * Falls back to whatever surface exists when the preferred one does not.
   */
  protected revealHost(origin?: NavigationOrigin): void {
    if (origin?.surface === "editor") {
      this.revealEditorHost(origin.viewColumn);
      return;
    }
    this.revealSidebarHost();
  }

  /**
   * Guarantees the editor surface exists before revealing it, so the caller
   * cannot leave a request stranded on the wrong surface. Never falls back to
   * the sidebar: doing nothing beats moving the user somewhere they did not ask
   * to go.
   */
  private revealEditorHost(column?: vscode.ViewColumn): void {
    if (!this.editorPanel) {
      // Open beside the view the request came from, not wherever focus happens
      // to be
      this.createEditorPanel(column ?? vscode.ViewColumn.Active);
      return;
    }

    // Navigation reveals in place and leaves focus where the user put it
    this.editorPanel.reveal(undefined, true);
  }

  private revealSidebarHost(): void {
    const sidebar = [...this.hosts].find((host) => host.kind === "sidebar");
    if (sidebar) {
      sidebar.reveal(true); // true = preserve focus
      return;
    }

    // The sidebar view has never been resolved; focusing it registers a host
    vscode.commands.executeCommand(`${this.viewType}.focus`);
  }

  /**
   * Restores state persisted by the webview when an editor tab is recreated.
   * Override in subclasses that carry a selection.
   */
  protected restoreEditorState(_state: unknown): void {
    // Default: nothing to restore
  }

  /**
   * Renames the editor tab, e.g. to show the bead currently being viewed.
   */
  protected setEditorPanelTitle(title: string): void {
    if (this.editorPanel) {
      this.editorPanel.title = title;
    }
  }

  /** True when any surface showing this view is visible. */
  protected get isVisible(): boolean {
    for (const host of this.hosts) {
      if (host.visible) {
        return true;
      }
    }
    return false;
  }

  private getWebviewOptions(): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };
  }

  /**
   * Initializes the view with current data. When `target` is given, only that
   * surface is seeded - the others already have this state.
   */
  protected async initializeView(target?: WebviewHost): Promise<void> {
    if (this.hosts.size === 0) {
      return;
    }

    // Send view type
    this.postMessage({ type: "setViewType", viewType: this.viewType }, target);

    // Send current project
    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project }, target);

    // Send all available projects
    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects }, target);

    // Send settings
    const config = vscode.workspace.getConfiguration("beads");
    // User ID: prefer setting, fallback to $USER, then "unknown"
    const rawUserId = config.get<string>("userId", "");
    const userId = resolveEnvVariables(rawUserId || "") || process.env.USER || process.env.USERNAME || "unknown";
    this.postMessage({
      type: "setSettings",
      settings: {
        renderMarkdown: config.get<boolean>("renderMarkdown", true),
        userId,
        tooltipHoverDelay: config.get<number>("tooltipHoverDelay", 1000),
      },
    }, target);

    // Load view-specific data only while some surface is visible.
    if (this.isVisible) {
      await this.loadData("initial");
    }
  }

  /**
   * Loads view-specific data. Override in subclasses.
   */
  protected abstract loadData(reason?: "initial" | "projectChange" | "manualRefresh" | "background"): Promise<void>;

  /**
   * Handles messages from the webview. Override in subclasses for custom handling.
   */
  protected async handleMessage(
    message: WebviewToExtensionMessage,
    host?: WebviewHost
  ): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.initializeView(host);
        break;

      case "refresh":
        await this.loadData("manualRefresh");
        break;

      case "selectProject": {
        let switched = await this.projectManager.setActiveProject(message.projectId);
        if (!switched && message.projectRootPath) {
          const fallback = this.projectManager
            .getProjects()
            .find((project) => project.rootPath === message.projectRootPath);
          if (fallback) {
            switched = await this.projectManager.setActiveProject(fallback.id);
          }
        }
        break;
      }

      case "selectBead":
        this.openBeadDetails(message.beadId, host);
        break;

      case "showDoltStatus":
        vscode.commands.executeCommand("beads.showDoltStatus");
        break;

      case "startDoltServer":
        vscode.commands.executeCommand("beads.startDoltServer");
        break;

      case "stopDoltServer":
        vscode.commands.executeCommand("beads.stopDoltServer");
        break;

      case "openDoltLog":
        vscode.commands.executeCommand("beads.openDoltLog");
        break;

      case "openProjectFolder": {
        const project = this.projectManager.getActiveProject();
        if (project) {
          await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(project.rootPath));
        }
        break;
      }

      case "openBeadDetails":
        this.openBeadDetails(message.beadId, host);
        break;

      case "viewInGraph":
        // Focus the graph view and highlight the bead
        vscode.commands.executeCommand("beadsGraph.focus");
        break;

      case "copyBeadId":
        if (message.beadId) {
          await vscode.env.clipboard.writeText(message.beadId);
          vscode.window.setStatusBarMessage(`$(check) Copied: ${message.beadId}`, 2000);
        }
        break;

      case "openFile":
        await this.handleOpenFile(message.filePath, message.line);
        break;

      default:
        await this.handleCustomMessage(message);
    }
  }

  /**
   * Opens a bead's details. A request from an editor tab keeps the user in the
   * editor area rather than revealing the sidebar Details view.
   */
  private openBeadDetails(beadId: string, host?: WebviewHost): void {
    const origin: NavigationOrigin =
      host?.kind === "editor"
        ? { surface: "editor", viewColumn: host.viewColumn }
        : { surface: "sidebar" };

    vscode.commands.executeCommand("beads.openBeadDetails", beadId, origin);
  }

  /**
   * Override in subclasses to handle view-specific messages
   */
  protected async handleCustomMessage(
    _message: WebviewToExtensionMessage
  ): Promise<void> {
    // Default: do nothing
  }

  /**
   * Opens a file in the editor, optionally at a specific line
   */
  private async handleOpenFile(filePath: string, line?: number): Promise<void> {
    const project = this.projectManager.getActiveProject();
    if (!project) {
      vscode.window.showWarningMessage("No active project");
      return;
    }

    // Resolve path relative to project root
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : vscode.Uri.joinPath(vscode.Uri.file(project.rootPath), filePath).fsPath;

    const fileUri = vscode.Uri.file(resolvedPath);

    try {
      // Check if file exists
      await vscode.workspace.fs.stat(fileUri);

      // Open the file
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(doc);

      // If line specified, scroll to it
      if (line !== undefined && line > 0) {
        const lineIndex = line - 1; // VS Code uses 0-based line numbers
        const position = new vscode.Position(lineIndex, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch (err) {
      vscode.window.showWarningMessage(`File not found: ${filePath}`);
    }
  }

  /**
   * Sends a message to the webview. Broadcasts to every surface showing this
   * view unless a specific `target` is given.
   */
  protected postMessage(message: ExtensionToWebviewMessage, target?: WebviewHost): void {
    if (target) {
      target.webview.postMessage(message);
      return;
    }
    for (const host of this.hosts) {
      host.webview.postMessage(message);
    }
  }

  /**
   * Sets the loading state in the webview
   */
  protected setLoading(loading: boolean): void {
    this.postMessage({ type: "setLoading", loading });
  }

  /**
   * Sets an error message in the webview
   */
  protected setError(error: string | null): void {
    this.postMessage({ type: "setError", error });
  }

  /**
   * Handles backend connection errors - logs and notifies ProjectManager
   * Views show error state in UI; centralized notification handled by ProjectManager
   */
  protected handleBackendError(message: string, err: unknown): void {
    this.log.error(`${message}: ${err}`);
    // ProjectManager handles notification details - views just update their error state
    this.projectManager.notifyBackendError(err);
  }

  /**
   * Triggers a refresh of the view
   */
  public refresh(): void {
    if (!this.isVisible) {
      return;
    }

    this.postProjectState();
    this.loadData("background");
  }

  public hardRefresh(): void {
    if (!this.isVisible) {
      return;
    }

    this.postProjectState();
    this.loadData("manualRefresh");
  }

  /**
   * Triggers a refresh intended for active project switches.
   */
  public refreshForProjectChange(): void {
    if (!this.isVisible) {
      return;
    }

    this.postProjectState();
    this.loadData("projectChange");
  }

  /**
   * Pushes the active project and the project list (for dropdown status
   * indicators) to the webview.
   */
  private postProjectState(): void {
    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });
  }

  /**
   * Generates the HTML content for the webview
   */
  protected getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "main.js")
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "main.css")
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Beads</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generates a random nonce for CSP
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
