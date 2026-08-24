/**
 * Beads VS Code Extension - Main Entry Point
 *
 * Simplified to two views:
 * - Issues: List of all beads
 * - Details: Selected bead details
 */

import * as vscode from "vscode";
import { BeadsProjectManager } from "./backend/BeadsProjectManager";
import { DashboardViewProvider } from "./providers/DashboardViewProvider";
import { BeadsPanelViewProvider } from "./providers/BeadsPanelViewProvider";
import { BeadDetailsViewProvider } from "./providers/BeadDetailsViewProvider";
import { BeadsWorkbenchViewProvider } from "./providers/BeadsWorkbenchViewProvider";
import { BaseViewProvider } from "./providers/BaseViewProvider";
import { createLogger, Logger } from "./utils/logger";

let log: Logger;
let projectManager: BeadsProjectManager;
let dashboardProvider: DashboardViewProvider;
let beadsPanelProvider: BeadsPanelViewProvider;
let detailsProvider: BeadDetailsViewProvider;
let workbenchProvider: BeadsWorkbenchViewProvider;
let statusBar: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Create the root logger with LogOutputChannel
  log = createLogger("Beads");

  // Log activation with version and timestamp for debugging
  const ext = context.extension;
  const version = ext.packageJSON.version || "unknown";
  const isDev = ext.extensionPath.includes("-dev") || !ext.extensionPath.includes(".vscode");
  const timestamp = new Date().toISOString();
  log.info(`Activating v${version}${isDev ? " (dev)" : ""} @ ${timestamp}`);

  const config = vscode.workspace.getConfiguration("beads");
  const configuredProjects = config.get<string[]>("projects", []);
  const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  log.debug(`config.pathToBd=${config.get<string>("pathToBd", "bd")}`);
  log.debug(`config.projects=${configuredProjects.length > 0 ? configuredProjects.join(",") : "<none>"}`);
  log.debug(`config.refreshInterval=${config.get<number>("refreshInterval", 3000)}`);
  log.debug(`config.renderMarkdown=${config.get<boolean>("renderMarkdown", true)}`);
  log.debug(`config.userId=${config.get<string>("userId", "") || "<empty>"}`);
  log.debug(`config.tooltipHoverDelay=${config.get<number>("tooltipHoverDelay", 1000)}`);
  log.debug(`config.workspaceFolders=${workspaceFolders.length > 0 ? workspaceFolders.join(",") : "<none>"}`);

  // Initialize the project manager
  projectManager = new BeadsProjectManager(context, log);
  await projectManager.initialize();

  // Initialize context for conditional menu items
  vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", false);

  // Create view providers
  dashboardProvider = new DashboardViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  beadsPanelProvider = new BeadsPanelViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  detailsProvider = new BeadDetailsViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  // Combined Dashboard/Issues/Details panel - editor tabs only, never a sidebar view
  workbenchProvider = new BeadsWorkbenchViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  // Register webview providers
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("beadsDashboard", dashboardProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsPanel", beadsPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsDetails", detailsProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Restore Beads editor tabs after a window reload
  const editorPanelProviders: Array<[string, BaseViewProvider]> = [
    ["beads.dashboardEditor", dashboardProvider],
    ["beads.issuesEditor", beadsPanelProvider],
    ["beads.detailsEditor", detailsProvider],
    ["beads.workbenchEditor", workbenchProvider],
  ];
  for (const [panelViewType, provider] of editorPanelProviders) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(panelViewType, {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
          provider.adoptEditorPanel(panel);
        },
      })
    );
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("beads.switchProject", async () => {
      await projectManager.showProjectPicker();
    }),

    vscode.commands.registerCommand("beads.openBeadsPanel", () => {
      vscode.commands.executeCommand("beadsPanel.focus");
    }),

    // Editor-tab entry points to the same views
    vscode.commands.registerCommand("beads.openDashboardInEditor", () => {
      dashboardProvider.showInEditor();
    }),

    vscode.commands.registerCommand("beads.openIssuesInEditor", () => {
      beadsPanelProvider.showInEditor();
    }),

    vscode.commands.registerCommand("beads.openDetailsInEditor", () => {
      detailsProvider.showInEditor();
    }),

    vscode.commands.registerCommand("beads.openWorkbench", () => {
      workbenchProvider.showInEditor();
    }),

    vscode.commands.registerCommand("beads.openBeadDetails", async (
      beadId?: string,
      options?: { preferEditor?: boolean }
    ) => {
      if (!beadId) {
        // Prompt for bead ID
        const client = projectManager.getClient();
        if (!client) {
          vscode.window.showWarningMessage("No active Beads project");
          return;
        }

        try {
          const beads = await client.list();
          const items = beads.map((bead) => ({
            label: bead.title,
            description: bead.id,
            detail: `Status: ${bead.status} | Priority: P${bead.priority}`,
            bead,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Select a bead to view details",
          });

          if (selected) {
            beadId = selected.bead.id;
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to load beads: ${err}`);
          return;
        }
      }

      if (beadId) {
        // Requested from an editor tab: keep the user in the editor area
        // rather than revealing the sidebar Details view
        if (options?.preferEditor) {
          detailsProvider.showInEditor();
        }
        detailsProvider.showBead(beadId);
        beadsPanelProvider.setSelectedBead(beadId);
      }
    }),

    vscode.commands.registerCommand("beads.refresh", async () => {
      log.info("Manual refresh triggered");
      await projectManager.refresh();
      dashboardProvider.hardRefresh();
      beadsPanelProvider.hardRefresh();
      detailsProvider.hardRefresh();
      workbenchProvider.hardRefresh();
      log.info("Refresh complete");
      vscode.window.setStatusBarMessage("$(check) Beads: Refreshed", 2000);
    }),

    vscode.commands.registerCommand("beads.startDoltServer", async () => {
      const client = projectManager.getClient();
      const project = projectManager.getActiveProject();
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      try {
        const output = await client.startDoltServer();
        log.info(`Started Dolt server for ${project.name}: ${output || "<no output>"}`);
        await projectManager.refresh();
        dashboardProvider.refresh();
        beadsPanelProvider.refresh();
        detailsProvider.refresh();
        workbenchProvider.refresh();
        await updateStatusBar();
        vscode.window.showInformationMessage(`Dolt server started for ${project.name}.`);
      } catch (err) {
        await log.errorNotify(`Failed to start Dolt server: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.stopDoltServer", async () => {
      const client = projectManager.getClient();
      const project = projectManager.getActiveProject();
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      try {
        const output = await client.stopDoltServer();
        log.info(`Stopped Dolt server for ${project.name}: ${output || "<no output>"}`);
        await projectManager.refresh();
        dashboardProvider.refresh();
        beadsPanelProvider.refresh();
        detailsProvider.refresh();
        workbenchProvider.refresh();
        await updateStatusBar();
        vscode.window.showInformationMessage(`Dolt server stopped for ${project.name}.`);
      } catch (err) {
        await log.errorNotify(`Failed to stop Dolt server: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.showDoltStatus", async () => {
      const client = projectManager.getClient();
      const project = projectManager.getActiveProject();
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      try {
        const output = await client.doltStatus();
        log.info(`Dolt status for ${project.name}:\n${output || "<no output>"}`);
        vscode.window.showInformationMessage(`Dolt status logged for ${project.name}. Check Output > Beads.`);
      } catch (err) {
        await log.errorNotify(`Failed to get Dolt status: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.openDoltLog", async () => {
      const project = projectManager.getActiveProject();
      if (!project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      const logUri = vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(project.beadsDir), "dolt-server.log").fsPath);
      try {
        const doc = await vscode.workspace.openTextDocument(logUri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err) {
        await log.errorNotify(`Failed to open Dolt log: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.copyBeadId", async () => {
      // The command is reachable from the palette with only the workbench
      // open, so fall back to that panel's selection
      const beadId = detailsProvider.getCurrentBeadId() ?? workbenchProvider.getCurrentBeadId();
      if (beadId) {
        await vscode.env.clipboard.writeText(beadId);
        vscode.window.setStatusBarMessage(`$(check) Copied: ${beadId}`, 2000);
      } else {
        vscode.window.showWarningMessage("No bead selected");
      }
    })
  );

  // Create status bar item
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = "beads.showStatusMenu";
  context.subscriptions.push(statusBar);

  // Register status menu command
  context.subscriptions.push(
    vscode.commands.registerCommand("beads.showStatusMenu", async () => {
      const project = projectManager.getActiveProject();
      if (!project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      const status = await projectManager.getBackendStatus();
      const items: vscode.QuickPickItem[] = [];

      items.push(
        { label: "$(refresh) Refresh", description: "Refresh Beads data" },
        { label: "$(server-process) Dolt Status", description: "Log Dolt server status" },
        { label: "$(play) Start Dolt", description: "Start the Dolt server for this project" },
        { label: "$(debug-stop) Stop Dolt", description: "Stop the Dolt server for this project" },
        { label: "$(output) Show Logs", description: "Open Beads output panel" }
      );

      const selected = await vscode.window.showQuickPick(items, {
        title: `Beads: ${project.name} (${status.state})`,
        placeHolder: status.message,
      });

      if (selected) {
        if (selected.label.includes("Refresh")) {
          vscode.commands.executeCommand("beads.refresh");
        } else if (selected.label.includes("Dolt Status")) {
          vscode.commands.executeCommand("beads.showDoltStatus");
        } else if (selected.label.includes("Start Dolt")) {
          vscode.commands.executeCommand("beads.startDoltServer");
        } else if (selected.label.includes("Stop Dolt")) {
          vscode.commands.executeCommand("beads.stopDoltServer");
        } else if (selected.label.includes("Show Logs")) {
          log.show();
        }
      }
    })
  );

  // Subscribe to project changes to refresh views
  context.subscriptions.push(
    projectManager.onDataChanged(() => {
      dashboardProvider.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
      workbenchProvider.refresh();
    }),

    projectManager.onActiveProjectChanged(() => {
      beadsPanelProvider.setSelectedBead(null); // Clear selection on project switch
      dashboardProvider.refreshForProjectChange();
      beadsPanelProvider.refreshForProjectChange();
      detailsProvider.refreshForProjectChange();
      workbenchProvider.refreshForProjectChange();
      updateStatusBar();
    }),

    // Refresh projects when workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      log.info("Workspace folders changed, refreshing projects...");
      const previousActiveId = projectManager.getActiveProject()?.id;
      await projectManager.discoverProjects();

      // If active project was removed, switch to first available
      const projects = projectManager.getProjects();
      const activeStillExists = projects.some((p) => p.id === previousActiveId);

      if (!activeStillExists && projects.length > 0) {
        log.info("Active project removed, switching to first available");
        await projectManager.setActiveProject(projects[0].id);
      } else if (projects.length === 0) {
        log.info("No beads projects remaining");
          updateStatusBar();
      }

      // Refresh all views
      dashboardProvider.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
      workbenchProvider.refresh();
    })
  );

  // Add project manager and logger to subscriptions for disposal
  context.subscriptions.push(projectManager);
  context.subscriptions.push(log.outputChannel);

  // Initialize status bar
  updateStatusBar();

  log.info("Extension activated");

  // Show warning if no projects found
  if (projectManager.getProjects().length === 0) {
    vscode.window.showInformationMessage(
      "No Beads projects found in the workspace. Initialize a project with `bd init` to get started.",
      "Learn More"
    ).then((action) => {
      if (action === "Learn More") {
        vscode.env.openExternal(vscode.Uri.parse("https://github.com/gastownhall/beads"));
      }
    });
  }
}

export function deactivate(): void {
  log?.info("Extension deactivating...");
}

/**
 * Updates the Beads status bar item based on current project state
 */
async function updateStatusBar(): Promise<void> {
  const project = projectManager.getActiveProject();

  if (!project) {
    statusBar.hide();
    return;
  }

  const status = await projectManager.getBackendStatus();

  switch (status.state) {
    case "running":
      statusBar.text = "$(check) Beads";
      statusBar.backgroundColor = undefined;
      statusBar.tooltip = `Beads ready for ${project.name}\n${status.message}\nClick for options`;
      break;
    case "stopped":
      statusBar.text = "$(circle-slash) Beads";
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBar.tooltip = `Beads unavailable for ${project.name}\n${status.message}\nCheck Output > Beads for details`;
      break;
    case "zombie":
      statusBar.text = "$(warning) Beads";
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBar.tooltip = `Beads backend unhealthy for ${project.name}\n${status.message}\nCheck Output > Beads for details`;
      break;
    case "not_initialized":
      statusBar.text = "$(circle-slash) Beads";
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBar.tooltip = `Project not initialized: ${project.name}\n${status.message}`;
      break;
    default:
      statusBar.text = "$(question) Beads";
      statusBar.backgroundColor = undefined;
      statusBar.tooltip = `Unknown state for ${project.name}\n${status.message}`;
  }

  statusBar.show();
}
