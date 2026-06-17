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
const socketPath = path.join(os.tmpdir(), `local-computer-use-m32-${process.pid}.sock`);
const eventLogPath = path.join(defaultReportsDir, "m32-service-events.jsonl");
const clientEventLogPath = path.join(defaultReportsDir, "m32-client-events.jsonl");
const reportPath = path.join(defaultReportsDir, "m32-event-stream-turn-ended.json");

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

async function runClient(args) {
  const { stdout } = await execFile(clientPath, args, {
    env: {
      ...process.env,
      LOCAL_CUA_APP_SOCKET: socketPath,
      LOCAL_CUA_EVENT_LOG: eventLogPath,
      LOCAL_CUA_CLIENT_EVENT_LOG: clientEventLogPath,
    },
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout.trim().split(/\r?\n/)[0]);
}

async function main() {
  const service = spawn(servicePath, [], {
    env: {
      ...process.env,
      LOCAL_CUA_APP_SOCKET: socketPath,
      LOCAL_CUA_EVENT_LOG: eventLogPath,
      LOCAL_CUA_APP_HOST_LOG: path.join(defaultReportsDir, "m32-app-host.log"),
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
        LOCAL_CUA_EVENT_LOG: eventLogPath,
      },
      requestTimeoutMs: 30000,
    });
    await client.initialize({
      name: "local-computer-use-m32-event-stream",
      version: "0.1.0",
    });
    await client.request("tools/list", {});
    await client.close();
    client = null;

    const turnEnded = await runClient(["turn-ended", "probe"]);
    const stream = await runClient(["event-stream"]);
    const eventLog = await readFile(eventLogPath, "utf8");
    const eventTypes = eventLog
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line).type);

    const checks = {
      serviceStarted: eventTypes.includes("service-started"),
      bridgeConnected: eventTypes.includes("bridge-connected"),
      sessionOpened: eventTypes.includes("session-opened"),
      sessionClosed: eventTypes.includes("session-closed"),
      turnEnded: turnEnded.ok === true && eventTypes.includes("turn-ended"),
      streamIncludesRecentEvents:
        stream.type === "event-stream-status" &&
        stream.recentEvents.some((event) => event.type === "turn-ended"),
    };

    const report = {
      ok: Object.values(checks).every(Boolean),
      generatedAt: new Date().toISOString(),
      checks,
      eventTypes,
      stream,
      turnEnded,
    };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      throw new Error(`M32 event stream probe failed: ${JSON.stringify(checks)}`);
    }
    console.log(`M32 event stream and turn-ended probe passed: events=${eventTypes.length}`);
  } finally {
    if (client) await client.close();
    service.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
