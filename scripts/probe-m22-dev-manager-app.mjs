#!/usr/bin/env node

import { access, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const appPath = path.resolve(".build/Local Computer Use Dev Manager.app");
const executablePath = path.join(appPath, "Contents/MacOS/LocalComputerUseDevManager");
const plistPath = path.join(appPath, "Contents/Info.plist");
const reportPath = path.resolve("reports/m22-dev-manager-app.json");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function plistValue(key) {
  const { stdout } = await execFile("/usr/libexec/PlistBuddy", [
    "-c",
    `Print :${key}`,
    plistPath,
  ]);
  return stdout.trim();
}

async function main() {
  const appExists = await exists(appPath);
  const executableExists = await exists(executablePath);
  const plistExists = await exists(plistPath);
  const executableStat = executableExists ? await stat(executablePath) : null;
  const executableIsRunnable = Boolean(executableStat && (executableStat.mode & 0o111) !== 0);
  const bundleIdentifier = plistExists ? await plistValue("CFBundleIdentifier") : null;
  const bundleName = plistExists ? await plistValue("CFBundleName") : null;

  const ok = Boolean(
    appExists &&
      executableExists &&
      plistExists &&
      executableIsRunnable &&
      bundleIdentifier === "local.computer-use.dev-manager" &&
      bundleName === "Local Computer Use Dev Manager",
  );
  const report = {
    ok,
    generatedAt: new Date().toISOString(),
    appPath,
    executablePath,
    plistPath,
    checks: {
      appExists,
      executableExists,
      plistExists,
      executableIsRunnable,
      bundleIdentifier,
      bundleName,
    },
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    throw new Error(`M22 Dev Manager app probe failed: ${JSON.stringify(report.checks)}`);
  }
  console.log(`M22 Dev Manager app probe passed: ${appPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
