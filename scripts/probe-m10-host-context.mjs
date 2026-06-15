#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const capturesDir = path.resolve("captures", "computer-use-proxy");
const outDir = path.resolve("reports");
const reportPath = path.join(outDir, "m10-host-context-probe.json");
const jsonlPath = path.join(outDir, "m10-host-context-probe.jsonl");
const defaultClientPath =
  "/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient";
const defaultHostedCwd =
  "/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809";
const clientPath = process.env.CUA_CLIENT_PATH || defaultClientPath;
const hostedCwd = process.env.CUA_HOSTED_CWD || defaultHostedCwd;
const stateTimeoutMs = Number(
  process.env.CUA_HOST_CONTEXT_STATE_TIMEOUT_MS || 12000,
);
const requestTimeoutMs = Number(
  process.env.CUA_HOST_CONTEXT_REQUEST_TIMEOUT_MS || 5000,
);

const samples = [];

function record(entry) {
  samples.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function loadHostedContext() {
  const files = (await readdir(capturesDir))
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .reverse();

  let chosen = null;
  let chosenEntries = [];
  for (const file of files) {
    const filePath = path.join(capturesDir, file);
    const entries = await readJsonl(filePath).catch(() => []);
    const initialize = entries.find(
      (entry) =>
        entry.phase === "client_to_server" &&
        entry.json?.method === "initialize",
    );
    const toolsList = entries.find(
      (entry) =>
        entry.phase === "client_to_server" &&
        entry.json?.method === "tools/list",
    );
    if (initialize && toolsList) {
      chosen = filePath;
      chosenEntries = entries;
      break;
    }
  }

  if (!chosen) {
    throw new Error(
      "No hosted proxy capture with initialize and tools/list was found",
    );
  }

  const initialize = chosenEntries.find(
    (entry) =>
      entry.phase === "client_to_server" && entry.json?.method === "initialize",
  )?.json;
  const toolsList = chosenEntries.find(
    (entry) =>
      entry.phase === "client_to_server" && entry.json?.method === "tools/list",
  )?.json;
  const resourceMethods = chosenEntries
    .filter(
      (entry) =>
        entry.phase === "client_to_server" &&
        ["resources/list", "resources/templates/list"].includes(
          entry.json?.method,
        ),
    )
    .map((entry) => ({
      method: entry.json.method,
      params: entry.json.params || {},
    }));
  const hostedToolCalls = chosenEntries.filter(
    (entry) =>
      entry.phase === "client_to_server" && entry.json?.method === "tools/call",
  );

  return {
    capturePath: chosen,
    initializeParams: initialize.params,
    toolsListParams: toolsList.params || {},
    resourceMethods,
    hostedToolCallCount: hostedToolCalls.length,
    firstToolCallParams: hostedToolCalls[0]?.json?.params || null,
  };
}

function startNativeServer(session) {
  const child = spawn(clientPath, ["mcp"], {
    cwd: hostedCwd,
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

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        record({ session, phase: "stdout_non_json", raw: line });
        continue;
      }

      record({ session, phase: "server_to_probe", json: parsed });
      if (parsed.method === "elicitation/create" && parsed.id !== undefined) {
        const reply = {
          jsonrpc: "2.0",
          id: parsed.id,
          result: {
            action: "accept",
            content: {},
          },
        };
        record({ session, phase: "probe_to_server", json: reply });
        child.stdin.write(`${JSON.stringify(reply)}\n`);
      }

      const pending = pendingById.get(parsed.id);
      if (pending) {
        pendingById.delete(parsed.id);
        pending.resolve(parsed);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (line.trim()) record({ session, phase: "stderr", raw: line });
    }
  });

  child.on("exit", (code, signal) => {
    record({ session, phase: "process_exit", code, signal });
  });

  function send(message) {
    record({ session, phase: "probe_to_server", json: message });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params, timeoutMs = requestTimeoutMs) {
    const id = request.nextId++;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    };
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingById.delete(id);
        resolve({
          probeTimedOut: true,
          probeError: `Timed out waiting for response id ${id}`,
        });
      }, timeoutMs);

      pendingById.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });
      send(message);
    });
  }
  request.nextId = 1;

  function notify(method, params) {
    send({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    });
  }

  function close() {
    child.stdin.end();
    child.kill("SIGTERM");
  }

  return { close, notify, request };
}

