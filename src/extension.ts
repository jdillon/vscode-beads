/**
 * Beads VS Code Extension - Main Entry Point
 *
 * Simplified to two views:
 * - Issues: List of all beads
 * - Details: Selected bead details
 */

import * as vscode from "vscode";
import { BeadsProjectManager } from "./backend/BeadsProjectManager";
import { DashboardViewProvider } from "./views/DashboardViewProvider";
import { BeadsPanelViewProvider } from "./views/BeadsPanelViewProvider";
import { BeadDetailsViewProvider } from "./views/BeadDetailsViewProvider";

let outputChannel: vscode.OutputChannel;
let projectManager: BeadsProjectManager;
let dashboardProvider: DashboardViewProvider;
let beadsPanelProvider: BeadsPanelViewProvider;
let detailsProvider: BeadDetailsViewProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Beads Dashboard");
  outputChannel.appendLine("Beads Dashboard extension activating...");

  // Initialize the project manager
  projectManager = new BeadsProjectManager(outputChannel);
  await projectManager.initialize();

  // Create view providers
  dashboardProvider = new DashboardViewProvider(
    context.extensionUri,
    projectManager,
    outputChannel
  );

  beadsPanelProvider = new BeadsPanelViewProvider(
    context.extensionUri,
    projectManager,
    outputChannel
  );

  detailsProvider = new BeadDetailsViewProvider(
    context.extensionUri,
    projectManager,
    outputChannel
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
      outputChannel.appendLine("[Refresh] Manual refresh triggered");
      await projectManager.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
      outputChannel.appendLine("[Refresh] Complete");
      vscode.window.setStatusBarMessage("$(check) Beads refreshed", 2000);
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
        vscode.window.showInformationMessage(`Created bead: ${created.id}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create bead: ${err}`);
      }
    }),

    vscode.commands.registerCommand("beads.startDaemon", async () => {
      const started = await projectManager.ensureDaemonRunning();
      if (started) {
        vscode.window.showInformationMessage("Beads daemon started");
      } else {
        vscode.window.showErrorMessage("Failed to start Beads daemon");
      }
    }),

    vscode.commands.registerCommand("beads.stopDaemon", async () => {
      const stopped = await projectManager.stopDaemon();
      if (stopped) {
        vscode.window.showInformationMessage("Beads daemon stopped");
      } else {
        vscode.window.showErrorMessage("Failed to stop Beads daemon");
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
    })
  );

  // Add project manager to subscriptions for disposal
  context.subscriptions.push(projectManager);
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine("Beads Dashboard extension activated");

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
  outputChannel?.appendLine("Beads Dashboard extension deactivating...");
}
