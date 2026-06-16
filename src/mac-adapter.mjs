import { execFile as execFileCallback, spawn } from "node:child_process";
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
const helperMode = process.env.LOCAL_CUA_HELPER_MODE || "persistent";
const helperTimeoutMs = Number(process.env.LOCAL_CUA_HELPER_TIMEOUT_MS || 15000);

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

function helperFailure(error) {
  return {
    ok: false,
    error: {
      code: error.killed ? "helper_timeout" : "helper_failed",
      message: error.message,
    },
  };
}

async function runAxHelperOneShot(args) {
  try {
    const helperPath = await ensureAxHelper();
    const { stdout, stderr } = await execFile(helperPath, args, {
      maxBuffer: 12 * 1024 * 1024,
      timeout: helperTimeoutMs,
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
    return helperFailure(error);
  }
}

class PersistentAxHelper {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.stderrLines = [];
    this.starting = null;
  }

  async start() {
    if (this.child && !this.child.killed) return;
    if (this.starting) return await this.starting;

    this.starting = (async () => {
      const helperPath = await ensureAxHelper();
      const child = spawn(helperPath, ["serve"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      this.stdoutBuffer = "";

      child.stdout.on("data", (chunk) => {
        this.stdoutBuffer += chunk.toString("utf8");
        while (this.stdoutBuffer.includes("\n")) {
          const index = this.stdoutBuffer.indexOf("\n");
          const line = this.stdoutBuffer.slice(0, index).trim();
          this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
          if (!line) continue;

          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          const pending = this.pending.get(parsed.id);
          if (pending) {
            this.pending.delete(parsed.id);
            clearTimeout(pending.timeout);
            pending.resolve(parsed.result);
          }
        }
      });

      child.stderr.on("data", (chunk) => {
        for (const line of chunk.toString("utf8").split(/\r?\n/)) {
          if (line.trim()) this.stderrLines.push(line.trim());
        }
        this.stderrLines = this.stderrLines.slice(-20);
      });

      child.on("exit", (code, signal) => {
        const error = new Error(
          `Persistent helper exited with code ${code ?? "null"} signal ${signal ?? "null"}`,
        );
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(error);
        }
        this.pending.clear();
        if (this.child === child) this.child = null;
      });

      child.on("error", (error) => {
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(error);
        }
        this.pending.clear();
        if (this.child === child) this.child = null;
      });
    })();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async request(args) {
    await this.start();
    if (!this.child?.stdin.writable) {
      throw new Error("Persistent helper is not writable");
    }

    const [command, ...commandArgs] = args;
    const id = this.nextId++;
    const payload = {
      id,
      command,
      arguments: commandArgs.map((value) => String(value)),
    };

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for persistent helper response id ${id}`));
      }, helperTimeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  stop() {
    if (!this.child) return;
    try {
      this.child.stdin.write(`${JSON.stringify({ id: this.nextId++, command: "shutdown" })}\n`);
      this.child.stdin.end();
    } catch {
      // Best-effort shutdown; process exit handlers clean pending requests.
    }
    this.child.kill("SIGTERM");
    this.child = null;
  }
}

const persistentHelper = new PersistentAxHelper();

async function runAxHelper(args) {
  if (helperMode === "oneshot") {
    const result = await runAxHelperOneShot(args);
    return { ...result, helperMode: "oneshot" };
  }

  try {
    const result = await persistentHelper.request(args);
    return { ...result, helperMode: "persistent" };
  } catch (error) {
    persistentHelper.stop();
    const fallback = await runAxHelperOneShot(args);
    return {
      ...fallback,
      helperMode: "oneshot-fallback",
      fallbackReason: error.message,
    };
  }
}

process.once("exit", () => persistentHelper.stop());
process.once("SIGINT", () => {
  persistentHelper.stop();
  process.exit(130);
});
process.once("SIGTERM", () => {
  persistentHelper.stop();
  process.exit(143);
});

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

export async function getAppState(args) {
  return await runAxHelper(["state-json", JSON.stringify(args)]);
}

export async function checkPermissions() {
  return await runAxHelper(["permissions"]);
}

export async function getAppIdentity(app) {
  return await runAxHelper(["app-identity", app]);
}

export async function click(args) {
  return await runAxHelper(["click", JSON.stringify(args)]);
}

export async function typeText(args) {
  return await runAxHelper(["type-text", JSON.stringify(args)]);
}

export async function pressKey(args) {
  return await runAxHelper(["press-key", JSON.stringify(args)]);
}

export async function scroll(args) {
  return await runAxHelper(["scroll", JSON.stringify(args)]);
}

export async function drag(args) {
  return await runAxHelper(["drag", JSON.stringify(args)]);
}

export async function setValue(args) {
  return await runAxHelper(["set-value", JSON.stringify(args)]);
}

export async function selectText(args) {
  return await runAxHelper(["select-text", JSON.stringify(args)]);
}

export async function performSecondaryAction(args) {
  return await runAxHelper(["perform-secondary-action", JSON.stringify(args)]);
}

export async function notImplemented(tool) {
  return {
    status: "not_implemented",
    message: `Tool not implemented in local skeleton: ${tool}`,
  };
}
