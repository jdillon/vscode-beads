/**
 * Minimal `vscode` module stub for jest.
 *
 * The real module is only injected by the VS Code host, so tests that import
 * extension code need this shim. Add members here as tests require them.
 */

export class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];
  public readonly event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => undefined };
  };
  fire(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
  dispose(): void {
    this.listeners = [];
  }
}

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join("/"),
  }),
};

/** Minimal stand-in for a webview, enough to drive a provider in tests. */
export interface FakeWebview {
  options: unknown;
  html: string;
  postMessage: (message: unknown) => void;
  onDidReceiveMessage: (listener: (message: unknown) => unknown) => { dispose: () => void };
  asWebviewUri: (uri: unknown) => unknown;
  cspSource: string;
  /** Test hook: deliver a message as if the webview had sent it. */
  emit: (message: unknown) => unknown;
}

export function createFakeWebview(posted: unknown[] = []): FakeWebview {
  let listener: ((message: unknown) => unknown) | undefined;
  return {
    options: undefined,
    html: "",
    postMessage: (message: unknown) => posted.push(message),
    onDidReceiveMessage: (cb) => {
      listener = cb;
      return { dispose: () => undefined };
    },
    asWebviewUri: (uri: unknown) => uri,
    cspSource: "vscode-test",
    emit: (message: unknown) => listener?.(message),
  };
}

export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 };

/** Panels created through `window.createWebviewPanel`, newest last. */
export const createdPanels: FakePanel[] = [];

export interface FakePanel {
  viewType: string;
  title: string;
  viewColumn: unknown;
  iconPath: unknown;
  visible: boolean;
  webview: FakeWebview;
  revealCalls: Array<{ column: unknown; preserveFocus: unknown }>;
  reveal: (column?: unknown, preserveFocus?: unknown) => void;
  dispose: () => void;
  onDidDispose: (cb: () => void) => { dispose: () => void };
  onDidChangeViewState: (cb: () => void) => { dispose: () => void };
  /** Test hook: drive a hidden -> visible transition. */
  setVisible: (visible: boolean) => void;
}

export function resetWebviewPanels(): void {
  createdPanels.length = 0;
}

export const window = {
  showErrorMessage: () => undefined,
  showWarningMessage: () => undefined,
  showInformationMessage: () => undefined,
  setStatusBarMessage: () => undefined,
  createWebviewPanel: (viewType: string, title: string, column: unknown, _options: unknown): FakePanel => {
    const disposeListeners: Array<() => void> = [];
    const viewStateListeners: Array<() => void> = [];
    const panel: FakePanel = {
      viewType,
      title,
      viewColumn: column,
      iconPath: undefined,
      visible: true,
      webview: createFakeWebview(),
      revealCalls: [],
      reveal: (column?: unknown, preserveFocus?: unknown) => {
        panel.revealCalls.push({ column, preserveFocus });
      },
      dispose: () => {
        for (const cb of disposeListeners) cb();
      },
      onDidDispose: (cb) => {
        disposeListeners.push(cb);
        return { dispose: () => undefined };
      },
      onDidChangeViewState: (cb) => {
        viewStateListeners.push(cb);
        return { dispose: () => undefined };
      },
      setVisible: (visible: boolean) => {
        panel.visible = visible;
        for (const cb of viewStateListeners) cb();
      },
    };
    createdPanels.push(panel);
    return panel;
  },
  createOutputChannel: () => ({
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    appendLine: () => undefined,
    show: () => undefined,
    dispose: () => undefined,
  }),
};

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue,
  }),
};

export const commands = {
  executeCommand: () => undefined,
};

export const env = {
  clipboard: { writeText: async () => undefined },
};
