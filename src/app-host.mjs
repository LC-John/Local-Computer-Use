#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.env.LOCAL_CUA_REPO_ROOT || path.resolve(".");
const socketPath =
  process.env.LOCAL_CUA_APP_SOCKET ||
  path.join(os.tmpdir(), `local-computer-use-${process.getuid()}.sock`);
const logPath =
  process.env.LOCAL_CUA_APP_HOST_LOG ||
  path.join(repoRoot, "reports", "app-host.log");
const runtimeDir =
  process.env.LOCAL_CUA_RUNTIME_DIR || path.join(repoRoot, ".build", "runtime");
const statusPath =
  process.env.LOCAL_CUA_SERVICE_STATUS ||
  path.join(runtimeDir, "service-status.json");

const startedAt = new Date();
const status = {
  activeSessions: 0,
  lastError: null,
  pid: process.pid,
  repoRoot,
  socketPath,
  startedAt: startedAt.toISOString(),
  state: "starting",
  totalSessions: 0,
};

async function appendLog(message) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${new Date().toISOString()} ${message}\n`, {
    flag: "a",
  });
}

async function writeStatus(patch = {}) {
  Object.assign(status, patch, {
    heartbeatAt: new Date().toISOString(),
    uptimeMs: Date.now() - startedAt.getTime(),
  });
  await mkdir(path.dirname(statusPath), { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}

async function recordError(error) {
  const message = error?.stack || error?.message || String(error);
  await appendLog(`host error: ${message}`);
  await writeStatus({
    lastError: {
      message,
      recordedAt: new Date().toISOString(),
    },
  });
}

function canConnect(targetPath) {
  return new Promise((resolve) => {
    const client = createConnection(targetPath);
    client.once("connect", () => {
      client.end();
      resolve(true);
    });
    client.once("error", () => resolve(false));
  });
}

async function prepareSocket() {
  try {
    const info = await stat(socketPath);
    if (!info.isSocket()) {
      throw new Error(`${socketPath} exists and is not a socket`);
    }
    if (await canConnect(socketPath)) {
      await appendLog(`host already running at ${socketPath}`);
      await writeStatus({ state: "already-running" });
      console.error(`Local Computer Use app host already running at ${socketPath}`);
      process.exit(0);
    }
    await rm(socketPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function attachSession(socket) {
  status.activeSessions += 1;
  status.totalSessions += 1;
  writeStatus({ state: "serving" }).catch(() => {});

  const child = spawn("node", ["src/server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LOCAL_CUA_REPO_ROOT: repoRoot,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  appendLog(`accepted session pid=${child.pid}`).catch(() => {});
  socket.pipe(child.stdin);
  child.stdout.pipe(socket);

  child.stderr.on("data", (chunk) => {
    appendLog(`server stderr pid=${child.pid}: ${chunk.toString("utf8").trim()}`).catch(
      () => {},
    );
  });

  socket.on("close", () => {
    child.kill("SIGTERM");
  });
  socket.on("error", () => {
    child.kill("SIGTERM");
  });
  child.on("exit", (code, signal) => {
    appendLog(`session exit pid=${child.pid} code=${code} signal=${signal}`).catch(
      () => {},
    );
    status.activeSessions = Math.max(0, status.activeSessions - 1);
    writeStatus({ state: status.activeSessions > 0 ? "serving" : "ready" }).catch(
      () => {},
    );
    socket.end();
  });
}

async function main() {
  await writeStatus({ state: "starting" });
  await prepareSocket();
  const server = createServer(attachSession);
  server.on("error", (error) => {
    recordError(error).catch(() => {});
    process.exitCode = 1;
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  await appendLog(`host listening at ${socketPath}`);
  await writeStatus({ state: "ready" });
  console.error(`Local Computer Use app host listening at ${socketPath}`);

  const heartbeat = setInterval(() => {
    writeStatus({ state: status.activeSessions > 0 ? "serving" : "ready" }).catch(
      () => {},
    );
  }, 1000);

  function shutdown() {
    clearInterval(heartbeat);
    writeStatus({ state: "stopping" }).finally(() => {});
    server.close(() => {
      rm(socketPath, { force: true })
        .then(() => writeStatus({ state: "stopped" }))
        .finally(() => process.exit(0));
    });
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
