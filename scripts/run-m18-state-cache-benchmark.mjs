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
const reportPath = path.join(outDir, "m18-state-cache-benchmark.json");
const repetitions = Number(process.env.LOCAL_CUA_M18_REPETITIONS || 6);
const app = process.env.LOCAL_CUA_M18_APP || "Calculator";

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

function nodeCount(state) {
  let count = 0;
  walkTree(state.tree, () => {
    count += 1;
  });
  return count;
}

async function timedState(client) {
  const started = performance.now();
  const state = parseToolText(await client.callTool("get_app_state", { app }));
  return {
    durationMs: round(performance.now() - started),
    screenshotCache: state.screenshot?.cache?.status || null,
    screenshotPath: state.screenshot?.path || null,
    screenshotStatus: state.screenshot?.status || null,
    nodeCount: nodeCount(state),
  };
}

function summarize(samples) {
  const durations = samples.map((sample) => sample.durationMs);
  return {
    runCount: samples.length,
    p50DurationMs: round(percentile(durations, 50)),
    p95DurationMs: round(percentile(durations, 95)),
    cacheStatuses: [...new Set(samples.map((sample) => sample.screenshotCache))],
    hitCount: samples.filter((sample) => sample.screenshotCache === "hit").length,
    missCount: samples.filter((sample) => sample.screenshotCache === "miss").length,
    lastNodeCount: samples.at(-1)?.nodeCount ?? null,
  };
}

async function runMode(mode) {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_SCREENSHOT_CACHE: mode === "cache-on" ? "1" : "0",
      LOCAL_CUA_SCREENSHOT_CACHE_TTL_MS:
        process.env.LOCAL_CUA_M18_SCREENSHOT_CACHE_TTL_MS || "5000",
    },
    requestTimeoutMs: 60000,
  });
  const samples = [];
  try {
    await client.initialize({
      name: `local-computer-use-m18-${mode}`,
      version: "0.1.0",
    });
    for (let index = 0; index < repetitions; index += 1) {
      samples.push({
        iteration: index + 1,
        ...(await timedState(client)),
      });
    }
  } finally {
    await client.close({
      jsonlPath: path.join(outDir, `m18-state-cache-benchmark-${mode}.jsonl`),
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
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    benchmark: "M18 repeated get_app_state screenshot cache",
    app,
    repetitions,
    comparison: {
      cacheOnP50Ms: cacheOn.summary.p50DurationMs,
      cacheOffP50Ms: cacheOff.summary.p50DurationMs,
      cacheOnP95Ms: cacheOn.summary.p95DurationMs,
      cacheOffP95Ms: cacheOff.summary.p95DurationMs,
      cacheOnHits: cacheOn.summary.hitCount,
      cacheOffHits: cacheOff.summary.hitCount,
    },
    runs: {
      cacheOn,
      cacheOff,
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `M18 state cache benchmark written: cache-on p50=${report.comparison.cacheOnP50Ms}ms hits=${report.comparison.cacheOnHits}/${repetitions}, cache-off p50=${report.comparison.cacheOffP50Ms}ms`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
