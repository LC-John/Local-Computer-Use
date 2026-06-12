#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const clientPath =
  process.env.CUA_CLIENT_PATH ||
  "/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient";

const app = process.argv[2] || "Calculator";
const caseName = process.argv[3] || "basic";
const timeoutMs = Number(process.env.CUA_STATE_TIMEOUT_MS || 60000);
const autoAcceptElicitation = process.env.CUA_AUTO_ACCEPT_ELICITATION === "1";
const outDir = path.resolve("fixtures", app.replaceAll("/", "_"), caseName);

const samples = [];

function record(entry) {
  samples.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

function startServer() {
  const child = spawn(clientPath, ["mcp"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  const responses = new Map();

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    while (stdoutBuffer.includes("\n")) {
      const index = stdoutBuffer.indexOf("\n");
      const line = stdoutBuffer.slice(0, index).trim();
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (!line) continue;

      try {
        const parsed = JSON.parse(line);
        record({ phase: "response", response: parsed });
        if (parsed.method === "elicitation/create" && parsed.id !== undefined) {
          const message = parsed.params?.message || "";
          const allowedMessage = message === `Allow Codex to use ${app}?`;
          if (autoAcceptElicitation && allowedMessage) {
            const reply = {
              jsonrpc: "2.0",
              id: parsed.id,
              result: {
                action: "accept",
                content: {},
              },
            };
            record({ phase: "elicitation_reply", response: reply });
            child.stdin.write(`${JSON.stringify(reply)}\n`);
          }
        }
        if (parsed.id !== undefined) responses.set(parsed.id, parsed);
      } catch {
        record({ phase: "stdout_non_json", raw: line });
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

  function waitFor(id, ms) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (responses.has(id)) {
          clearInterval(timer);
          resolve(responses.get(id));
          return;
        }
        if (Date.now() - started > ms) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for response id ${id}`));
        }
      }, 25);
    });
  }

  return { child, send, waitFor };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const server = startServer();
  try {
    server.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "native-state-probe",
          version: "0.1.0",
        },
      },
    });
    await server.waitFor(1, 10000);

    server.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    server.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_app_state",
        arguments: { app },
      },
    });

    const response = await server.waitFor(2, timeoutMs);
    await writeFile(
      path.join(outDir, "native-state.raw.json"),
      `${JSON.stringify(response, null, 2)}\n`,
    );
    console.log(`Captured get_app_state for ${app} into ${outDir}`);
  } catch (error) {
    record({ phase: "probe_error", message: error.message });
    await writeFile(
      path.join(outDir, "native-state-timeout.json"),
      `${JSON.stringify(
        {
          app,
          caseName,
          timeoutMs,
          error: error.message,
        },
        null,
        2,
      )}\n`,
    );
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.child.stdin.end();
    server.child.kill("SIGKILL");
    await writeFile(
      path.join(outDir, "request-response-samples.jsonl"),
      `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
    );
  }
}

main();
