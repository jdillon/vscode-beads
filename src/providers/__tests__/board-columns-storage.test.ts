import * as vscode from "vscode";
import { createdPanels, resetWebviewPanels } from "../../__mocks__/vscode";
import { BeadsPanelViewProvider } from "../BeadsPanelViewProvider";
import { BeadsProjectManager } from "../../backend/BeadsProjectManager";
import { Logger } from "../../utils/logger";

const config = { version: 1 as const, columns: [
  { id: "ready", title: "Ready", color: "#3b82f6", filter: { isReady: true } },
] };

it("stores columns per project and broadcasts only accepted changes", async () => {
  resetWebviewPanels();
  let projectId = "a";
  const values = new Map<string, unknown>();
  const storage = {
    get: (key: string) => values.get(key),
    update: async (key: string, value: unknown) => { values.set(key, value); },
  } as vscode.Memento;
  const projectManager = {
    getActiveProject: () => ({ id: projectId, name: projectId }),
    getProjects: () => [],
    getClient: () => null,
  } as unknown as BeadsProjectManager;
  const logger = new Logger(vscode.window.createOutputChannel() as vscode.LogOutputChannel);
  const provider = new BeadsPanelViewProvider({} as vscode.Uri, projectManager, logger, storage);

  provider.showInEditor();
  const panel = createdPanels[0];
  const posted = jest.spyOn(panel.webview, "postMessage");
  await panel.webview.emit({ type: "ready" });
  expect(posted).toHaveBeenCalledWith({ type: "setBoardColumns", projectId: "a", config: null });

  await panel.webview.emit({ type: "saveBoardColumns", projectId: "a", config });
  expect(values.get("beads.boardColumns.a")).toEqual(config);
  expect(posted).toHaveBeenCalledWith({ type: "setBoardColumns", projectId: "a", config });

  await panel.webview.emit({ type: "saveBoardColumns", projectId: "other", config });
  await panel.webview.emit({ type: "saveBoardColumns", projectId: "a", config: { ...config, columns: [{ ...config.columns[0], color: "bad" }] } });
  expect(values.size).toBe(1);

  projectId = "b";
  provider.refreshForProjectChange();
  expect(posted).toHaveBeenCalledWith({ type: "setBoardColumns", projectId: "b", config: null });
  expect(values.get("beads.boardColumns.a")).toEqual(config);
});
