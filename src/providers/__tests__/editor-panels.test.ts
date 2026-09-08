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
import { BeadsPanelViewProvider } from "../BeadsPanelViewProvider";
import { DashboardViewProvider } from "../DashboardViewProvider";
import { BeadsProjectManager } from "../../backend/BeadsProjectManager";
import { Bead, ExtensionToWebviewMessage } from "../../backend/types";
import { BeadsBackend, BeadsIssue } from "../../backend/BeadsBackend";
import { Logger } from "../../utils/logger";

interface Harness<T> {
  provider: T;
  posted: ExtensionToWebviewMessage[];
  notifyBackendError: jest.Mock;
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
  Provider: new (uri: vscode.Uri, pm: BeadsProjectManager, log: Logger, preview?: (id: string) => Bead | undefined) => T,
  activeProjectId: string | null = "project-a",
  client: Partial<BeadsBackend> | null = null,
  preview?: (id: string) => Bead | undefined
): Harness<T> {
  const posted: ExtensionToWebviewMessage[] = [];
  const notifyBackendError = jest.fn();
  let projectId = activeProjectId;

  const projectManager = {
    getClient: () => client,
    getActiveProject: () => (projectId ? { id: projectId, name: projectId } : null),
    getProjects: () => [],
    notifyBackendError,
  } as unknown as BeadsProjectManager;

  const provider = new Provider({} as vscode.Uri, projectManager, makeLogger(), preview);

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
    notifyBackendError,
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
      { version: 1, projectId: "project-a", beadId: "bd-42" }
    );

    expect(provider.getCurrentBeadId()).toBe("bd-42");
  });

  it("ignores persisted state for another project", () => {
    const { provider } = harness(BeadDetailsViewProvider);

    provider.adoptEditorPanel(
      vscode.window.createWebviewPanel("beads.detailsEditor", "Beads Details", 1, {}) as unknown as vscode.WebviewPanel,
      { version: 1, projectId: "project-b", beadId: "bd-42" }
    );

    expect(provider.getCurrentBeadId()).toBeNull();
  });

  it("ignores legacy and malformed persisted state", () => {
    const { provider } = harness(BeadDetailsViewProvider);

    provider.adoptEditorPanel(
      vscode.window.createWebviewPanel("beads.detailsEditor", "Beads Details", 1, {}) as unknown as vscode.WebviewPanel,
      { beadId: "bd-42" }
    );

    expect(provider.getCurrentBeadId()).toBeNull();
  });

  it("seeds a hidden restored tab with its bead id before loading", async () => {
    const { provider } = harness(BeadDetailsViewProvider);
    const panel = vscode.window.createWebviewPanel(
      "beads.detailsEditor",
      "Beads Details",
      1,
      {}
    ) as unknown as vscode.WebviewPanel;
    provider.adoptEditorPanel(panel, {
      version: 1,
      projectId: "project-a",
      beadId: "bd-42",
    });
    const fakePanel = createdPanels[0];
    fakePanel.setVisible(false);
    const seen: ExtensionToWebviewMessage[] = [];
    fakePanel.webview.postMessage = (message) => seen.push(message as ExtensionToWebviewMessage);

    await fakePanel.webview.emit({ type: "ready" });

    expect(seen).toContainEqual({ type: "setSelectedBeadId", beadId: "bd-42" });
  });
});

describe("project switching", () => {
  it("clears a hidden Details selection and its menu context immediately", async () => {
    const spy = jest.spyOn(vscode.commands, "executeCommand");
    const { provider, setActiveProjectId } = harness(BeadDetailsViewProvider);

    await provider.showBead("bd-1", { surface: "editor" });
    expect(provider.getCurrentBeadId()).toBe("bd-1");
    createdPanels[0].setVisible(false);
    const seen: ExtensionToWebviewMessage[] = [];
    createdPanels[0].webview.postMessage = (message) => seen.push(message as ExtensionToWebviewMessage);

    setActiveProjectId("project-b");
    provider.refreshForProjectChange();

    expect(provider.getCurrentBeadId()).toBeNull();
    expect(createdPanels[0].title).toBe("Beads Details");
    expect(spy).toHaveBeenCalledWith("setContext", "beads.hasSelectedBead", false);
    expect(seen).toContainEqual({ type: "setSelectedBeadId", beadId: null });
  });

  it("suppresses a request failure after the active project changes", async () => {
    let rejectShow!: (error: Error) => void;
    const show = jest.fn().mockReturnValue(
      new Promise<BeadsIssue>((_resolve, reject) => {
        rejectShow = reject;
      })
    );
    const listComments = jest.fn().mockResolvedValue([]);
    const { provider, setActiveProjectId, notifyBackendError } = harness(
      BeadDetailsViewProvider,
      "project-a",
      { show, listComments }
    );
    provider.showInEditor();
    const seen: ExtensionToWebviewMessage[] = [];
    createdPanels[0].webview.postMessage = (message) =>
      seen.push(message as ExtensionToWebviewMessage);

    const load = provider.showBead("bd-1", { surface: "editor" });
    expect(show).toHaveBeenCalledWith("bd-1");

    // ProjectManager updates its active project before it emits the change
    // event, leaving a window where this request must reject itself.
    setActiveProjectId("project-b");
    seen.length = 0;
    rejectShow(new Error("old project failed"));
    await load;

    expect(seen).toEqual([]);
    expect(notifyBackendError).not.toHaveBeenCalled();
  });
});

