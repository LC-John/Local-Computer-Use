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
const reportPath = path.join(outDir, "m15-performance-baseline.json");
const jsonlPath = path.join(outDir, "m15-performance-baseline.jsonl");
const repetitions = Number(process.env.LOCAL_CUA_M15_REPETITIONS || 3);
const apps = (process.env.LOCAL_CUA_M15_APPS || "Calculator,TextEdit,Google Chrome,Finder")
  .split(",")
  .map((app) => app.trim())
  .filter(Boolean);

function now() {
  return performance.now();
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function round(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}

function payloadBytes(response) {
  return Buffer.byteLength(JSON.stringify(response), "utf8");
}

function summarizeState(state) {
  let nodeCount = 0;
  const roleCounts = {};
  walkTree(state.tree, (node) => {
    nodeCount += 1;
    if (node.role) roleCounts[node.role] = (roleCounts[node.role] || 0) + 1;
  });
  return {
    appName: state.app?.name || null,
    bundleIdentifier: state.app?.bundleIdentifier || null,
    windowTitle: state.window?.title || null,
    screenshotStatus: state.screenshot?.status || null,
    screenshotWidth: state.screenshot?.width || null,
    screenshotHeight: state.screenshot?.height || null,
    returnedNodes: state.limits?.returnedNodes ?? nodeCount,
    nodeCount,
    roleCounts,
  };
}

async function timedCall(client, operation, tool, args) {
  const startedAt = new Date().toISOString();
  const started = now();
  try {
    const response = await client.callTool(tool, args);
    const durationMs = now() - started;
    const sample = {
      operation,
      tool,
      args,
      ok: !response.result?.isError,
      durationMs: round(durationMs),
      responseBytes: payloadBytes(response),
      startedAt,
      finishedAt: new Date().toISOString(),
      meta: response.result?._meta || {},
    };

    if (!sample.ok) {
      sample.errorText = response.result?.content?.[0]?.text || "";
      return sample;
    }

    const parsed = parseToolText(response);
    if (tool === "list_apps") {
      sample.summary = {
        appCount: Array.isArray(parsed) ? parsed.length : null,
      };
    } else if (tool === "get_app_state") {
      sample.summary = summarizeState(parsed);
    }
    return sample;
  } catch (error) {
    return {
      operation,
      tool,
      args,
      ok: false,
      durationMs: round(now() - started),
      responseBytes: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      errorText: error.stack || error.message,
    };
  }
}

async function timedInitialize(client) {
  const started = now();
  await client.initialize({
    name: "local-computer-use-m15-performance-baseline",
    version: "0.1.0",
  });
  return {
    operation: "initialize",
    ok: true,
    durationMs: round(now() - started),
  };
}

function summarizeSamples(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const key = [
      sample.operation,
      sample.tool || "protocol",
      sample.args?.app || "",
    ].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        operation: sample.operation,
        tool: sample.tool || null,
        app: sample.args?.app || null,
        samples: [],
      });
    }
    groups.get(key).samples.push(sample);
  }

  return [...groups.values()].map((group) => {
    const durations = group.samples
      .filter((sample) => sample.ok && typeof sample.durationMs === "number")
      .map((sample) => sample.durationMs);
    const responseBytes = group.samples
      .filter((sample) => sample.ok && typeof sample.responseBytes === "number")
      .map((sample) => sample.responseBytes);
    return {
      operation: group.operation,
      tool: group.tool,
      app: group.app,
      runCount: group.samples.length,
      successCount: group.samples.filter((sample) => sample.ok).length,
      p50DurationMs: round(percentile(durations, 50)),
      p95DurationMs: round(percentile(durations, 95)),
      minDurationMs: round(durations.length ? Math.min(...durations) : null),
      maxDurationMs: round(durations.length ? Math.max(...durations) : null),
      p50ResponseBytes: round(percentile(responseBytes, 50)),
      lastSummary: [...group.samples].reverse().find((sample) => sample.summary)?.summary || null,
      errors: group.samples
        .filter((sample) => !sample.ok)
        .map((sample) => sample.errorText)
        .slice(0, 3),
    };
  });
}

async function runWarmSamples(client) {
  const samples = [];
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    samples.push(
      await timedCall(client, "warm-list-apps", "list_apps", {}),
    );
    for (const app of apps) {
      samples.push(
        await timedCall(client, "warm-get-app-state", "get_app_state", {
          app,
        }),
      );
    }
  }
  return samples;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient({
    requestTimeoutMs: Number(process.env.LOCAL_CUA_M15_TIMEOUT_MS || 60000),
  });

  const samples = [];
  try {
    samples.push(await timedInitialize(client));
    samples.push(await timedCall(client, "cold-list-apps", "list_apps", {}));
    samples.push(
      await timedCall(client, "cold-get-app-state", "get_app_state", {
        app: apps[0] || "Calculator",
      }),
    );
    samples.push(...(await runWarmSamples(client)));
  } finally {
    await client.close({ jsonlPath });
  }

  const summary = summarizeSamples(samples);
  const failed = samples.filter((sample) => !sample.ok);
  const report = {
    ok: failed.length === 0,
    generatedAt: new Date().toISOString(),
    milestone: "M15",
    repetitions,
    apps,
    latencyBudget: {
      warmListAppsP95Ms: 1000,
      warmCalculatorStateP95Ms: 5000,
      warmHeavyAppStateP95Ms: 15000,
    },
    summary,
    samples,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  for (const row of summary) {
    const appLabel = row.app ? ` ${row.app}` : "";
    console.log(
      `${row.operation}${appLabel}: p50=${row.p50DurationMs}ms p95=${row.p95DurationMs}ms success=${row.successCount}/${row.runCount}`,
    );
  }

  if (failed.length > 0) {
    throw new Error(
      `M15 performance baseline completed with ${failed.length} failed samples. See ${reportPath}`,
    );
  }

  console.log(`M15 performance baseline written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
