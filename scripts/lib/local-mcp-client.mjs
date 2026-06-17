import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const defaultReportsDir = path.resolve("reports");

export function createLocalMcpClient({
  command = "node",
  serverPath = path.resolve("src/server.mjs"),
  serverArgs = [],
  env = {},
  requestTimeoutMs = Number(process.env.LOCAL_CUA_PROBE_TIMEOUT_MS || 20000),
} = {}) {
  const samples = [];
  const args = command === "node" ? [serverPath, ...serverArgs] : serverArgs;
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pendingById = new Map();
  let stdoutBuffer = "";
  let nextId = 1;

  function record(entry) {
    samples.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

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

  function request(method, params) {
    const id = nextId++;
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

  async function initialize(clientInfo) {
    await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo,
    });
    notify("notifications/initialized");
    await request("tools/list", {});
  }

  async function callTool(name, args) {
    return await request("tools/call", {
      name,
      arguments: args,
    });
  }

  async function close({ jsonlPath } = {}) {
    child.stdin.end();
    child.kill("SIGTERM");
    if (jsonlPath) {
      await mkdir(path.dirname(jsonlPath), { recursive: true });
      await writeFile(
        jsonlPath,
        `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
      );
    }
  }

  return {
    callTool,
    close,
    initialize,
    request,
    samples,
  };
}

export function parseToolText(response) {
  if (response.result?.isError) {
    throw new Error(response.result.content?.[0]?.text || "Tool call failed");
  }
  return JSON.parse(response.result?.content?.[0]?.text || "{}");
}

export function parseToolError(response) {
  if (!response.result?.isError) {
    throw new Error("Expected tool call to fail");
  }
  return {
    text: response.result.content?.[0]?.text || "",
    meta: response.result._meta || {},
  };
}

export function walkTree(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.children || []) {
    walkTree(child, visit);
  }
}
