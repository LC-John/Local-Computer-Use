#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalMcpClient, defaultReportsDir } from "./lib/local-mcp-client.mjs";

const repoRoot = path.resolve(".");
const socketPath = path.join(os.tmpdir(), `local-computer-use-m26-${process.pid}.sock`);
const reportPath = path.join(defaultReportsDir, "m26-app-host.json");

function waitForSocket(targetPath, timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const client = createConnection(targetPath);
      client.once("connect", () => {
        client.end();
        resolve();
      });
      client.once("error", (error) => {
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
  const host = spawn("node", ["src/app-host.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LOCAL_CUA_APP_SOCKET: socketPath,
      LOCAL_CUA_APP_HOST_LOG: path.join(defaultReportsDir, "m26-app-host.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let hostStderr = "";
  host.stderr.on("data", (chunk) => {
    hostStderr += chunk.toString("utf8");
  });

  try {
    await waitForSocket(socketPath);
    const client = createLocalMcpClient({
      serverPath: path.resolve("src/app-bridge.mjs"),
      env: {
        LOCAL_CUA_APP_SOCKET: socketPath,
      },
      requestTimeoutMs: 30000,
    });

    try {
      await client.initialize({
        name: "local-computer-use-m26-app-host",
        version: "0.1.0",
      });
      const tools = await client.request("tools/list", {});
      const toolNames = (tools.result?.tools || []).map((tool) => tool.name).sort();
      const report = {
        ok: toolNames.includes("get_app_state") && toolNames.includes("list_apps"),
        generatedAt: new Date().toISOString(),
        socketPath,
        toolCount: toolNames.length,
        toolNames,
      };
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      if (!report.ok) {
        throw new Error(`M26 app host probe failed: ${JSON.stringify(report)}`);
      }
      console.log(`M26 app host probe passed: socket=${socketPath}, tools=${toolNames.length}`);
    } finally {
      await client.close();
    }
  } finally {
    host.kill("SIGTERM");
  }

  if (hostStderr.includes("Error")) {
    process.stderr.write(hostStderr);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
