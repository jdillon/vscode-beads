import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage } from "../backend/types";
import { Logger } from "../utils/logger";
import { BaseViewProvider } from "./BaseViewProvider";

export class ProjectsViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsProjects";

  constructor(extensionUri: vscode.Uri, projectManager: BeadsProjectManager, logger: Logger) {
    super(extensionUri, projectManager, logger.child("Projects"));
  }

  protected async loadData(): Promise<void> {
    this.setError(null);
    this.setLoading(false);
  }

  protected async handleCustomMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case "showProjectMenu": {
        const switched = await this.projectManager.setActiveProject(message.projectId);
        if (switched) {
          await vscode.commands.executeCommand("beads.showStatusMenu");
        }
        break;
      }
      default:
        break;
    }
  }
}
