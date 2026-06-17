#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const sourcePath = path.resolve(
  "apps/LocalComputerUseDevManager/LocalComputerUseDevManager.swift",
);
const reportPath = path.resolve("reports/m23-diagnostics-ui.json");

const requiredSnippets = [
  "struct DiagnosticCommand",
  "struct CommandHistoryItem",
  "probe:local",
  "probe:m20:state-policy",
  "probe:m22:app",
  "test:m13:negative",
  "test:followups",
  "test:m11:fixtures",
  "probe:m24:plugin-flow",
  "Plugin Flow",
  "Command History",
  "durationText",
];

async function main() {
  const source = await readFile(sourcePath, "utf8");
  const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));
  const report = {
    ok: missing.length === 0,
    generatedAt: new Date().toISOString(),
    sourcePath,
    requiredSnippets,
    missing,
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    throw new Error(`M23 diagnostics UI probe failed; missing: ${missing.join(", ")}`);
  }
  console.log("M23 diagnostics UI probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
