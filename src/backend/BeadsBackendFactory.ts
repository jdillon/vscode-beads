import { execFile } from "child_process";
import * as util from "util";
import type { Logger } from "../utils/logger";
import { BeadsBackend } from "./BeadsBackend";
import { BeadsCommandRunner } from "./BeadsCommandRunner";
import { BeadsHttpBackend } from "./beads-http-backend";

const execFileAsync = util.promisify(execFile);

export type BeadsBackendKind = "cli" | "http";

type BackendFactoryParams = {
  bdPath: string;
  cwd: string;
  beadsDir: string;
  log: Logger;
  minSupportedVersion?: string;
  onMutation?: () => void;
};

type DoltShowInfo = {
  embedded?: unknown;
  mode?: unknown;
  backend?: unknown;
  host?: unknown;
  port?: unknown;
};

export async function createBeadsBackend(params: BackendFactoryParams): Promise<BeadsBackend> {
  // Version detection does not open storage. Reject old installations before
  // mode discovery or starting a long-lived process.
  const cli = new BeadsCommandRunner(params);
  const compatibility = await cli.checkCompatibility();
  if (!compatibility.supported) return cli;
  const kind = await selectBackendKind(
    () => readDoltShowInfo(params),
    (error) => {
      params.log.trace(`Unable to detect Dolt backend mode: ${error instanceof Error ? error.message : String(error)}`);
    }
  );

  if (kind === "cli") {
    params.log.info("Using bd CLI backend for embedded Dolt project");
    return cli;
  }

  await cli.dispose();
  params.log.info("Using bd HTTP backend");
  return new BeadsHttpBackend(params);
}

export async function selectBackendKind(
  readDoltShowInfo: () => Promise<DoltShowInfo>,
  onDetectionError?: (error: unknown) => void
): Promise<BeadsBackendKind> {
  try {
    const info = await readDoltShowInfo();
    if (isEmbeddedDoltInfo(info)) return "cli";
    const mode = typeof info.mode === "string" ? info.mode.toLowerCase() : "";
    if (mode === "server" || mode === "proxied" ||
        (typeof info.host === "string" && typeof info.port === "number")) return "http";
    throw new Error("Cannot determine Beads storage mode from bd dolt show");
  } catch (error) {
    onDetectionError?.(error);
    throw error;
  }
}

function isEmbeddedDoltInfo(info: DoltShowInfo): boolean {
  if (info.embedded === true) return true;

  const mode = typeof info.mode === "string" ? info.mode.toLowerCase() : "";
  const backend = typeof info.backend === "string" ? info.backend.toLowerCase() : "";
  return mode.includes("embedded") || backend === "embedded";
}

async function readDoltShowInfo(params: BackendFactoryParams): Promise<DoltShowInfo> {
  const { stdout } = await execFileAsync(params.bdPath, ["dolt", "show", "--json"], {
    cwd: params.cwd,
    env: {
      ...process.env,
      BEADS_DIR: params.beadsDir,
    },
    maxBuffer: 1024 * 1024,
    // Bound discovery; never guess a backend after failed mode detection.
    timeout: 5000,
    killSignal: "SIGTERM",
  });

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("No JSON output from bd dolt show --json");
  }

  return JSON.parse(trimmed) as DoltShowInfo;
}
