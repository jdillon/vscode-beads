import type { ChangeSourceOptions } from "../beads-change-source";
import type { BeadsBackend } from "../BeadsBackend";
import type { BeadsProject } from "../types";
import type { Logger } from "../../utils/logger";
import type * as vscode from "vscode";

jest.mock("vscode", () => require("../../__mocks__/vscode"));
jest.mock("../BeadsBackendFactory", () => ({ createBeadsBackend: jest.fn() }));
jest.mock("../beads-http-backend", () => ({ BeadsHttpBackend: class {} }));
jest.mock("../beads-change-source", () => ({ BeadsChangeSource: jest.fn().mockImplementation(() => ({
  start: jest.fn(), restart: jest.fn(), dispose: jest.fn(),
})) }));
const { BeadsProjectManager } = require("../BeadsProjectManager") as typeof import("../BeadsProjectManager");
const factory = require("../BeadsBackendFactory").createBeadsBackend as jest.Mock;
const source = require("../beads-change-source").BeadsChangeSource as jest.Mock;
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function backend() {
  return { dispose: jest.fn().mockResolvedValue(undefined), invalidateReads: jest.fn(),
    checkCompatibility: jest.fn().mockResolvedValue({ supported: true }),
  } as unknown as BeadsBackend;
}
const project = (id: string): BeadsProject => ({ id, name: id, rootPath: `/projects/${id}`,
  beadsDir: `/projects/${id}/.beads`, source: "workspace", backendStatus: "unknown" });
function setup() {
  const context = { workspaceState: { get: jest.fn(), update: jest.fn().mockResolvedValue(undefined) } };
  const log = { child: () => log, info: jest.fn(), warn: jest.fn() };
  const manager = new BeadsProjectManager(context as unknown as vscode.ExtensionContext, log as unknown as Logger);
  const internals = manager as unknown as { projects: BeadsProject[] };
  internals.projects = [project("a"), project("b"), project("c")];
  return { manager, internals };
}

describe("project refresh lifecycle", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  it("does not let an old disposal delay overwrite a newer activation", async () => {
    const { manager } = setup(); const a = backend(); const c = backend();
    factory.mockResolvedValueOnce(a).mockResolvedValueOnce(c);
    await manager.setActiveProject("a");
    const disposing = deferred<void>(); (a.dispose as jest.Mock).mockReturnValue(disposing.promise);
    const activatingB = manager.setActiveProject("b"); await tick();
    await manager.setActiveProject("c"); disposing.resolve(); await activatingB;
    expect(manager.getActiveProject()?.id).toBe("c"); expect(manager.getBackend()).toBe(c);
    expect(factory).toHaveBeenCalledTimes(2); manager.dispose();
  });
  it("disposes a late-created backend instead of installing it over the current project", async () => {
    const { manager } = setup(); const a = backend(); const b = backend();
    const pending = deferred<BeadsBackend>();
    factory.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(b);
    const activatingA = manager.setActiveProject("a"); await tick();
    await manager.setActiveProject("b"); pending.resolve(a); await activatingA;
    expect(a.dispose).toHaveBeenCalledTimes(1); expect(manager.getBackend()).toBe(b);
    expect(source).toHaveBeenCalledTimes(1); manager.dispose();
  });
  it("disposes the backend and follower when the final project disappears", async () => {
    const { manager, internals } = setup(); const a = backend(); factory.mockResolvedValueOnce(a);
    await manager.setActiveProject("a");
    const follower = source.mock.results[0].value;
    jest.spyOn(manager, "discoverProjects").mockImplementation(async () => { internals.projects = []; });
    await manager.refresh();
    expect(a.dispose).toHaveBeenCalledTimes(1); expect(follower.dispose).toHaveBeenCalledTimes(1);
    expect(manager.getBackend()).toBeNull(); expect(manager.getActiveProject()).toBeNull();
    expect(jest.getTimerCount()).toBe(0); manager.dispose();
  });
  it("ignores old follower and mutation callbacks, and refreshes for current local writes", async () => {
    const { manager } = setup(); const a = backend(); const b = backend();
    factory.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const changed = jest.fn(); manager.onDataChanged(changed);
    await manager.setActiveProject("a");
    const old = source.mock.calls[0][0] as ChangeSourceOptions;
    const oldMutation = factory.mock.calls[0][0].onMutation;
    await manager.setActiveProject("b"); changed.mockClear();
    old.onChange(); old.onState?.("live"); oldMutation();
    expect(changed).not.toHaveBeenCalled(); expect(b.invalidateReads).not.toHaveBeenCalled();
    expect(manager.getLiveUpdateState()).toBe("periodic");
    factory.mock.calls[1][0].onMutation();
    expect(b.invalidateReads).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledTimes(1);
    manager.dispose(); (source.mock.calls[1][0] as ChangeSourceOptions).onChange();
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("does not emit a stale project removal after a new project activates", async () => {
    const { manager, internals } = setup(); const a = backend(); const b = backend();
    factory.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    await manager.setActiveProject("a");
    const disposing = deferred<void>(); (a.dispose as jest.Mock).mockReturnValue(disposing.promise);
    jest.spyOn(manager, "discoverProjects").mockImplementation(async () => { internals.projects = [project("b")]; });
    const removed = manager.refresh(); await tick();
    const changed = jest.fn(); manager.onActiveProjectChanged(changed);
    await manager.setActiveProject("b"); changed.mockClear(); disposing.resolve(); await removed;
    expect(changed).not.toHaveBeenCalled(); expect(manager.getBackend()).toBe(b); manager.dispose();
  });
});
