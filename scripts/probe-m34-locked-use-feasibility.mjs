#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultReportsDir } from "./lib/local-mcp-client.mjs";

const reportPath = path.join(defaultReportsDir, "m34-locked-use-feasibility.json");

async function main() {
  const doc = await readFile("docs/milestone-34-locked-use-guardian-feasibility.md", "utf8");
  const filesToCheck = [
    "src/app-host.mjs",
    "src/client-cli.mjs",
    "apps/LocalComputerUseDevManager/LocalComputerUseDevManager.swift",
    "scripts/build-m22-dev-manager-app.sh",
  ];
  const sources = Object.fromEntries(
    await Promise.all(filesToCheck.map(async (file) => [file, await readFile(file, "utf8")])),
  );
  const forbiddenPatterns = [
    /lock[- ]?screen bypass/i,
    /hidden automation/i,
    /CUALockScreenGuardian/,
    /LocalComputerUseGuardian/,
  ];
  const sourceMatches = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        sourceMatches.push({ file, pattern: String(pattern) });
      }
    }
  }

  const checks = {
    docStatesNoImplementation: /does\s+not\s+implement\s+locked computer use/i.test(doc),
    docHasExplicitNonGoals: doc.includes("No lock-screen bypass") &&
      doc.includes("No hidden automation"),
    sourceHasNoGuardian: sourceMatches.length === 0,
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    checks,
    sourceMatches,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`M34 locked-use feasibility probe failed: ${JSON.stringify(report)}`);
  }
  console.log("M34 locked-use feasibility probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
