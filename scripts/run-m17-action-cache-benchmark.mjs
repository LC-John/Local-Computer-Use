#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m17-action-cache-benchmark.json");
const jsonlPath = path.join(outDir, "m17-action-cache-benchmark.jsonl");
const repetitions = Number(process.env.LOCAL_CUA_M17_REPETITIONS || 8);

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

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

async function timedTool(client, tool, args) {
  const started = performance.now();
  const response = await client.callTool(tool, args);
  const durationMs = performance.now() - started;
  if (response.result?.isError) {
    throw new Error(response.result.content?.[0]?.text || `${tool} failed`);
  }
  return {
    durationMs: round(durationMs),
    meta: response.result?._meta || {},
    parsed: parseToolText(response),
  };
}

async function clearCalculator(client) {
  const state = parseToolText(
    await client.callTool("get_app_state", { app: "Calculator" }),
  );
  const clearButton = findCalculatorButton(state, [
    "全部清除",
    "清除",
    "删除",
    "AllClear",
    "Clear",
    "Delete",
    "AC",
  ]);
  for (let index = 0; index < 4; index += 1) {
    await timedTool(client, "click", {
      app: "Calculator",
      element_index: String(clearButton.index),
    }).catch(() => {});
  }
}

function summarize(samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const policyDurations = samples
    .map((sample) => sample.meta["local-computer-use/policyDurationMs"])
    .filter((value) => typeof value === "number");
  const adapterDurations = samples
    .map((sample) => sample.meta["local-computer-use/adapterDurationMs"])
    .filter((value) => typeof value === "number");
  return {
    runCount: samples.length,
    p50DurationMs: round(percentile(durations, 50)),
    p95DurationMs: round(percentile(durations, 95)),
    p50PolicyDurationMs: round(percentile(policyDurations, 50)),
    p50AdapterDurationMs: round(percentile(adapterDurations, 50)),
    minDurationMs: round(Math.min(...durations)),
    maxDurationMs: round(Math.max(...durations)),
    identityCacheValues: [...new Set(samples.map((sample) => sample.meta["local-computer-use/identityCache"]))],
    approvalCacheValues: [...new Set(samples.map((sample) => sample.meta["local-computer-use/approvalCache"]))],
  };
}

async function runMode(mode) {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_POLICY_CACHE: mode === "cache-on" ? "1" : "0",
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
    requestTimeoutMs: 30000,
  });

  const samples = [];
  try {
    await client.initialize({
      name: `local-computer-use-m17-${mode}`,
      version: "0.1.0",
    });
    let state = parseToolText(
      await client.callTool("get_app_state", { app: "Calculator" }),
    );
    let oneButton = findCalculatorButton(state, ["1"]);

    for (let index = 0; index < repetitions; index += 1) {
      let sample = null;
      let refreshedForStale = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          sample = await timedTool(client, "click", {
            app: "Calculator",
            element_index: String(oneButton.index),
          });
          break;
        } catch (error) {
          if (!String(error.message).includes("stale app/window state")) {
            throw error;
          }
          state = parseToolText(
            await client.callTool("get_app_state", { app: "Calculator" }),
          );
          oneButton = findCalculatorButton(state, ["1"]);
          refreshedForStale = true;
        }
      }
      if (!sample) {
        throw new Error("Unable to recover from stale Calculator element index");
      }
      if (refreshedForStale) {
        sample.meta["local-computer-use/staleRefresh"] = true;
      }
      samples.push({
        iteration: index + 1,
        durationMs: sample.durationMs,
        meta: sample.meta,
        method: sample.parsed.result?.method || null,
      });
    }
  } finally {
    await clearCalculator(client).catch(() => {});
    await client.close({
      jsonlPath:
        mode === "cache-on"
          ? jsonlPath
          : path.join(outDir, "m17-action-cache-benchmark-cache-off.jsonl"),
    });
  }

  return {
    mode,
    summary: summarize(samples),
    samples,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const cacheOn = await runMode("cache-on");
  const cacheOff = await runMode("cache-off");
  const improvementMs =
    cacheOff.summary.p50DurationMs - cacheOn.summary.p50DurationMs;
  const improvementPercent =
    cacheOff.summary.p50DurationMs === 0
      ? null
      : (improvementMs / cacheOff.summary.p50DurationMs) * 100;

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    benchmark: "M17 repeated Calculator element-index click",
    repetitions,
    comparison: {
      cacheOnP50Ms: cacheOn.summary.p50DurationMs,
      cacheOffP50Ms: cacheOff.summary.p50DurationMs,
      p50ImprovementMs: round(improvementMs),
      p50ImprovementPercent: round(improvementPercent),
      cacheOnP95Ms: cacheOn.summary.p95DurationMs,
      cacheOffP95Ms: cacheOff.summary.p95DurationMs,
    },
    runs: {
      cacheOn,
      cacheOff,
    },
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `M17 action cache benchmark written: cache-on p50=${report.comparison.cacheOnP50Ms}ms, cache-off p50=${report.comparison.cacheOffP50Ms}ms`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
