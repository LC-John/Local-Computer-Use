#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { defaultReportsDir } from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const reportPath = path.join(defaultReportsDir, "m31-permission-onboarding.json");

async function runPermission(args, env = {}) {
  const { stdout, stderr } = await execFile("node", ["src/permission-cli.mjs", ...args], {
    env: {
      ...process.env,
      ...env,
    },
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    json: JSON.parse(stdout),
  };
}

async function main() {
  const status = await runPermission(["status"]);
  const accessibility = await runPermission(["open-accessibility"], {
    LOCAL_CUA_PERMISSION_OPEN: "0",
  });
  const screenRecording = await runPermission(["open-screen-recording"], {
    LOCAL_CUA_PERMISSION_OPEN: "0",
  });

  const checks = {
    statusHasAccessibility:
      typeof status.json.recovery?.accessibility?.granted === "boolean" &&
      status.json.recovery.accessibility.url.includes("Privacy_Accessibility"),
    statusHasScreenRecording:
      typeof status.json.recovery?.screenRecording?.granted === "boolean" &&
      status.json.recovery.screenRecording.url.includes("Privacy_ScreenCapture"),
    accessibilityDryRun:
      accessibility.json.dryRun === true &&
      accessibility.json.url.includes("Privacy_Accessibility"),
    screenRecordingDryRun:
      screenRecording.json.dryRun === true &&
      screenRecording.json.url.includes("Privacy_ScreenCapture"),
  };

  const report = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    checks,
    status: status.json,
    accessibility: accessibility.json,
    screenRecording: screenRecording.json,
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`M31 permission onboarding probe failed: ${JSON.stringify(checks)}`);
  }
  console.log("M31 permission onboarding probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