describe("host seeding", () => {
  it("seeds a newly opened Issues host with the current selection", async () => {
    const { provider } = harness(BeadsPanelViewProvider);
    provider.setSelectedBead("bd-1");
    provider.showInEditor();

    const seen: ExtensionToWebviewMessage[] = [];
    createdPanels[0].webview.postMessage = (message) => seen.push(message as ExtensionToWebviewMessage);
    await createdPanels[0].webview.emit({ type: "ready" });

    expect(seen).toContainEqual({ type: "setSelectedBeadId", beadId: "bd-1" });
  });

  it("replays cached Issues data only to the newly opened host", async () => {
    const issue: BeadsIssue = {
      id: "bd-1",
      title: "Cached issue",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    };
    const list = jest.fn().mockResolvedValue([issue]);
    const { provider, posted, attachSidebar } = harness(
      BeadsPanelViewProvider,
      "project-a",
      { list }
    );
    attachSidebar();
    await (provider as unknown as {
      loadData: (reason: "background") => Promise<void>;
    }).loadData("background");
    posted.length = 0;

    provider.showInEditor();
    const editorMessages: ExtensionToWebviewMessage[] = [];
    createdPanels[0].webview.postMessage = (message) =>
      editorMessages.push(message as ExtensionToWebviewMessage);
    await createdPanels[0].webview.emit({ type: "ready" });

    expect(list).toHaveBeenCalledTimes(1);
    expect(editorMessages).toContainEqual(expect.objectContaining({ type: "setBeads" }));
    expect(posted).toEqual([]);
  });

  it("does not let an older targeted load replace a newer refresh", async () => {
    let resolveInitial!: (issues: BeadsIssue[]) => void;
    const initial = new Promise<BeadsIssue[]>((resolve) => {
      resolveInitial = resolve;
    });
    const oldIssue: BeadsIssue = {
      id: "bd-old",
      title: "Old issue",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    };
    const newIssue = { ...oldIssue, id: "bd-new", title: "New issue" };
    const list = jest.fn()
      .mockReturnValueOnce(initial)
      .mockResolvedValueOnce([newIssue]);
    const { provider } = harness(BeadsPanelViewProvider, "project-a", { list });
    provider.showInEditor();
    const seen: ExtensionToWebviewMessage[] = [];
    createdPanels[0].webview.postMessage = (message) => seen.push(message as ExtensionToWebviewMessage);

    const ready = createdPanels[0].webview.emit({ type: "ready" });
    await (provider as unknown as {
      loadData: (reason: "background") => Promise<void>;
    }).loadData("background");
    resolveInitial([oldIssue]);
    await ready;

    const beadMessages = seen.filter((message) => message.type === "setBeads");
    expect(beadMessages).toContainEqual({
      type: "setBeads",
      beads: [expect.objectContaining({ id: "bd-new" })],
    });
    expect(beadMessages).not.toContainEqual({
      type: "setBeads",
      beads: [expect.objectContaining({ id: "bd-old" })],
    });
  });

  it("does not let an older load replace a newer load for the same host", async () => {
    let resolveInitial!: (issues: BeadsIssue[]) => void;
    const initial = new Promise<BeadsIssue[]>((resolve) => {
      resolveInitial = resolve;
    });
    const oldIssue: BeadsIssue = {
      id: "bd-old",
      title: "Old issue",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    };
    const newIssue = { ...oldIssue, id: "bd-new", title: "New issue" };
    const list = jest.fn()
      .mockReturnValueOnce(initial)
      .mockResolvedValueOnce([newIssue]);
    const { provider } = harness(BeadsPanelViewProvider, "project-a", { list });
    provider.showInEditor();
    const seen: ExtensionToWebviewMessage[] = [];
    const panel = createdPanels[0];
    panel.webview.postMessage = (message) => seen.push(message as ExtensionToWebviewMessage);

    const firstReady = panel.webview.emit({ type: "ready" });
    const secondReady = panel.webview.emit({ type: "ready" });
    await secondReady;
    resolveInitial([oldIssue]);
    await firstReady;

    const beadMessages = seen.filter((message) => message.type === "setBeads");
    expect(beadMessages).toContainEqual({
      type: "setBeads",
      beads: [expect.objectContaining({ id: "bd-new" })],
    });
    expect(beadMessages).not.toContainEqual({
      type: "setBeads",
      beads: [expect.objectContaining({ id: "bd-old" })],
    });
  });
});


