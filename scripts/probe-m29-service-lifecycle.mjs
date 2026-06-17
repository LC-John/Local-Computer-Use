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
const socketPath = path.join(os.tmpdir(), `local-computer-use-m29-${process.pid}.sock`);
const statusPath = path.join(defaultReportsDir, "m29-service-status.json");
const reportPath = path.join(defaultReportsDir, "m29-service-lifecycle.json");

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
        LOCAL_CUA_SERVICE_STATUS: statusPath,
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

async function oneMcpSession(label) {
  const client = createLocalMcpClient({
    command: clientPath,
    serverArgs: ["mcp"],
    env: {
      LOCAL_CUA_APP_SOCKET: socketPath,
      LOCAL_CUA_SERVICE_STATUS: statusPath,
    },
    requestTimeoutMs: 30000,
  });
  try {
    await client.initialize({
      name: `local-computer-use-m29-${label}`,
      version: "0.1.0",
    });
    const tools = await client.request("tools/list", {});
    return (tools.result?.tools || []).map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

async function main() {
  const serviceEnv = {
    ...process.env,
    LOCAL_CUA_APP_SOCKET: socketPath,
    LOCAL_CUA_APP_HOST_LOG: path.join(defaultReportsDir, "m29-app-host.log"),
    LOCAL_CUA_SERVICE_STATUS: statusPath,
  };
  const service = spawn(servicePath, [], {
    env: serviceEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForSocket(socketPath);
    const initialStatus = JSON.parse((await runClient(["status"])).stdout);

    const duplicate = spawn(servicePath, [], {
      env: serviceEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let duplicateStderr = "";
    duplicate.stderr.on("data", (chunk) => {
      duplicateStderr += chunk.toString("utf8");
    });
    const duplicateExit = await new Promise((resolve) => {
      duplicate.on("exit", (code) => resolve(code));
    });

    const firstTools = await oneMcpSession("first");
    const secondTools = await oneMcpSession("second");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const serviceStatus = JSON.parse(await readFile(statusPath, "utf8"));
    const finalStatus = JSON.parse((await runClient(["status"])).stdout);

    service.kill("SIGTERM");
    await new Promise((resolve) => service.on("exit", resolve));
    const missingBridge = await runClient(["mcp"], { allowFailure: true });

    const checks = {
      initialReachable: initialStatus.hostReachable === true,
      duplicateDidNotTakeOver:
        duplicateExit === 0 && duplicateStderr.includes("already running"),
      firstSessionTools:
        firstTools.includes("get_app_state") && firstTools.includes("list_apps"),
      secondSessionTools:
        secondTools.includes("get_app_state") && secondTools.includes("list_apps"),
      statusHasLifecycle:
        serviceStatus.pid === initialStatus.serviceStatus.pid &&
        serviceStatus.totalSessions >= 2 &&
        serviceStatus.activeSessions === 0 &&
        serviceStatus.uptimeMs > 0,
      clientStatusReadsService:
        finalStatus.serviceStatus.totalSessions >= 2 &&
        finalStatus.serviceStatus.socketPath === socketPath,
      missingBridgeError:
        missingBridge.exitCode !== 0 &&
        missingBridge.stderr.includes("Unable to connect to Local Computer Use app host"),
    };

    const report = {
      ok: Object.values(checks).every(Boolean),
      generatedAt: new Date().toISOString(),
      socketPath,
      statusPath,
      checks,
      initialStatus,
      finalStatus,
      serviceStatus,
      duplicate: {
        exitCode: duplicateExit,
        stderr: duplicateStderr.trim(),
      },
      missingBridge: {
        exitCode: missingBridge.exitCode,
        stderr: missingBridge.stderr,
      },
    };

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      throw new Error(`M29 service lifecycle probe failed: ${JSON.stringify(checks)}`);
    }
    console.log(`M29 service lifecycle probe passed: sessions=${serviceStatus.totalSessions}`);
  } finally {
    if (!service.killed) service.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
