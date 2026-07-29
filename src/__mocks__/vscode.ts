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

export const window = {
  showErrorMessage: () => undefined,
  showWarningMessage: () => undefined,
  showInformationMessage: () => undefined,
  setStatusBarMessage: () => undefined,
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
