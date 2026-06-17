#!/usr/bin/env node

import { createConnection } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.env.LOCAL_CUA_REPO_ROOT || path.resolve(".");
const socketPath =
  process.env.LOCAL_CUA_APP_SOCKET ||
  path.join(os.tmpdir(), `local-computer-use-${process.getuid()}.sock`);
const eventLogPath =
  process.env.LOCAL_CUA_CLIENT_EVENT_LOG ||
  path.join(repoRoot, "reports", "client-events.jsonl");
const serviceEventLogPath =
  process.env.LOCAL_CUA_EVENT_LOG || path.join(repoRoot, "reports", "service-events.jsonl");
const serviceStatusPath =
  process.env.LOCAL_CUA_SERVICE_STATUS ||
  path.join(repoRoot, ".build", "runtime", "service-status.json");

function usage() {
  return [
    "Usage: LocalComputerUseClient <subcommand>",
    "",
    "Subcommands:",
    "  mcp           Run the MCP stdio bridge",
    "  status        Print app-host status as JSON",
    "  event-stream  Print a privacy-safe diagnostic event stream",
    "  turn-ended    Record a Codex turn-ended notification",
  ].join("\n");
}

function canConnect(targetPath) {
  return new Promise((resolve) => {
    const client = createConnection(targetPath);
    client.once("connect", () => {
      client.end();
      resolve(true);
    });
    client.once("error", () => resolve(false));
  });
}

async function appendEvent(event) {
  await mkdir(path.dirname(eventLogPath), { recursive: true });
  await writeFile(eventLogPath, `${JSON.stringify(event)}\n`, { flag: "a" });
}

async function appendServiceEvent(event) {
  await mkdir(path.dirname(serviceEventLogPath), { recursive: true });
  await writeFile(
    serviceEventLogPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      socketPath,
      ...event,
    })}\n`,
    { flag: "a" },
  );
}

async function readServiceStatus() {
  try {
    return JSON.parse(await readFile(serviceStatusPath, "utf8"));
  } catch (error) {
    return {
      error: error.message,
      path: serviceStatusPath,
    };
  }
}

async function statusEvent() {
  const hostReachable = await canConnect(socketPath);
  return {
    type: "status",
    generatedAt: new Date().toISOString(),
    repoRoot,
    socketPath,
    hostReachable,
    serviceStatus: await readServiceStatus(),
    client: {
      name: "LocalComputerUseClient",
      version: "0.1.0",
    },
  };
}

async function runMcp() {
  const socket = createConnection(socketPath);
  socket.once("connect", () => {
    appendServiceEvent({ type: "bridge-connected" }).catch(() => {});
    process.stdin.pipe(socket);
    socket.pipe(process.stdout);
  });
  socket.once("error", (error) => {
    console.error(
      [
        `Unable to connect to Local Computer Use app host at ${socketPath}.`,
        "Open the Local Computer Use Dev Manager app or run `npm run start:app-host`, then retry.",
        error.message,
      ].join("\n"),
    );
    process.exit(1);
  });
  socket.once("close", () => {
    process.stdin.unpipe(socket);
  });
}

async function runStatus() {
  console.log(JSON.stringify(await statusEvent()));
}

async function runEventStream(args) {
  const lines = await readFile(serviceEventLogPath, "utf8")
    .then((source) => source.trim().split(/\r?\n/).filter(Boolean))
    .catch(() => []);
  const event = {
    ...(await statusEvent()),
    type: "event-stream-status",
    eventLogPath: serviceEventLogPath,
    recentEvents: lines.slice(-20).map((line) => JSON.parse(line)),
  };
  console.log(JSON.stringify(event));

  if (!args.includes("--follow")) return;

  const timer = setInterval(async () => {
    console.log(
      JSON.stringify({
        ...(await statusEvent()),
        type: "event-stream-heartbeat",
      }),
    );
  }, 5000);
  process.once("SIGTERM", () => {
    clearInterval(timer);
    process.exit(0);
  });
  process.once("SIGINT", () => {
    clearInterval(timer);
    process.exit(0);
  });
}

async function runTurnEnded(args) {
  const event = {
    type: "turn-ended",
    generatedAt: new Date().toISOString(),
    repoRoot,
    socketPath,
    reason: args[0] || "unspecified",
  };
  await appendEvent(event);
  await appendServiceEvent(event);
  console.log(JSON.stringify({ ok: true, eventLogPath, event }));
}

async function main() {
  const [subcommand, ...args] = process.argv.slice(2);
  if (subcommand === "mcp") return await runMcp();
  if (subcommand === "status") return await runStatus();
  if (subcommand === "event-stream") return await runEventStream(args);
  if (subcommand === "turn-ended") return await runTurnEnded(args);

  console.error(usage());
  process.exitCode = 64;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
