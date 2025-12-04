/**
 * Logger utility wrapping VS Code's LogOutputChannel
 *
 * Provides structured logging with:
 * - Log levels (info, warn, error, debug, trace)
 * - Scoped child loggers with automatic prefixes
 * - Colored output in VS Code's Output panel
 */

import * as vscode from "vscode";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Logger instance - can be root or scoped
 */
export class Logger {
  private channel: vscode.LogOutputChannel;
  private scope: string | null;

  constructor(channel: vscode.LogOutputChannel, scope?: string) {
    this.channel = channel;
    this.scope = scope || null;
  }

  private format(message: string): string {
    return this.scope ? `[${this.scope}] ${message}` : message;
  }

  /** Create a child logger with a scope prefix */
  child(scope: string): Logger {
    const fullScope = this.scope ? `${this.scope}:${scope}` : scope;
    return new Logger(this.channel, fullScope);
  }

  trace(message: string, ...args: unknown[]): void {
    this.channel.trace(this.format(message), ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.channel.debug(this.format(message), ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.channel.info(this.format(message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.channel.warn(this.format(message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.channel.error(this.format(message), ...args);
  }

  /**
   * Log error and show notification to user with "Show Output" button
   * Use for errors that users should be aware of (command failures, etc.)
   */
  async errorNotify(message: string, ...args: unknown[]): Promise<void> {
    this.channel.error(this.format(message), ...args);
    const action = await vscode.window.showErrorMessage(
      `Beads: ${message}`,
      "Show Output"
    );
    if (action === "Show Output") {
      this.channel.show();
    }
  }

  /** Show the output channel */
  show(): void {
    this.channel.show();
  }

  /** Get the underlying LogOutputChannel (for disposal) */
  get outputChannel(): vscode.LogOutputChannel {
    return this.channel;
  }
}

// Singleton root logger - initialized by extension
let rootLogger: Logger | null = null;

/**
 * Create the root logger - call once from extension.ts
 */
export function createLogger(name: string): Logger {
  const channel = vscode.window.createOutputChannel(name, { log: true });
  rootLogger = new Logger(channel);
  return rootLogger;
}

/**
 * Get a scoped logger - use in modules
 * @example const log = getLogger("Backend");
 */
export function getLogger(scope?: string): Logger {
  if (!rootLogger) {
    throw new Error("Logger not initialized - call createLogger() first");
  }
  return scope ? rootLogger.child(scope) : rootLogger;
}
