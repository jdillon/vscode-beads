/**
 * Beads Dashboard VS Code Extension - Main Entry Point
 *
 * This extension provides rich views for managing Beads issues:
 * - Beads Panel: Table/list view with filtering and sorting
 * - Dashboard: Summary cards and statistics
 * - Kanban Board: Drag-and-drop status management
 * - Dependency Graph: Visual relationship mapping
 * - Bead Details: Full editing of individual beads
 *
 * All data operations go through the BeadsBackend which talks to the `bd` CLI.
 */

import * as vscode from "vscode";
import { BeadsProjectManager } from "./backend/BeadsProjectManager";
import { BeadsBackend } from "./backend/BeadsBackend";
import { BeadsPanelViewProvider } from "./views/BeadsPanelViewProvider";
import { DashboardViewProvider } from "./views/DashboardViewProvider";
import { KanbanViewProvider } from "./views/KanbanViewProvider";
import { DependencyGraphViewProvider } from "./views/DependencyGraphViewProvider";
import { BeadDetailsViewProvider } from "./views/BeadDetailsViewProvider";
import { Bead } from "./backend/types";

let outputChannel: vscode.OutputChannel;
let projectManager: BeadsProjectManager;
let beadsPanelProvider: BeadsPanelViewProvider;
let dashboardProvider: DashboardViewProvider;
let kanbanProvider: KanbanViewProvider;
let graphProvider: DependencyGraphViewProvider;
let detailsProvider: BeadDetailsViewProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("Beads Dashboard");
  outputChannel.appendLine("Beads Dashboard extension activating...");

  // Initialize the project manager
  projectManager = new BeadsProjectManager(outputChannel);
  await projectManager.initialize();

  // Create view providers
  beadsPanelProvider = new BeadsPanelViewProvider(
    context.extensionUri,
    projectManager,
    outputChannel
  );

  dashboardProvider = new DashboardViewProvider(
    context.extensionUri,
    projectManager,
    outputChannel
  );

  kanbanProvider = new KanbanViewProvider(
    context.extensionUri,
    projectManager,
    outputChannel
  );

  graphProvider = new DependencyGraphViewProvider(
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
    vscode.window.registerWebviewViewProvider("beadsPanel", beadsPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsDashboard", dashboardProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsKanban", kanbanProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsGraph", graphProvider, {
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

    vscode.commands.registerCommand("beads.openDashboard", () => {
      vscode.commands.executeCommand("beadsDashboard.focus");
    }),

    vscode.commands.registerCommand("beads.openBeadsPanel", () => {
      vscode.commands.executeCommand("beadsPanel.focus");
    }),

    vscode.commands.registerCommand("beads.openKanban", () => {
      vscode.commands.executeCommand("beadsKanban.focus");
    }),

    vscode.commands.registerCommand("beads.openDependencyGraph", () => {
      vscode.commands.executeCommand("beadsGraph.focus");
    }),

    vscode.commands.registerCommand("beads.openBeadDetails", async (beadId?: string) => {
      if (!beadId) {
        // Prompt for bead ID
        const backend = projectManager.getBackend();
        if (!backend) {
          vscode.window.showWarningMessage("No active Beads project");
          return;
        }

        const beadsResult = await backend.listBeads();
        if (!beadsResult.success || !beadsResult.data) {
          vscode.window.showErrorMessage("Failed to load beads");
          return;
        }

        const items = beadsResult.data.map((bead) => ({
          label: bead.title,
          description: bead.id,
          detail: `Status: ${bead.status} | Priority: ${bead.priority ?? "N/A"}`,
          bead,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a bead to view details",
        });

        if (selected) {
          beadId = selected.bead.id;
        }
      }

      if (beadId) {
        detailsProvider.showBead(beadId);
        vscode.commands.executeCommand("beadsDetails.focus");
      }
    }),

    vscode.commands.registerCommand("beads.refresh", async () => {
      await projectManager.refresh();
      beadsPanelProvider.refresh();
      dashboardProvider.refresh();
      kanbanProvider.refresh();
      graphProvider.refresh();
      detailsProvider.refresh();
    }),

    vscode.commands.registerCommand("beads.createBead", async () => {
      const backend = projectManager.getBackend();
      if (!backend) {
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
        ["bug", "feature", "task", "enhancement", "docs"],
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

      const result = await backend.createBead({
        title,
        type: type || undefined,
        priority: priority?.value as 0 | 1 | 2 | 3 | 4 | undefined,
        status: "backlog",
      });

      if (result.success && result.data) {
        vscode.window.showInformationMessage(`Created bead: ${result.data.id}`);
        vscode.commands.executeCommand("beads.refresh");
      } else {
        vscode.window.showErrorMessage(`Failed to create bead: ${result.error}`);
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

  // Subscribe to project changes to refresh all views
  context.subscriptions.push(
    projectManager.onDataChanged(() => {
      beadsPanelProvider.refresh();
      dashboardProvider.refresh();
      kanbanProvider.refresh();
      graphProvider.refresh();
    }),

    projectManager.onActiveProjectChanged(() => {
      beadsPanelProvider.refresh();
      dashboardProvider.refresh();
      kanbanProvider.refresh();
      graphProvider.refresh();
      detailsProvider.refresh();
    })
  );

  // Set up auto-refresh if configured
  const config = vscode.workspace.getConfiguration("beads");
  const refreshInterval = config.get<number>("refreshInterval", 30000);

  if (refreshInterval > 0) {
    const intervalId = setInterval(() => {
      projectManager.refresh();
    }, refreshInterval);

    context.subscriptions.push({
      dispose: () => clearInterval(intervalId),
    });
  }

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
