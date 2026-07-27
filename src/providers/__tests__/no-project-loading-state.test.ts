import * as vscode from "vscode";
import { BeadsPanelViewProvider } from "../BeadsPanelViewProvider";
import { DashboardViewProvider } from "../DashboardViewProvider";
import { BeadsProjectManager } from "../../backend/BeadsProjectManager";
import { BaseViewProvider } from "../BaseViewProvider";
import { ExtensionToWebviewMessage } from "../../backend/types";
import { Logger } from "../../utils/logger";

type ProviderCtor = new (
  extensionUri: vscode.Uri,
  projectManager: BeadsProjectManager,
  logger: Logger
) => BaseViewProvider;

function createProvider(Provider: ProviderCtor) {
  const posted: ExtensionToWebviewMessage[] = [];

  // No active project => no backend client
  const projectManager = {
    getClient: () => null,
    getActiveProject: () => null,
    getProjects: () => [],
  } as unknown as BeadsProjectManager;

  const logger = new Logger(vscode.window.createOutputChannel() as unknown as vscode.LogOutputChannel);
  const provider = new Provider({} as vscode.Uri, projectManager, logger);

  // Stand in for the resolved webview view
  (provider as unknown as { _view: unknown })._view = {
    visible: true,
    webview: { postMessage: (message: ExtensionToWebviewMessage) => posted.push(message) },
  };

  const loadData = (provider as unknown as {
    loadData: (reason: "initial") => Promise<void>;
  }).loadData.bind(provider);

  return { loadData, posted };
}

describe.each([
  ["BeadsPanelViewProvider", BeadsPanelViewProvider as unknown as ProviderCtor],
  ["DashboardViewProvider", DashboardViewProvider as unknown as ProviderCtor],
])("%s without a backend client", (_name, Provider) => {
  it("clears the loading state so the webview can show the empty state", async () => {
    const { loadData, posted } = createProvider(Provider);

    await loadData("initial");

    expect(posted).toContainEqual({ type: "setLoading", loading: false });
    expect(posted).not.toContainEqual({ type: "setLoading", loading: true });
  });
});
