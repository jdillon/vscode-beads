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
import { createLogger, Logger } from "./utils/logger";

let log: Logger;
let projectManager: BeadsProjectManager;
let dashboardProvider: DashboardViewProvider;
let beadsPanelProvider: BeadsPanelViewProvider;
let detailsProvider: BeadDetailsViewProvider;
let daemonStatusBar: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Create the root logger with LogOutputChannel
  log = createLogger("Beads");

  // Log activation with version and timestamp for debugging
  const ext = context.extension;
  const version = ext.packageJSON.version || "unknown";
  const isDev = ext.extensionPath.includes("-dev") || !ext.extensionPath.includes(".vscode");
  const timestamp = new Date().toISOString();
  log.info(`Activating v${version}${isDev ? " (dev)" : ""} @ ${timestamp}`);

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

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("beads.switchProject", async () => {
      await projectManager.showProjectPicker();
    }),

    vscode.commands.registerCommand("beads.openBeadsPanel", () => {
      vscode.commands.executeCommand("beadsPanel.focus");
    }),

    vscode.commands.registerCommand("beads.openBeadDetails", async (beadId?: string) => {
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
        detailsProvider.showBead(beadId);
        beadsPanelProvider.setSelectedBead(beadId);
      }
    }),

    vscode.commands.registerCommand("beads.refresh", async () => {
      log.info("Manual refresh triggered");
      await projectManager.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
      log.info("Refresh complete");
      vscode.window.setStatusBarMessage("$(check) Beads: Refreshed", 2000);
    }),

    vscode.commands.registerCommand("beads.createBead", async () => {
      const client = projectManager.getClient();
      if (!client) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: "Enter bead title",
        placeHolder: "Bug: Something is broken",
      });

      if (!title) {
        return;
      }

      const type = await vscode.window.showQuickPick(
        ["bug", "feature", "task", "epic", "chore"],
        { placeHolder: "Select bead type (optional)" }
      );

      const priority = await vscode.window.showQuickPick(
        [
          { label: "Critical (P0)", value: 0 },
          { label: "High (P1)", value: 1 },
          { label: "Medium (P2)", value: 2 },
          { label: "Low (P3)", value: 3 },
          { label: "None (P4)", value: 4 },
        ],
        { placeHolder: "Select priority (optional)" }
      );

      try {
        const created = await client.create({
          title,
          issue_type: type || "task",
          priority: priority?.value ?? 2,
        });
        log.info(`Created bead: ${created.id}`);
        vscode.window.showInformationMessage(`Created bead: ${created.id}`);
      } catch (err) {
        log.error(`Failed to create bead: ${err}`);
        vscode.window.showErrorMessage(`Failed to create bead: ${err}`);
      }
    }),

    vscode.commands.registerCommand("beads.startDaemon", async () => {
      const started = await projectManager.ensureDaemonRunning();
      if (started) {
        vscode.window.showInformationMessage("Beads daemon started");
        updateDaemonStatusBar();
      } else {
        vscode.window.showErrorMessage("Failed to start Beads daemon");
      }
    }),

    vscode.commands.registerCommand("beads.stopDaemon", async () => {
      const stopped = await projectManager.stopDaemon();
      if (stopped) {
        vscode.window.showInformationMessage("Beads daemon stopped");
        updateDaemonStatusBar();
      } else {
        vscode.window.showErrorMessage("Failed to stop Beads daemon");
      }
    }),

    vscode.commands.registerCommand("beads.restartDaemon", async () => {
      const restarted = await projectManager.restartDaemon();
      if (restarted) {
        vscode.window.showInformationMessage("Beads daemon restarted");
        updateDaemonStatusBar();
      } else {
        vscode.window.showErrorMessage("Failed to restart Beads daemon");
      }
    }),

    vscode.commands.registerCommand("beads.checkDaemonStatus", async () => {
      await projectManager.refresh();
      updateDaemonStatusBar();
    }),

    vscode.commands.registerCommand("beads.copyBeadId", async () => {
      const beadId = detailsProvider.getCurrentBeadId();
      if (beadId) {
        await vscode.env.clipboard.writeText(beadId);
        vscode.window.setStatusBarMessage(`$(check) Copied: ${beadId}`, 2000);
      } else {
        vscode.window.showWarningMessage("No bead selected");
      }
    })
  );

  // Create daemon status bar item
  daemonStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  daemonStatusBar.command = "beads.showDaemonMenu";
  context.subscriptions.push(daemonStatusBar);

  // Register daemon menu command
  context.subscriptions.push(
    vscode.commands.registerCommand("beads.showDaemonMenu", async () => {
      const project = projectManager.getActiveProject();
      if (!project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      const status = await projectManager.getDaemonStatus();
      const items: vscode.QuickPickItem[] = [];

      if (status.state === "running") {
        items.push(
          { label: "$(debug-stop) Stop Daemon", description: "Stop the daemon for this project" },
          { label: "$(debug-restart) Restart Daemon", description: "Restart the daemon" },
          { label: "$(refresh) Check Status", description: "Refresh daemon status" }
        );
      } else if (status.state === "zombie") {
        items.push(
          { label: "$(warning) Restart Daemon", description: "Daemon is unhealthy, restart recommended" },
          { label: "$(debug-stop) Force Stop", description: "Force stop the zombie daemon" }
        );
      } else {
        items.push(
          { label: "$(play) Start Daemon", description: "Start the daemon for this project" },
          { label: "$(refresh) Check Status", description: "Refresh daemon status" }
        );
      }

      items.push({ label: "$(output) Show Logs", description: "Open Beads output panel" });

      const selected = await vscode.window.showQuickPick(items, {
        title: `Daemon: ${project.name} (${status.state})`,
        placeHolder: status.message,
      });

      if (selected) {
        if (selected.label.includes("Start")) {
          vscode.commands.executeCommand("beads.startDaemon");
        } else if (selected.label.includes("Stop")) {
          vscode.commands.executeCommand("beads.stopDaemon");
        } else if (selected.label.includes("Restart")) {
          vscode.commands.executeCommand("beads.restartDaemon");
        } else if (selected.label.includes("Check Status")) {
          vscode.commands.executeCommand("beads.checkDaemonStatus");
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
    }),

    projectManager.onActiveProjectChanged(() => {
      beadsPanelProvider.setSelectedBead(null); // Clear selection on project switch
      dashboardProvider.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
      updateDaemonStatusBar();
    })
  );

  // Add project manager and logger to subscriptions for disposal
  context.subscriptions.push(projectManager);
  context.subscriptions.push(log.outputChannel);

  // Initialize status bar
  updateDaemonStatusBar();

  log.info("Extension activated");

  // Show warning if no projects found
  if (projectManager.getProjects().length === 0) {
    vscode.window.showInformationMessage(
      "No Beads projects found in the workspace. Initialize a project with `bd init` to get started.",
      "Learn More"
    ).then((action) => {
      if (action === "Learn More") {
        vscode.env.openExternal(vscode.Uri.parse("https://github.com/steveyegge/beads"));
      }
    });
  }
}

export function deactivate(): void {
  log?.info("Extension deactivating...");
}

/**
 * Updates the daemon status bar item based on current project state
 */
async function updateDaemonStatusBar(): Promise<void> {
  const project = projectManager.getActiveProject();

  if (!project) {
    daemonStatusBar.hide();
    return;
  }

  const status = await projectManager.getDaemonStatus();

  switch (status.state) {
    case "running":
      daemonStatusBar.text = "$(check) Beads";
      daemonStatusBar.backgroundColor = undefined;
      daemonStatusBar.tooltip = `Daemon running for ${project.name}\n${status.message}\nClick for options`;
      break;
    case "stopped":
      daemonStatusBar.text = "$(circle-slash) Beads";
      daemonStatusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      daemonStatusBar.tooltip = `Daemon stopped for ${project.name}\n${status.message}\nClick to start`;
      break;
    case "zombie":
      daemonStatusBar.text = "$(warning) Beads";
      daemonStatusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      daemonStatusBar.tooltip = `Daemon unhealthy for ${project.name}\n${status.message}\nClick to restart`;
      break;
    case "not_initialized":
      daemonStatusBar.text = "$(circle-slash) Beads";
      daemonStatusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      daemonStatusBar.tooltip = `Project not initialized: ${project.name}\n${status.message}`;
      break;
    default:
      daemonStatusBar.text = "$(question) Beads";
      daemonStatusBar.backgroundColor = undefined;
      daemonStatusBar.tooltip = `Unknown state for ${project.name}\n${status.message}`;
  }

  daemonStatusBar.show();
}
