#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const reportPath = path.resolve(
  process.argv[2] || "reports/local-mcp-skeleton-probe.json",
);
const fixtureDir = process.argv[3] ? path.resolve(process.argv[3]) : null;

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (!fixtureDir) {
  console.error(
    "Usage: node scripts/save-m7-fixture.mjs <report.json> <fixture-dir>",
  );
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const rawState = report.appState?.result?.content?.[0]?.text;
  if (!rawState) {
    throw new Error(`No get_app_state payload found in ${reportPath}`);
  }

  const state = JSON.parse(rawState);
  if (state.screenshot?.status !== "captured") {
    throw new Error(
      `Screenshot was not captured: ${JSON.stringify(state.screenshot)}`,
    );
  }
  if (!state.screenshot.path) {
    throw new Error("Captured screenshot does not include a file path");
  }

  await mkdir(fixtureDir, { recursive: true });

  const statePath = path.join(fixtureDir, "local-m7-state.json");
  const screenshotPath = path.join(fixtureDir, "local-m7-screenshot.png");
  const overlayPath = path.join(fixtureDir, "local-m7-bounds-overlay.svg");

  const normalizedState = {
    ...state,
    screenshot: {
      ...state.screenshot,
      fixturePath: screenshotPath,
    },
  };

  await writeFile(statePath, `${JSON.stringify(normalizedState, null, 2)}\n`);
  await copyFile(state.screenshot.path, screenshotPath);
  await execFile("node", [
    path.resolve("scripts/render-bounds-overlay.mjs"),
    reportPath,
    overlayPath,
  ]);
  const overlay = await readFile(overlayPath, "utf8");
  await writeFile(
    overlayPath,
    overlay.replaceAll(
      escapeXml(state.screenshot.path),
      "local-m7-screenshot.png",
    ),
  );

  console.log(
    JSON.stringify(
      {
        statePath,
        screenshotPath,
        overlayPath,
        app: state.app?.name,
        screenshot: {
          width: state.screenshot.width,
          height: state.screenshot.height,
          windowID: state.screenshot.windowID,
        },
      },
      null,
      2,
    ),
  );
}