function summarizeResponse(response) {
  if (!response) return { status: "missing" };
  if (response.probeTimedOut) {
    return {
      status: "timeout",
      error: response.probeError,
    };
  }
  if (response.error) {
    return {
      status: "jsonrpc_error",
      code: response.error.code,
      message: response.error.message,
    };
  }
  if (response.result?.isError) {
    return {
      status: "tool_error",
      text: response.result.content?.[0]?.text || "",
    };
  }
  return {
    status: "success",
    hasResult: Boolean(response.result),
    contentTypes: (response.result?.content || []).map(
      (content) => content.type,
    ),
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const hostedContext = await loadHostedContext();
  const native = startNativeServer("native-host-context-emulation");
  const results = {};

  try {
    results.initialize = await native.request(
      "initialize",
      hostedContext.initializeParams,
      requestTimeoutMs,
    );
    native.notify("notifications/initialized");

    results.toolsList = await native.request(
      "tools/list",
      hostedContext.toolsListParams,
      requestTimeoutMs,
    );

    results.resources = [];
    for (const resourceMethod of hostedContext.resourceMethods) {
      results.resources.push({
        method: resourceMethod.method,
        response: await native.request(
          resourceMethod.method,
          resourceMethod.params,
          requestTimeoutMs,
        ),
      });
    }

    results.invalidApp = await native.request(
      "tools/call",
      {
        name: "get_app_state",
        arguments: {
          app: "__definitely_missing_app_for_m10_host_context__",
        },
        _meta: {
          progressToken: 10,
        },
      },
      requestTimeoutMs,
    );

    results.calculatorState = await native.request(
      "tools/call",
      {
        name: "get_app_state",
        arguments: {
          app: "Calculator",
        },
        _meta: hostedContext.firstToolCallParams?._meta || {
          progressToken: 11,
        },
      },
      stateTimeoutMs,
    );
  } finally {
    native.close();
  }

  const summary = {
    hostedInitializeShapeReplayed: true,
    toolsList: summarizeResponse(results.toolsList),
    invalidApp: summarizeResponse(results.invalidApp),
    calculatorState: summarizeResponse(results.calculatorState),
    resourceMethods: results.resources.map((entry) => ({
      method: entry.method,
      response: summarizeResponse(entry.response),
    })),
  };
  summary.nativeStateUsable = summary.calculatorState.status === "success";
  summary.remainingGap = summary.nativeStateUsable
    ? null
    : "Hosted initialize/capabilities/tools metadata can be replayed, but direct native get_app_state for a real app still does not return a usable state payload.";

  const report = {
    generatedAt: new Date().toISOString(),
    milestone: "M10.2",
    clientPath,
    hostedCwd,
    hostedContext: {
      capturePath: path.relative(repoRoot, hostedContext.capturePath),
      initializeParams: hostedContext.initializeParams,
      toolsListParams: hostedContext.toolsListParams,
      resourceMethodCount: hostedContext.resourceMethods.length,
      hostedToolCallCount: hostedContext.hostedToolCallCount,
      hasHostedToolCallMeta: Boolean(hostedContext.firstToolCallParams?._meta),
    },
    summary,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    jsonlPath,
    `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  );

  console.log(
    summary.nativeStateUsable
      ? "M10.2 native host-context probe returned native state."
      : "M10.2 native host-context probe reproduced the native state gap.",
  );
}

main().catch(async (error) => {
  record({ phase: "probe_error", message: error.message });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    jsonlPath,
    `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  );
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
