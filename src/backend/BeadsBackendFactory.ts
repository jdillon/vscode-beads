import { execFile } from "child_process";
import * as util from "util";
import type { Logger } from "../utils/logger";
import { BeadsBackend } from "./BeadsBackend";
import { BeadsCommandRunner } from "./BeadsCommandRunner";
import { BeadsDoltBackend } from "./BeadsDoltBackend";

const execFileAsync = util.promisify(execFile);

export type BeadsBackendKind = "cli" | "dolt-sql";

type BackendFactoryParams = {
  bdPath: string;
  cwd: string;
  beadsDir: string;
  log: Logger;
  minSupportedVersion?: string;
};

type DoltShowInfo = {
  embedded?: unknown;
  mode?: unknown;
  backend?: unknown;
};

export async function createBeadsBackend(params: BackendFactoryParams): Promise<BeadsBackend> {
  const kind = await selectBackendKind(
    () => readDoltShowInfo(params),
    (error) => {
      params.log.trace(`Unable to detect Dolt backend mode: ${error instanceof Error ? error.message : String(error)}`);
    }
  );

  if (kind === "cli") {
    params.log.info("Using bd CLI backend for embedded Dolt project");
    return new BeadsCommandRunner(params);
  }

  params.log.info("Using Dolt SQL backend");
  return new BeadsDoltBackend(params);
}

export async function selectBackendKind(
  readDoltShowInfo: () => Promise<DoltShowInfo>,
  onDetectionError?: (error: unknown) => void
): Promise<BeadsBackendKind> {
  try {
    const info = await readDoltShowInfo();
    return isEmbeddedDoltInfo(info) ? "cli" : "dolt-sql";
  } catch (error) {
    onDetectionError?.(error);
    return "dolt-sql";
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
    // Don't let a hung bd block project activation; on timeout the factory
    // falls back to the Dolt SQL backend.
    timeout: 5000,
    killSignal: "SIGTERM",
  });

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("No JSON output from bd dolt show --json");
  }

  return JSON.parse(trimmed) as DoltShowInfo;
}
