#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const clientPath =
  process.env.CUA_CLIENT_PATH ||
  "/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient";

const outDir = path.resolve("protocol");
const schemaDir = path.join(outDir, "schemas");
const requestTimeoutMs = Number(process.env.CUA_PROBE_TIMEOUT_MS || 5000);

const samples = [];
const stderrLines = [];

function record(entry) {
  samples.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

function startServer(session) {
  const child = spawn(clientPath, ["mcp"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const responsesById = new Map();
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

      record({ session, phase: "response", response: parsed });

      if (parsed.id !== undefined) {
        const pending = pendingById.get(parsed.id);
        if (pending) {
          pendingById.delete(parsed.id);
          pending.resolve(parsed);
        } else {
          responsesById.set(parsed.id, parsed);
        }
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      stderrLines.push(`[${session}] ${line}`);
      record({ session, phase: "stderr", raw: line });
    }
  });

  child.on("exit", (code, signal) => {
    record({ session, phase: "process_exit", code, signal });
  });

  function waitForResponse(id, timeoutMs = requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingById.delete(id);
        reject(new Error(`Timed out waiting for response id ${id}`));
      }, timeoutMs);

      pendingById.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });

      if (responsesById.has(id)) {
        const value = responsesById.get(id);
        responsesById.delete(id);
        pendingById.get(id).resolve(value);
        pendingById.delete(id);
      }
    });
  }

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async function request(phase, id, method, params, timeoutMs) {
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params === undefined ? {} : { params }),
    };
    record({ session, phase, request: message });
    const responsePromise = waitForResponse(id, timeoutMs);
    send(message);
    return await responsePromise;
  }

  async function notify(phase, method, params) {
    const message = {
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    };
    record({ session, phase, request: message });
    send(message);
  }

  function close() {
    child.stdin.end();
    child.kill("SIGTERM");
  }

  return { child, request, notify, close };
}

async function initializeSession(server, session) {
  const initialize = await server.request(`${session}:initialize`, 1, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: {
      name: "computer-use-probe",
      version: "0.1.0",
    },
  });
  await server.notify(`${session}:initialized_notification`, "notifications/initialized");
  return initialize;
}

function toolInputSchema(tool) {
  return tool.inputSchema || tool.schema || tool.parameters || null;
}

function requiredProps(tool) {
  return toolInputSchema(tool)?.required || [];
}

function invalidArgumentsFor(tool) {
  const required = requiredProps(tool);
  if (required.length === 0) {
    return { __computer_use_probe_invalid_argument__: true };
  }

  const args = {};
  for (const prop of required) {
    args[prop] = 12345;
  }
  return args;
}

async function callInFreshSession(probeName, params) {
  const server = startServer(probeName);
  try {
    await initializeSession(server, probeName);
    return await server.request(probeName, 10, "tools/call", params);
  } catch (error) {
    record({ session: probeName, phase: "probe_error", message: error.message });
    return {
      probeTimedOut: error.message.includes("Timed out"),
      probeError: error.message,
    };
  } finally {
    server.close();
  }
}

