#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createLocalMcpClient, defaultReportsDir } from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const appPath = path.resolve(".build/Local Computer Use Dev Manager.app");
const servicePath = path.join(appPath, "Contents/MacOS/LocalComputerUseService");
const clientPath = path.join(
  appPath,
  "Contents/SharedSupport/LocalComputerUseClient.app/Contents/MacOS/LocalComputerUseClient",
);
const socketPath = path.join(os.tmpdir(), `local-computer-use-m28-${process.pid}.sock`);
const eventLogPath = path.join(defaultReportsDir, "m28-client-events.jsonl");
const reportPath = path.join(defaultReportsDir, "m28-client-subcommands.json");

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

async function runClient(args, { allowFailure = false } = {}) {
  try {
    const { stdout, stderr } = await execFile(clientPath, args, {
      env: {
        ...process.env,
        LOCAL_CUA_APP_SOCKET: socketPath,
        LOCAL_CUA_CLIENT_EVENT_LOG: eventLogPath,
      },
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      ok: false,
      stdout: error.stdout?.toString("utf8").trim() || "",
      stderr: error.stderr?.toString("utf8").trim() || "",
      exitCode: error.code ?? 1,
    };
  }
}

async function main() {
  const service = spawn(servicePath, [], {
    env: {
      ...process.env,
      LOCAL_CUA_APP_SOCKET: socketPath,
      LOCAL_CUA_APP_HOST_LOG: path.join(defaultReportsDir, "m28-app-host.log"),
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
      name: "local-computer-use-m28-client-subcommands",
      version: "0.1.0",
    });
    const tools = await client.request("tools/list", {});
    const toolNames = (tools.result?.tools || []).map((tool) => tool.name).sort();

    const status = JSON.parse((await runClient(["status"])).stdout);
    const eventStreamLine = (await runClient(["event-stream"])).stdout.split(/\r?\n/)[0];
    const eventStream = JSON.parse(eventStreamLine);
    const turnEnded = JSON.parse((await runClient(["turn-ended", "probe"])).stdout);
    const unknown = await runClient(["definitely-unknown"], { allowFailure: true });
    const eventLog = await readFile(eventLogPath, "utf8");

    const checks = {
      mcpToolsListed:
        toolNames.includes("get_app_state") && toolNames.includes("list_apps"),
      statusReachable: status.hostReachable === true,
      eventStreamReachable:
        eventStream.type === "event-stream-status" &&
        eventStream.hostReachable === true,
      turnEndedRecorded:
        turnEnded.ok === true && eventLog.includes('"type":"turn-ended"'),
      unknownFails: unknown.exitCode === 64 && unknown.stderr.includes("Usage:"),
    };
    const report = {
      ok: Object.values(checks).every(Boolean),
      generatedAt: new Date().toISOString(),
      clientPath,
      socketPath,
      checks,
      toolCount: toolNames.length,
      status,
      eventStream,
      turnEnded,
      unknown: {
        exitCode: unknown.exitCode,
        stderr: unknown.stderr,
      },
    };

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      throw new Error(`M28 client subcommands probe failed: ${JSON.stringify(checks)}`);
    }
    console.log(`M28 client subcommands probe passed: tools=${toolNames.length}`);
  } finally {
    if (client) await client.close();
    service.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
