#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalMcpClient, defaultReportsDir } from "./lib/local-mcp-client.mjs";

const appPath = path.resolve(".build/Local Computer Use Dev Manager.app");
const servicePath = path.join(appPath, "Contents/MacOS/LocalComputerUseService");
const clientAppPath = path.join(
  appPath,
  "Contents/SharedSupport/LocalComputerUseClient.app",
);
const clientPath = path.join(
  clientAppPath,
  "Contents/MacOS/LocalComputerUseClient",
);
const clientPlistPath = path.join(clientAppPath, "Contents/Info.plist");
const reportPath = path.join(defaultReportsDir, "m27-native-bundle-layout.json");
const socketPath = path.join(os.tmpdir(), `local-computer-use-m27-${process.pid}.sock`);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function executable(filePath) {
  try {
    const info = await stat(filePath);
    return Boolean(info.mode & 0o111);
  } catch {
    return false;
  }
}

function waitForSocket(targetPath, timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = createConnection(targetPath);
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", (error) => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(error);
          return;
        }
        setTimeout(attempt, 100);
      });
    }
    attempt();
  });
}

async function main() {
  const checks = {
    appExists: await exists(appPath),
    serviceExists: await exists(servicePath),
    serviceExecutable: await executable(servicePath),
    clientAppExists: await exists(clientAppPath),
    clientPlistExists: await exists(clientPlistPath),
    clientExists: await exists(clientPath),
    clientExecutable: await executable(clientPath),
  };

  const service = spawn(servicePath, [], {
    env: {
      ...process.env,
      LOCAL_CUA_APP_SOCKET: socketPath,
      LOCAL_CUA_APP_HOST_LOG: path.join(defaultReportsDir, "m27-app-host.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let client = null;
  try {
    await waitForSocket(socketPath);
    client = createLocalMcpClient({
      command: clientPath,
      serverArgs: ["mcp"],
      env: {
        LOCAL_CUA_APP_SOCKET: socketPath,
      },
      requestTimeoutMs: 30000,
    });
    await client.initialize({
      name: "local-computer-use-m27-native-bundle-layout",
      version: "0.1.0",
    });
    const tools = await client.request("tools/list", {});
    const toolNames = (tools.result?.tools || []).map((tool) => tool.name).sort();
    checks.mcpToolsListed =
      toolNames.includes("get_app_state") && toolNames.includes("list_apps");

    const report = {
      ok: Object.values(checks).every(Boolean),
      generatedAt: new Date().toISOString(),
      appPath,
      servicePath,
      clientAppPath,
      clientPath,
      checks,
      toolCount: toolNames.length,
      toolNames,
    };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      throw new Error(`M27 native bundle layout probe failed: ${JSON.stringify(checks)}`);
    }
    console.log(`M27 native bundle layout probe passed: tools=${toolNames.length}`);
  } finally {
    if (client) await client.close();
    service.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
