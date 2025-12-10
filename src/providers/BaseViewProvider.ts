/**
 * BaseViewProvider - Abstract base class for all Beads webview providers
 *
 * Provides common functionality for:
 * - Setting up webview content
 * - Message passing between extension and webview
 * - Loading/error states
 * - Project context
 */

import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../backend/types";
import { Logger } from "../utils/logger";

export abstract class BaseViewProvider implements vscode.WebviewViewProvider {
  protected _view?: vscode.WebviewView;
  protected readonly extensionUri: vscode.Uri;
  protected readonly projectManager: BeadsProjectManager;
  protected readonly log: Logger;
  protected abstract readonly viewType: string;

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
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      await this.handleMessage(message);
    });

    // Initialize the view when it becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.initializeView();
      }
    });

    // Initial setup
    this.initializeView();
  }

  /**
   * Initializes the view with current data
   */
  protected async initializeView(): Promise<void> {
    if (!this._view) {
      return;
    }

    // Send view type
    this.postMessage({ type: "setViewType", viewType: this.viewType });

    // Send current project
    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    // Send all available projects
    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });

    // Send settings
    const config = vscode.workspace.getConfiguration("beads");
    // User ID: prefer setting, fallback to $USER, then "unknown"
    const userId = config.get<string>("userId", "") || process.env.USER || process.env.USERNAME || "unknown";
    this.postMessage({
      type: "setSettings",
      settings: {
        renderMarkdown: config.get<boolean>("renderMarkdown", true),
        userId,
      },
    });

    // Load view-specific data
    await this.loadData();
  }

  /**
   * Loads view-specific data. Override in subclasses.
   */
  protected abstract loadData(): Promise<void>;

  /**
   * Handles messages from the webview. Override in subclasses for custom handling.
   */
  protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.initializeView();
        break;

      case "refresh":
        await this.loadData();
        break;

      case "selectProject":
        await this.projectManager.setActiveProject(message.projectId);
        break;

      case "selectBead":
        vscode.commands.executeCommand("beads.openBeadDetails", message.beadId);
        break;

      case "openBeadDetails":
        vscode.commands.executeCommand("beads.openBeadDetails", message.beadId);
        break;

      case "viewInGraph":
        // Focus the graph view and highlight the bead
        vscode.commands.executeCommand("beadsGraph.focus");
        break;

      case "startDaemon":
        await this.projectManager.ensureDaemonRunning();
        await this.loadData();
        break;

      case "stopDaemon":
        await this.projectManager.stopDaemon();
        break;

      case "copyBeadId":
        if (message.beadId) {
          await vscode.env.clipboard.writeText(message.beadId);
          vscode.window.setStatusBarMessage(`$(check) Copied: ${message.beadId}`, 2000);
        }
        break;

      default:
        await this.handleCustomMessage(message);
    }
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
   * Sends a message to the webview
   */
  protected postMessage(message: ExtensionToWebviewMessage): void {
    if (this._view) {
      this._view.webview.postMessage(message);
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
   * Handles daemon connection errors - logs and notifies ProjectManager
   * Views show error state in UI; centralized notification handled by ProjectManager
   */
  protected handleDaemonError(message: string, err: unknown): void {
    this.log.error(`${message}: ${err}`);
    // ProjectManager handles the notification - views just update their error state
    this.projectManager.notifyDaemonError(err);
  }

  /**
   * Triggers a refresh of the view
   */
  public refresh(): void {
    // Update project state in webview
    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    // Also update projects list (for dropdown status indicators)
    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });

    this.loadData();
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
