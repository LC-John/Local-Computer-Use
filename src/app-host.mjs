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

async function appendLog(message) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${new Date().toISOString()} ${message}\n`, {
    flag: "a",
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
      console.error(`Local Computer Use app host already running at ${socketPath}`);
      process.exit(0);
    }
    await rm(socketPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function attachSession(socket) {
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
    socket.end();
  });
}

async function main() {
  await prepareSocket();
  const server = createServer(attachSession);
  server.on("error", (error) => {
    appendLog(`host error: ${error.stack || error.message}`).catch(() => {});
    process.exitCode = 1;
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  await appendLog(`host listening at ${socketPath}`);
  console.error(`Local Computer Use app host listening at ${socketPath}`);

  function shutdown() {
    server.close(() => {
      rm(socketPath, { force: true }).finally(() => process.exit(0));
    });
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
