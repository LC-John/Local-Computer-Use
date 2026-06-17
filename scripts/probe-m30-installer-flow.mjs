#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(".");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "local-cua-m30-"));
const pluginRoot = path.join(tempRoot, "plugins");
const reportPath = path.resolve("reports/m30-installer-probe.json");

async function runInstaller(command, extraEnv = {}, allowFailure = false) {
  try {
    const { stdout, stderr } = await execFile("node", ["src/installer-cli.mjs", command], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LOCAL_CUA_PLUGIN_ROOT: pluginRoot,
        LOCAL_CUA_INSTALLER_REPORT: path.join(tempRoot, `${command}.json`),
        ...extraEnv,
      },
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      report: JSON.parse(stdout),
    };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      ok: false,
      stdout: error.stdout?.toString("utf8").trim() || "",
      stderr: error.stderr?.toString("utf8").trim() || "",
      exitCode: error.code ?? 1,
    };
  }
}

async function main() {
  await mkdir(pluginRoot, { recursive: true });
  const initial = await runInstaller("check", {}, true);
  const repair = await runInstaller("repair-link");
  const repaired = await runInstaller("check");

  const otherTarget = path.join(tempRoot, "other");
  await mkdir(otherTarget, { recursive: true });
  await rm(path.join(pluginRoot, "local-computer-use"), { force: true });
  await symlink(otherTarget, path.join(pluginRoot, "local-computer-use"));
  const refusal = await runInstaller("repair-link", {}, true);

  const report = {
    ok:
      initial.exitCode === 2 &&
      repair.report?.ok === true &&
      repair.report?.action?.changed === true &&
      repaired.report?.ok === true &&
      refusal.exitCode === 1 &&
      refusal.stderr.includes("Refusing to overwrite existing plugin path"),
    generatedAt: new Date().toISOString(),
    tempRoot,
    checks: {
      initialMissingLinkFailed: initial.exitCode === 2,
      repairCreatedLink: repair.report?.action?.changed === true,
      repairedCheckOk: repaired.report?.ok === true,
      refusesUnrelatedPath:
        refusal.exitCode === 1 &&
        refusal.stderr.includes("Refusing to overwrite existing plugin path"),
    },
    initial: {
      exitCode: initial.exitCode,
    },
    repair: repair.report,
    repaired: repaired.report,
    refusal: {
      exitCode: refusal.exitCode,
      stderr: refusal.stderr,
    },
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await rm(tempRoot, { recursive: true, force: true });
  if (!report.ok) {
    throw new Error(`M30 installer flow probe failed: ${JSON.stringify(report.checks)}`);
  }
  console.log("M30 installer flow probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