function responseSummary(response) {
  if (response.probeTimedOut || response.probeError) {
    return `Probe error: ${response.probeError}`;
  }
  if (response.error) {
    return `JSON-RPC error ${response.error.code}: ${response.error.message || ""}`;
  }
  if (response.result?.isError) {
    return `Tool result error: ${JSON.stringify(response.result.content || [])}`;
  }
  return "No error";
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await rm(schemaDir, { recursive: true, force: true });
  await mkdir(schemaDir, { recursive: true });

  const listServer = startServer("tools-list");
  const initialize = await initializeSession(listServer, "tools-list");
  const toolsList = await listServer.request("tools_list", 2, "tools/list", {});
  listServer.close();

  const tools = toolsList.result?.tools || [];

  await writeFile(
    path.join(outDir, "initialize-response.json"),
    `${JSON.stringify(initialize, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "tools-list.json"),
    `${JSON.stringify(toolsList, null, 2)}\n`,
  );

  const coverage = [];
  for (const tool of tools) {
    const schema = toolInputSchema(tool);
    await writeFile(
      path.join(schemaDir, `${tool.name}.json`),
      `${JSON.stringify(schema ?? {}, null, 2)}\n`,
    );

    coverage.push({
      tool: tool.name,
      schemaCaptured: Boolean(schema),
      missingRequiredProbe: requiredProps(tool).length === 0 ? "n/a" : "no",
      invalidParamsProbe: "no",
      minimalReadOnlyProbe: "not run",
      validActionProbe: tool.annotations?.readOnlyHint ? "n/a" : "deferred",
      notes: tool.annotations?.readOnlyHint
        ? "Read-only tool; valid minimal call may be safe in Milestone 3."
        : "Valid action behavior deferred to fixture/action milestones.",
    });
  }

  const errorCatalog = [];

  for (const tool of tools) {
    const coverageRow = coverage.find((row) => row.tool === tool.name);

    if (requiredProps(tool).length > 0) {
      const response = await callInFreshSession(`missing_required:${tool.name}`, {
        name: tool.name,
        arguments: {},
      });
      coverageRow.missingRequiredProbe = response.probeTimedOut ? "timeout" : "yes";
      errorCatalog.push({
        tool: tool.name,
        probe: "missing_required",
        requestParams: { name: tool.name, arguments: {} },
        response,
      });
    }

    const invalidArgs = invalidArgumentsFor(tool);
    const invalidResponse = await callInFreshSession(`invalid_params:${tool.name}`, {
      name: tool.name,
      arguments: invalidArgs,
    });
    coverageRow.invalidParamsProbe = invalidResponse.probeTimedOut ? "timeout" : "yes";
    errorCatalog.push({
      tool: tool.name,
      probe: "invalid_params",
      requestParams: { name: tool.name, arguments: invalidArgs },
      response: invalidResponse,
    });

    if (tool.annotations?.readOnlyHint && requiredProps(tool).length === 0) {
      const minimalResponse = await callInFreshSession(`minimal:${tool.name}`, {
        name: tool.name,
        arguments: {},
      });
      coverageRow.minimalReadOnlyProbe = minimalResponse.probeTimedOut
        ? "timeout"
        : "yes";
      errorCatalog.push({
        tool: tool.name,
        probe: "minimal_read_only",
        requestParams: { name: tool.name, arguments: {} },
        response: minimalResponse,
      });
    }
  }

  const invalidToolResponse = await callInFreshSession("invalid_tool_name", {
    name: "__computer_use_probe_missing_tool__",
    arguments: {},
  });
  errorCatalog.push({
    tool: "__computer_use_probe_missing_tool__",
    probe: "invalid_tool_name",
    requestParams: {
      name: "__computer_use_probe_missing_tool__",
      arguments: {},
    },
    response: invalidToolResponse,
  });

  await writeFile(
    path.join(outDir, "request-response-samples.jsonl"),
    `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  );
  await writeFile(
    path.join(outDir, "error-catalog.raw.json"),
    `${JSON.stringify(errorCatalog, null, 2)}\n`,
  );

  const coverageMarkdown = [
    "# MCP Tool Coverage",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Coverage is based on the native `tools/list` response. Valid action calls",
    "are intentionally deferred to fixture milestones because they operate the",
    "real desktop.",
    "",
    "| Tool | Schema captured | Missing required | Invalid params | Minimal read-only call | Valid action call | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...coverage.map(
      (row) =>
        `| \`${row.tool}\` | ${row.schemaCaptured ? "yes" : "no"} | ${
          row.missingRequiredProbe
        } | ${row.invalidParamsProbe} | ${row.minimalReadOnlyProbe} | ${
          row.validActionProbe
        } | ${row.notes} |`,
    ),
    "",
  ].join("\n");
  await writeFile(path.join(outDir, "tool-coverage.md"), coverageMarkdown);

  const errorMarkdown = [
    "# MCP Error Catalog",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This catalog records read-only or intentionally invalid probes. Valid action",
    "tool behavior is deferred to later fixture milestones.",
    "",
    ...errorCatalog.map((entry) =>
      [
        `## ${entry.tool}: ${entry.probe}`,
        "",
        `Request params: \`${JSON.stringify(entry.requestParams).replaceAll("|", "\\|")}\``,
        "",
        responseSummary(entry.response),
        "",
      ].join("\n"),
    ),
  ].join("\n");
  await writeFile(path.join(outDir, "error-catalog.md"), errorMarkdown);

  await writeFile(
    path.join(outDir, "stderr.log"),
    `${stderrLines.join("\n")}${stderrLines.length ? "\n" : ""}`,
  );

  console.log(`Captured ${tools.length} tools into ${outDir}`);
}

main().catch(async (error) => {
  record({ phase: "fatal_error", message: error.message, stack: error.stack });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "request-response-samples.jsonl"),
    `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  );
  console.error(error);
  process.exit(1);
});
