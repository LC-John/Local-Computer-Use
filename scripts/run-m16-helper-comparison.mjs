#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { defaultReportsDir } from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m16-helper-comparison.json");
const baselinePath = path.join(outDir, "m15-performance-baseline.json");

async function runBaseline(mode) {
  const env = {
    ...process.env,
    LOCAL_CUA_HELPER_MODE: mode,
    LOCAL_CUA_M15_APPS: process.env.LOCAL_CUA_M16_COMPARE_APPS || "Calculator",
    LOCAL_CUA_M15_REPETITIONS:
      process.env.LOCAL_CUA_M16_COMPARE_REPETITIONS || "3",
  };
  const { stdout, stderr } = await execFile(
    "node",
    ["scripts/run-m15-performance-baseline.mjs"],
    {
      env,
      timeout: Number(process.env.LOCAL_CUA_M16_COMPARE_TIMEOUT_MS || 120000),
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const report = JSON.parse(await readFile(baselinePath, "utf8"));
  return {
    mode,
    stdout,
    stderr,
    summary: report.summary,
  };
}

function warmCalculator(summary) {
  return summary.find(
    (row) =>
      row.operation === "warm-get-app-state" &&
      row.tool === "get_app_state" &&
      row.app === "Calculator",
  );
}

function summaryRow(summary, operation, tool, app = null) {
  return summary.find(
    (row) =>
      row.operation === operation &&
      row.tool === tool &&
      (app === null ? row.app === null : row.app === app),
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const persistent = await runBaseline("persistent");
  const oneshot = await runBaseline("oneshot");
  const persistentWarm = warmCalculator(persistent.summary);
  const oneshotWarm = warmCalculator(oneshot.summary);
  const persistentListApps = summaryRow(
    persistent.summary,
    "warm-list-apps",
    "list_apps",
  );
  const oneshotListApps = summaryRow(
    oneshot.summary,
    "warm-list-apps",
    "list_apps",
  );
  const getStateP95DeltaMs =
    oneshotWarm && persistentWarm
      ? oneshotWarm.p95DurationMs - persistentWarm.p95DurationMs
      : null;
  const getStateP50DeltaMs =
    oneshotWarm && persistentWarm
      ? oneshotWarm.p50DurationMs - persistentWarm.p50DurationMs
      : null;
  const getStateP95DeltaPercent =
    getStateP95DeltaMs !== null && oneshotWarm?.p95DurationMs
      ? (getStateP95DeltaMs / oneshotWarm.p95DurationMs) * 100
      : null;
  const listAppsP95DeltaMs =
    oneshotListApps && persistentListApps
      ? oneshotListApps.p95DurationMs - persistentListApps.p95DurationMs
      : null;

  const report = {
    ok: Boolean(persistentWarm && oneshotWarm),
    generatedAt: new Date().toISOString(),
    comparison: {
      app: "Calculator",
      repetitions: Number(process.env.LOCAL_CUA_M16_COMPARE_REPETITIONS || 3),
      persistentWarmP50Ms: persistentWarm?.p50DurationMs ?? null,
      persistentWarmP95Ms: persistentWarm?.p95DurationMs ?? null,
      oneshotWarmP50Ms: oneshotWarm?.p50DurationMs ?? null,
      oneshotWarmP95Ms: oneshotWarm?.p95DurationMs ?? null,
      getStateP50DeltaMs,
      getStateP95DeltaMs,
      getStateP95DeltaPercent:
        getStateP95DeltaPercent === null
          ? null
          : Math.round(getStateP95DeltaPercent * 100) / 100,
      persistentListAppsP95Ms: persistentListApps?.p95DurationMs ?? null,
      oneshotListAppsP95Ms: oneshotListApps?.p95DurationMs ?? null,
      listAppsP95DeltaMs,
    },
    runs: {
      persistent,
      oneshot,
    },
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`M16 helper comparison failed: ${JSON.stringify(report.comparison)}`);
  }
  console.log(
    `M16 helper comparison written: persistent get_state p50/p95=${report.comparison.persistentWarmP50Ms}/${report.comparison.persistentWarmP95Ms}ms, oneshot=${report.comparison.oneshotWarmP50Ms}/${report.comparison.oneshotWarmP95Ms}ms`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
