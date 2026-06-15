#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const serverPath = path.resolve("src/server.mjs");
const outDir = path.resolve("reports");
const requestTimeoutMs = Number(process.env.LOCAL_CUA_PROBE_TIMEOUT_MS || 20000);
const samples = [];

function record(entry) {
  samples.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

function startServer() {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pendingById = new Map();
  let stdoutBuffer = "";

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    while (stdoutBuffer.includes("\n")) {
      const index = stdoutBuffer.indexOf("\n");
      const line = stdoutBuffer.slice(0, index).trim();
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (!line) continue;

      const parsed = JSON.parse(line);
      record({ phase: "response", response: parsed });
      const pending = pendingById.get(parsed.id);
      if (pending) {
        pendingById.delete(parsed.id);
        pending.resolve(parsed);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (line.trim()) record({ phase: "stderr", raw: line });
    }
  });

  function send(message) {
    record({ phase: "request", request: message });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(id, method, params) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingById.delete(id);
        reject(new Error(`Timed out waiting for response id ${id}`));
      }, requestTimeoutMs);

      pendingById.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });

      send({
        jsonrpc: "2.0",
        id,
        method,
        ...(params === undefined ? {} : { params }),
      });
    });
  }

  function notify(method, params) {
    send({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    });
  }

  return { child, request, notify };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const server = startServer();
  try {
    const initialize = await server.request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "local-computer-use-probe",
        version: "0.1.0",
      },
    });
    server.notify("notifications/initialized");

    const toolsList = await server.request(2, "tools/list", {});
    const listApps = await server.request(3, "tools/call", {
      name: "list_apps",
      arguments: {},
    });
    const appState = await server.request(4, "tools/call", {
      name: "get_app_state",
      arguments: {
        app: process.env.LOCAL_CUA_PROBE_APP || "frontmost",
      },
    });

    const report = {
      initialize,
      toolCount: toolsList.result?.tools?.length || 0,
      toolNames: (toolsList.result?.tools || []).map((tool) => tool.name),
      listApps,
      appState,
    };

    await writeFile(
      path.join(outDir, "local-mcp-skeleton-probe.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    if (report.toolCount !== 10) {
      throw new Error(`Expected 10 tools, got ${report.toolCount}`);
    }
    if (appState.result?.isError) {
      throw new Error(`Expected get_app_state to succeed: ${appState.result.content?.[0]?.text}`);
    }
    const parsedState = JSON.parse(appState.result?.content?.[0]?.text || "{}");
    if (!parsedState.tree || !parsedState.app) {
      throw new Error("Expected get_app_state to return app metadata and an AX tree");
    }

    console.log("Local MCP AX state probe passed.");
  } finally {
    server.child.stdin.end();
    server.child.kill("SIGTERM");
    await writeFile(
      path.join(outDir, "local-mcp-skeleton-probe.jsonl"),
      `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
    );
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
