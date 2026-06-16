#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolError,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m17-stale-state.json");
const jsonlPath = path.join(outDir, "m17-stale-state.jsonl");

function findCalculatorButton(state, labels) {
  let found = null;
  walkTree(state.tree, (node) => {
    if (found || node.role !== "AXButton") return;
    const candidates = [
      node.title,
      node.description,
      node.identifier,
      node.value,
    ]
      .filter((value) => value !== undefined && value !== null)
      .map(String);
    if (labels.some((label) => candidates.includes(label))) found = node;
  });
  if (!found) throw new Error(`Calculator button not found: ${labels.join(", ")}`);
  return found;
}

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
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
    requestTimeoutMs: 30000,
  });

  let report;
  try {
    await client.initialize({
      name: "local-computer-use-m17-stale-state",
      version: "0.1.0",
    });
    const initial = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    const oneButton = findCalculatorButton(initial, ["1"]);
    await moveCalculatorWindowBy(24, 0);
    const stale = parseToolError(
      await client.callTool("click", {
        app: "Calculator",
        element_index: String(oneButton.index),
      }),
    );
    await moveCalculatorWindowBy(-24, 0);

    const code = stale.meta["local-computer-use/errorCode"];
    report = {
      ok: code === "stale_element_index",
      generatedAt: new Date().toISOString(),
      initialWindow: initial.window,
      staleError: stale,
    };
    if (!report.ok) {
      throw new Error(`Expected stale_element_index, got ${code}`);
    }
  } finally {
    await client.close({ jsonlPath });
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log("M17 stale state probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