describe("progressive Details loading", () => {
  const issue = (id: string): BeadsIssue => ({
    id, title: `Title ${id}`, status: "open", priority: 2, issue_type: "task",
    created_at: "2026-09-08T00:00:00Z", updated_at: "2026-09-08T00:00:00Z",
  });
  const preview = (id: string): Bead => ({ id, title: `Preview ${id}`, status: "open" });
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }

  it("paints list data synchronously and shows details before slow comments", async () => {
    const show = deferred<BeadsIssue>();
    const comments = deferred<[]>();
    const { provider, posted, attachSidebar } = harness(BeadDetailsViewProvider, "project-a", {
      show: () => show.promise, listComments: () => comments.promise,
    }, preview);
    attachSidebar();
    const load = provider.showBead("bd-1");
    expect(posted).toContainEqual({ type: "setBead", bead: expect.objectContaining({ title: "Preview bd-1" }) });
    show.resolve(issue("bd-1"));
    await Promise.resolve();
    expect(posted).toContainEqual({ type: "setBead", bead: expect.objectContaining({ title: "Title bd-1", comments: undefined }) });
    comments.resolve([]);
    await load;
    expect(posted).toContainEqual({ type: "setBead", bead: expect.objectContaining({ id: "bd-1", comments: [] }) });
    expect(posted[posted.length - 1]).toEqual({ type: "setLoading", loading: false });
  });

  it("seeds a newly ready editor with the preview while reads are pending", async () => {
    const show = deferred<BeadsIssue>();
    const { provider } = harness(BeadDetailsViewProvider, "project-a", {
      show: () => show.promise, listComments: async () => [],
    }, preview);
    const load = provider.showBead("bd-1", { surface: "editor" });
    const seen: ExtensionToWebviewMessage[] = [];
    createdPanels[0].webview.postMessage = (message) => seen.push(message as ExtensionToWebviewMessage);
    const ready = createdPanels[0].webview.emit({ type: "ready" });
    expect(seen).toContainEqual({ type: "setBead", bead: expect.objectContaining({ title: "Preview bd-1" }) });
    show.resolve(issue("bd-1"));
    await Promise.all([load, ready]);
  });

  it("clears the previous issue immediately when the new ID has no preview", async () => {
    const pending = deferred<BeadsIssue>();
    const { provider, posted, attachSidebar } = harness(BeadDetailsViewProvider, "project-a", {
      show: (id) => id === "bd-1" ? Promise.resolve(issue(id)) : pending.promise,
      listComments: async () => [],
    });
    attachSidebar();
    await provider.showBead("bd-1");
    posted.length = 0;
    const load = provider.showBead("bd-2");
    expect(posted).toContainEqual({ type: "setBead", bead: null });
    pending.resolve(issue("bd-2"));
    await load;
  });

  it.each(["selection", "project"])("ignores late comments after a %s change", async (change) => {
    const comments = deferred<[]>();
    const { provider, posted, attachSidebar, setActiveProjectId } = harness(BeadDetailsViewProvider, "project-a", {
      show: async (id) => issue(id),
      listComments: (id) => id === "bd-1" ? comments.promise : Promise.resolve([]),
    }, preview);
    attachSidebar();
    const oldLoad = provider.showBead("bd-1");
    await Promise.resolve();
    if (change === "selection") await provider.showBead("bd-2");
    else setActiveProjectId("project-b");
    posted.length = 0;
    comments.resolve([]);
    await oldLoad;
    expect(posted).toEqual([]);
  });

  it("keeps loaded details when comments fail", async () => {
    const { provider, posted, attachSidebar } = harness(BeadDetailsViewProvider, "project-a", {
      show: async (id) => issue(id), listComments: async () => { throw new Error("comments unavailable"); },
    }, preview);
    attachSidebar();
    await provider.showBead("bd-1");
    expect(posted).toContainEqual({ type: "setBead", bead: expect.objectContaining({ title: "Title bd-1", comments: [] }) });
    expect(posted).not.toContainEqual({ type: "setError", error: expect.any(String) });
  });

  it("never returns a list preview from the previous project", async () => {
    const { provider, setActiveProjectId } = harness(BeadsPanelViewProvider, "project-a", {
      list: async () => [issue("bd-1")],
    });
    await (provider as unknown as { loadData: () => Promise<void> }).loadData();
    expect(provider.getCachedBead("bd-1")?.id).toBe("bd-1");
    setActiveProjectId("project-b");
    expect(provider.getCachedBead("bd-1")).toBeUndefined();
  });
});
