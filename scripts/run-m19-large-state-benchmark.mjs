#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m19-large-state-benchmark.json");
const repetitions = Number(process.env.LOCAL_CUA_M19_REPETITIONS || 4);
const chromeUrl = `file://${path.resolve("fixtures/Chrome/static-page/index.html")}`;
const chromeUrlPrefix = `file://${path.resolve("fixtures/Chrome/static-page/index.html")}`;
const finderDir = path.resolve("fixtures/Finder/project-list");
const textEditFixturePath = path.resolve(".build/m19-textedit-state-fixture.txt");
let textEditWasRunning = false;

const variants = [
  {
    name: "fullScreenshot",
    args: { includeScreenshot: true, stateMode: "full" },
  },
  {
    name: "fullNoScreenshot",
    args: { includeScreenshot: false, stateMode: "full" },
  },
  {
    name: "visibleNoScreenshot",
    args: { includeScreenshot: false, stateMode: "visible" },
  },
  {
    name: "focusedNoScreenshot",
    args: { includeScreenshot: false, stateMode: "focused" },
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appleScriptString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
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

function nodeCount(state) {
  let count = 0;
  walkTree(state.tree, () => {
    count += 1;
  });
  return count;
}

function summarize(samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const payloadBytes = samples.map((sample) => sample.payloadBytes);
  return {
    runCount: samples.length,
    p50DurationMs: round(percentile(durations, 50)),
    p95DurationMs: round(percentile(durations, 95)),
    p50PayloadBytes: round(percentile(payloadBytes, 50)),
    lastNodeCount: samples.at(-1)?.nodeCount ?? null,
    screenshotStatuses: [...new Set(samples.map((sample) => sample.screenshotStatus))],
    screenshotCacheStatuses: [
      ...new Set(samples.map((sample) => sample.screenshotCache).filter(Boolean)),
    ],
  };
}

async function setupChromeFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    "activate",
    "-e",
    `set fixtureUrlPrefix to ${appleScriptString(chromeUrlPrefix)}`,
    "-e",
    "repeat with windowIndex from (count of windows) to 1 by -1",
    "-e",
    "set candidateWindow to window windowIndex",
    "-e",
    "try",
    "-e",
    "if URL of active tab of candidateWindow starts with fixtureUrlPrefix then close candidateWindow",
    "-e",
    "end try",
    "-e",
    "end repeat",
    "-e",
    "set fixtureWindow to make new window",
    "-e",
    `set URL of active tab of fixtureWindow to ${appleScriptString(chromeUrl)}`,
    "-e",
    "set index of fixtureWindow to 1",
    "-e",
    "end tell",
  ]);
  await sleep(1200);
}

async function cleanupChromeFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    `set fixtureUrlPrefix to ${appleScriptString(chromeUrlPrefix)}`,
    "-e",
    "repeat with windowIndex from (count of windows) to 1 by -1",
    "-e",
    "set candidateWindow to window windowIndex",
    "-e",
    "try",
    "-e",
    "if URL of active tab of candidateWindow starts with fixtureUrlPrefix then close candidateWindow",
    "-e",
    "end try",
    "-e",
    "end repeat",
    "-e",
    "end tell",
  ]).catch(() => {});
}

async function setupFinderFixture() {
  await execFile("open", [finderDir]);
  await sleep(900);
}

async function cleanupFinderFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Finder"',
    "-e",
    `set fixturePath to POSIX file ${appleScriptString(finderDir)} as alias`,
    "-e",
    "repeat with candidateWindow in windows",
    "-e",
    "try",
    "-e",
    "if target of candidateWindow is fixturePath then close candidateWindow",
    "-e",
    "end try",
    "-e",
    "end repeat",
    "-e",
    "end tell",
  ]).catch(() => {});
}

async function setupTextEditFixture() {
  textEditWasRunning = await execFile("pgrep", ["-x", "TextEdit"])
    .then(() => true)
    .catch(() => false);
  await mkdir(path.dirname(textEditFixturePath), { recursive: true });
  await writeFile(
    textEditFixturePath,
    "M19 TextEdit state benchmark fixture\nSecond line for AX text area shape.\n",
  );
  await execFile("open", ["-a", "TextEdit", textEditFixturePath]);
  await sleep(1200);
}

async function cleanupTextEditFixture() {
  const title = path.basename(textEditFixturePath);
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit"',
    "-e",
    "repeat with candidateWindow in windows",
    "-e",
    "try",
    "-e",
    `if name of candidateWindow contains ${appleScriptString(title)} then close candidateWindow saving no`,
    "-e",
    "end try",
    "-e",
    "end repeat",
    "-e",
    "end tell",
  ]).catch(() => {});
  if (!textEditWasRunning) {
    await execFile("osascript", [
      "-e",
      'tell application "TextEdit" to quit saving no',
    ]).catch(() => {});
  }
}

