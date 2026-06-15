import { execFile as execFileCallback } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const axStatePath = path.join(__dirname, "ax-state.swift");
const buildDir = path.join(repoRoot, ".build");
const axStateBinaryPath = path.join(buildDir, "ax-state");

async function ensureAxHelper() {
  const [sourceStat, binaryStat] = await Promise.all([
    stat(axStatePath),
    stat(axStateBinaryPath).catch(() => null),
  ]);

  if (binaryStat && binaryStat.mtimeMs >= sourceStat.mtimeMs) {
    return axStateBinaryPath;
  }

  await mkdir(buildDir, { recursive: true });
  await execFile("/usr/bin/swiftc", [axStatePath, "-o", axStateBinaryPath], {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30000,
  });
  return axStateBinaryPath;
}

async function runAxHelper(args) {
  try {
    const helperPath = await ensureAxHelper();
    const { stdout, stderr } = await execFile(helperPath, args, {
      maxBuffer: 12 * 1024 * 1024,
      timeout: 15000,
    });
    if (stderr.trim()) {
      // Swift can emit compiler/runtime warnings on stderr; keep them visible to callers.
      return {
        ok: false,
        error: {
          code: "helper_stderr",
          message: stderr.trim(),
        },
      };
    }
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = error.stdout?.toString("utf8") || "";
    if (stdout.trim()) {
      try {
        return JSON.parse(stdout);
      } catch {
        // Fall through to a structured helper failure below.
      }
    }
    return {
      ok: false,
      error: {
        code: error.killed ? "helper_timeout" : "helper_failed",
        message: error.message,
      },
    };
  }
}

export async function listApps() {
  const result = await runAxHelper(["list-apps"]);
  if (!result.ok) {
    return {
      error: result.error,
      apps: [],
    };
  }
  return result.apps;
}

export async function getAppState(app) {
  return await runAxHelper(["state", app]);
}

export async function notImplemented(tool) {
  return {
    status: "not_implemented",
    message: `Tool not implemented in local skeleton: ${tool}`,
  };
}
