/**
 * Coverage for the editor-tab surfaces: host lifecycle, synchronization of a
 * newly opened tab, source-aware navigation, serializer restoration, and
 * project switching.
 */

import * as vscode from "vscode";
import {
  createFakeWebview,
  createdPanels,
  resetWebviewPanels,
  FakeWebview,
} from "../../__mocks__/vscode";
import { BeadDetailsViewProvider } from "../BeadDetailsViewProvider";
import { DashboardViewProvider } from "../DashboardViewProvider";
import { BeadsProjectManager } from "../../backend/BeadsProjectManager";
import { ExtensionToWebviewMessage } from "../../backend/types";
import { Logger } from "../../utils/logger";

interface Harness<T> {
  provider: T;
  posted: ExtensionToWebviewMessage[];
  /** Registers a resolved sidebar view and returns its webview. */
  attachSidebar: () => FakeWebview;
  setActiveProjectId: (id: string | null) => void;
}

/** A logger backed by the mock output channel. */
function makeLogger(): Logger {
  return new Logger(
    vscode.window.createOutputChannel() as unknown as vscode.LogOutputChannel
  );
}

/**
 * Builds a provider with a stubbed project manager that has no backend client,
 * so tests exercise surface behavior without touching bd.
 */
function harness<T>(
  Provider: new (uri: vscode.Uri, pm: BeadsProjectManager, log: Logger) => T,
  activeProjectId: string | null = "project-a"
): Harness<T> {
  const posted: ExtensionToWebviewMessage[] = [];
  let projectId = activeProjectId;

  const projectManager = {
    getClient: () => null,
    getActiveProject: () => (projectId ? { id: projectId, name: projectId } : null),
    getProjects: () => [],
  } as unknown as BeadsProjectManager;

  const provider = new Provider({} as vscode.Uri, projectManager, makeLogger());

  const attachSidebar = (): FakeWebview => {
    const webview = createFakeWebview(posted as unknown[]);
    const view = {
      webview,
      visible: true,
      viewColumn: undefined,
      show: () => undefined,
      onDidChangeVisibility: () => ({ dispose: () => undefined }),
      onDidDispose: () => ({ dispose: () => undefined }),
    };
    (provider as unknown as {
      resolveWebviewView: (v: unknown, c: unknown, t: unknown) => void;
    }).resolveWebviewView(view, {}, {});
    return webview;
  };

  return {
    provider,
    posted,
    attachSidebar,
    setActiveProjectId: (id) => {
      projectId = id;
    },
  };
}

beforeEach(() => {
  resetWebviewPanels();
  jest.restoreAllMocks();
});

describe("editor tab lifecycle", () => {
  it("creates one panel and reveals the existing tab in place on reopen", () => {
    const { provider } = harness(DashboardViewProvider);

    provider.showInEditor();
    provider.showInEditor();

    expect(createdPanels).toHaveLength(1);
    // undefined column: the tab stays in whichever group the user moved it to
    expect(createdPanels[0].revealCalls).toEqual([{ column: undefined, preserveFocus: false }]);
  });

  it("uses theme-specific editor tab icons", () => {
    const { provider } = harness(DashboardViewProvider);

    provider.showInEditor();

    const iconPath = createdPanels[0].iconPath as {
      light: { fsPath: string };
      dark: { fsPath: string };
    };
    expect(iconPath.light.fsPath).toMatch(/beads-icon-editor-light\.svg$/);
    expect(iconPath.dark.fsPath).toMatch(/beads-icon-editor-dark\.svg$/);
  });

  it("stops posting to a panel once it is disposed", async () => {
    const { provider } = harness(DashboardViewProvider);
    provider.showInEditor();
    const panel = createdPanels[0];

    await panel.webview.emit({ type: "ready" });
    expect(panel.webview.html).toContain("<!DOCTYPE html>");

    const before: unknown[] = [];
    panel.webview.postMessage = (message: unknown) => before.push(message);
    panel.dispose();
    provider.hardRefresh();

    expect(before).toHaveLength(0);
  });

  it("synchronizes a newly opened tab when its webview reports ready", async () => {
    const { provider } = harness(DashboardViewProvider);
    provider.showInEditor();
    const panel = createdPanels[0];

    const seen: Array<{ type: string }> = [];
    panel.webview.postMessage = (message: unknown) => seen.push(message as { type: string });

    await panel.webview.emit({ type: "ready" });

    const types = seen.map((m) => m.type);
    expect(types).toContain("setViewType");
    expect(types).toContain("setProject");
    expect(types).toContain("setProjects");
    expect(types).toContain("setSettings");
  });
});

