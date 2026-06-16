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
const reportPath = path.join(outDir, "m16-helper-restart.json");
const jsonlPath = path.join(outDir, "m16-helper-restart.jsonl");
const helperPath = path.resolve(".build/ax-state");

async function helperPids() {
  const { stdout } = await execFile("ps", ["-axo", "pid=,command="]);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter((entry) => entry?.command === `${helperPath} serve`)
    .map((entry) => entry.pid)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function killHelpers(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The helper may already have exited.
    }
  }
}

async function waitForHelperReplacement(previousPids) {
  const previous = new Set(previousPids);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await helperPids();
    const replacement = current.filter((pid) => !previous.has(pid));
    if (replacement.length > 0) return { current, replacement };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { current: await helperPids(), replacement: [] };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient({
    requestTimeoutMs: 30000,
  });

  let report;
  try {
    await client.initialize({
      name: "local-computer-use-m16-helper-restart",
      version: "0.1.0",
    });

    const beforeState = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    const beforePids = await helperPids();
    await killHelpers(beforePids);
    const afterState = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    const restart = await waitForHelperReplacement(beforePids);

    report = {
      ok: Boolean(beforeState.ok && afterState.ok),
      generatedAt: new Date().toISOString(),
      before: {
        helperMode: beforeState.helperMode || null,
        helperPids: beforePids,
        bundleIdentifier: beforeState.app?.bundleIdentifier || null,
      },
      after: {
        helperMode: afterState.helperMode || null,
        helperPids: restart.current,
        replacementPids: restart.replacement,
        bundleIdentifier: afterState.app?.bundleIdentifier || null,
      },
    };

    if (!report.ok) {
      throw new Error(`M16 helper restart probe failed: ${JSON.stringify(report)}`);
    }
  } finally {
    await client.close({ jsonlPath });
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `M16 helper restart probe passed: ${report.before.helperMode} -> ${report.after.helperMode}`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