const appTargets = [
  {
    key: "chrome",
    app: "Google Chrome",
    setup: setupChromeFixture,
    cleanup: cleanupChromeFixture,
  },
  {
    key: "finder",
    app: "Finder",
    setup: setupFinderFixture,
    cleanup: cleanupFinderFixture,
  },
  {
    key: "textedit",
    app: "TextEdit",
    setup: setupTextEditFixture,
    cleanup: cleanupTextEditFixture,
  },
];

async function timedState(client, app, args) {
  const started = performance.now();
  const response = await client.callTool("get_app_state", { app, ...args });
  const text = response.result?.content?.[0]?.text || "{}";
  const state = parseToolText(response);
  return {
    durationMs: round(performance.now() - started),
    payloadBytes: Buffer.byteLength(text, "utf8"),
    stateMode: state.state?.mode || "full",
    includeScreenshot: state.state?.includeScreenshot ?? true,
    nodeCount: nodeCount(state),
    returnedNodes: state.limits?.returnedNodes ?? null,
    screenshotStatus: state.screenshot?.status || null,
    screenshotCache: state.screenshot?.cache?.status || null,
  };
}

async function runVariant(client, target, variant) {
  const samples = [];
  for (let iteration = 1; iteration <= repetitions; iteration += 1) {
    samples.push({
      iteration,
      ...(await timedState(client, target.app, variant.args)),
    });
  }
  return {
    name: variant.name,
    args: variant.args,
    summary: summarize(samples),
    samples,
  };
}

async function runTarget(target) {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_SCREENSHOT_CACHE: "1",
      LOCAL_CUA_SCREENSHOT_CACHE_TTL_MS: "5000",
    },
    requestTimeoutMs: 90000,
  });

  try {
    await target.setup();
    await client.initialize({
      name: `local-computer-use-m19-${target.key}`,
      version: "0.1.0",
    });
    const runs = {};
    for (const variant of variants) {
      runs[variant.name] = await runVariant(client, target, variant);
    }
    return {
      ok: true,
      app: target.app,
      runs,
    };
  } catch (error) {
    return {
      ok: false,
      app: target.app,
      error: {
        message: error.message,
        stack: error.stack,
      },
    };
  } finally {
    await client.close();
    await target.cleanup();
  }
}

function recommendationFor(result) {
  if (!result.ok) return null;
  const full = result.runs.fullScreenshot.summary;
  const fullNoScreenshot = result.runs.fullNoScreenshot.summary;
  const focused = result.runs.focusedNoScreenshot.summary;
  const visible = result.runs.visibleNoScreenshot.summary;
  const observationCandidates = [
    ["fullNoScreenshot", fullNoScreenshot.p50DurationMs],
    ["visibleNoScreenshot", visible.p50DurationMs],
    ["focusedNoScreenshot", focused.p50DurationMs],
  ].filter(([, duration]) => duration !== null);
  observationCandidates.sort((a, b) => a[1] - b[1]);
  return {
    defaultObservation: observationCandidates[0]?.[0] || "fullNoScreenshot",
    actionPlanning: "fullScreenshot",
    coordinateActionPrerequisite: "fullScreenshot",
    reason: {
      fullScreenshotP50Ms: full.p50DurationMs,
      fullNoScreenshotP50Ms: fullNoScreenshot.p50DurationMs,
      visibleNoScreenshotP50Ms: visible.p50DurationMs,
      focusedNoScreenshotP50Ms: focused.p50DurationMs,
      fullNodes: full.lastNodeCount,
      fullNoScreenshotNodes: fullNoScreenshot.lastNodeCount,
      visibleNodes: visible.lastNodeCount,
      focusedNodes: focused.lastNodeCount,
    },
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const appResults = {};
  for (const target of appTargets) {
    appResults[target.key] = await runTarget(target);
  }

  const report = {
    ok: Object.values(appResults).some((result) => result.ok),
    generatedAt: new Date().toISOString(),
    benchmark: "M19 large-app state mode benchmark",
    repetitions,
    variants,
    apps: appResults,
    recommendations: Object.fromEntries(
      Object.entries(appResults).map(([key, result]) => [key, recommendationFor(result)]),
    ),
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const [key, result] of Object.entries(appResults)) {
    if (!result.ok) {
      console.log(`M19 ${key}: skipped/error: ${result.error.message}`);
      continue;
    }
    const full = result.runs.fullScreenshot.summary;
    const focused = result.runs.focusedNoScreenshot.summary;
    console.log(
      `M19 ${key}: full+screenshot p50=${full.p50DurationMs}ms nodes=${full.lastNodeCount}; focused no-screenshot p50=${focused.p50DurationMs}ms nodes=${focused.lastNodeCount}`,
    );
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