describe("source-aware navigation", () => {
  it("reports the originating tab and its editor group", async () => {
    const spy = jest.spyOn(vscode.commands, "executeCommand");
    const { provider } = harness(DashboardViewProvider);
    provider.showInEditor(2 as unknown as vscode.ViewColumn);

    await createdPanels[0].webview.emit({ type: "openBeadDetails", beadId: "bd-1" });

    expect(spy).toHaveBeenCalledWith("beads.openBeadDetails", "bd-1", {
      surface: "editor",
      viewColumn: 2,
    });
  });

  it("keeps a sidebar click in the sidebar", async () => {
    const spy = jest.spyOn(vscode.commands, "executeCommand");
    const { attachSidebar } = harness(DashboardViewProvider);
    const webview = attachSidebar();

    await webview.emit({ type: "openBeadDetails", beadId: "bd-1" });

    expect(spy).toHaveBeenCalledWith("beads.openBeadDetails", "bd-1", { surface: "sidebar" });
  });
});

describe("reveal invariant", () => {
  it("creates the editor tab itself rather than trusting the caller", async () => {
    const { provider } = harness(BeadDetailsViewProvider);

    // No showInEditor() beforehand: an editor-originated request must not be
    // able to land on the sidebar
    await provider.showBead("bd-1", { surface: "editor", viewColumn: 2 as unknown as vscode.ViewColumn });

    expect(createdPanels).toHaveLength(1);
    expect(createdPanels[0].viewColumn).toBe(2);
  });

  it("reveals an existing tab in place without taking focus", async () => {
    const { provider } = harness(BeadDetailsViewProvider);
    provider.showInEditor();
    const panel = createdPanels[0];
    panel.revealCalls.length = 0;

    await provider.showBead("bd-1", { surface: "editor" });

    expect(createdPanels).toHaveLength(1);
    expect(panel.revealCalls).toEqual([{ column: undefined, preserveFocus: true }]);
  });

  it("never reveals an editor tab for a sidebar request", async () => {
    const { provider, attachSidebar } = harness(BeadDetailsViewProvider);
    provider.showInEditor();
    const panel = createdPanels[0];
    attachSidebar();
    panel.revealCalls.length = 0;

    await provider.showBead("bd-1", { surface: "sidebar" });

    expect(panel.revealCalls).toEqual([]);
  });

  it("focuses an unresolved sidebar view instead of falling back to a tab", async () => {
    const spy = jest.spyOn(vscode.commands, "executeCommand");
    const { provider } = harness(BeadDetailsViewProvider);
    provider.showInEditor();
    createdPanels[0].revealCalls.length = 0;

    await provider.showBead("bd-1", { surface: "sidebar" });

    expect(spy).toHaveBeenCalledWith("beadsDetails.focus");
    expect(createdPanels[0].revealCalls).toEqual([]);
  });
});

describe("serializer restoration", () => {
  it("restores the bead a Details tab was showing", () => {
    const { provider } = harness(BeadDetailsViewProvider);

    provider.adoptEditorPanel(
      vscode.window.createWebviewPanel("beads.detailsEditor", "Beads Details", 1, {}) as unknown as vscode.WebviewPanel,
      { beadId: "bd-42" }
    );

    expect(provider.getCurrentBeadId()).toBe("bd-42");
  });

  it("ignores malformed persisted state", () => {
    const { provider } = harness(BeadDetailsViewProvider);

    provider.adoptEditorPanel(
      vscode.window.createWebviewPanel("beads.detailsEditor", "Beads Details", 1, {}) as unknown as vscode.WebviewPanel,
      { beadId: 42 }
    );

    expect(provider.getCurrentBeadId()).toBeNull();
  });
});

describe("project switching", () => {
  it("clears the Details selection and its menu context", async () => {
    const spy = jest.spyOn(vscode.commands, "executeCommand");
    const { provider, setActiveProjectId } = harness(BeadDetailsViewProvider);

    await provider.showBead("bd-1");
    expect(provider.getCurrentBeadId()).toBe("bd-1");

    setActiveProjectId("project-b");
    await (provider as unknown as { loadData: () => Promise<void> }).loadData();

    expect(provider.getCurrentBeadId()).toBeNull();
    expect(spy).toHaveBeenCalledWith("setContext", "beads.hasSelectedBead", false);
  });
});
