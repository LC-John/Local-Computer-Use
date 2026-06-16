#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolText,
} from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m18-screenshot-cache-invalidation.json");
const jsonlPath = path.join(outDir, "m18-screenshot-cache-invalidation.jsonl");

async function moveCalculatorWindowBy(dx, dy) {
  await execFile("osascript", [
    "-e",
    'tell application "Calculator" to activate',
    "-e",
    'tell application "System Events"',
    "-e",
    'tell process "Calculator"',
    "-e",
    "set currentPosition to position of front window",
    "-e",
    `set position of front window to {((item 1 of currentPosition) + ${dx}), ((item 2 of currentPosition) + ${dy})}`,
    "-e",
    "end tell",
    "-e",
    "end tell",
  ]);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_SCREENSHOT_CACHE: "1",
      LOCAL_CUA_SCREENSHOT_CACHE_TTL_MS: "10000",
    },
    requestTimeoutMs: 30000,
  });

  let report;
  try {
    await client.initialize({
      name: "local-computer-use-m18-cache-invalidation",
      version: "0.1.0",
    });
    const first = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    const second = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    await moveCalculatorWindowBy(18, 0);
    const moved = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    await moveCalculatorWindowBy(-18, 0);

    report = {
      ok:
        first.screenshot?.cache?.status === "miss" &&
        second.screenshot?.cache?.status === "hit" &&
        moved.screenshot?.cache?.status === "miss",
      generatedAt: new Date().toISOString(),
      statuses: {
        first: first.screenshot?.cache || null,
        second: second.screenshot?.cache || null,
        moved: moved.screenshot?.cache || null,
      },
      windows: {
        first: first.window,
        moved: moved.window,
      },
    };
    if (!report.ok) {
      throw new Error(`Unexpected screenshot cache sequence: ${JSON.stringify(report.statuses)}`);
    }
  } finally {
    await client.close({ jsonlPath });
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log("M18 screenshot cache invalidation probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
