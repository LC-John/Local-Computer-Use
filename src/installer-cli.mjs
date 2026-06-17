#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = process.env.LOCAL_CUA_REPO_ROOT || path.resolve(".");
const pluginRoot =
  process.env.LOCAL_CUA_PLUGIN_ROOT || path.join(os.homedir(), "plugins");
const pluginLinkPath =
  process.env.LOCAL_CUA_PLUGIN_LINK ||
  path.join(pluginRoot, "local-computer-use");
const reportPath =
  process.env.LOCAL_CUA_INSTALLER_REPORT ||
  path.join(repoRoot, "reports", "m30-installer-flow.json");

function usage() {
  return [
    "Usage: Local Computer Use installer <command>",
    "",
    "Commands:",
    "  check          Validate manifests and plugin link status",
    "  repair-link    Create or repair ~/plugins/local-computer-use",
    "  codex-add      Run codex plugin add local-computer-use@personal",
  ].join("\n");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function pathStatus(targetPath) {
  try {
    const info = await lstat(targetPath);
    return {
      exists: true,
      isSymbolicLink: info.isSymbolicLink(),
      realpath: await realpath(targetPath).catch(() => null),
    };
  } catch (error) {
    return {
      exists: false,
      isSymbolicLink: false,
      realpath: null,
      error: error.message,
    };
  }
}

async function validateManifest() {
  const validator = path.join(
    os.homedir(),
    ".codex/skills/.system/plugin-creator/scripts/validate_plugin.py",
  );
  try {
    const { stdout, stderr } = await execFile("python3", [validator, "."], {
      cwd: repoRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
    };
  } catch (error) {
    return {
      ok: false,
      output: [
        error.stdout?.toString("utf8").trim(),
        error.stderr?.toString("utf8").trim(),
        error.message,
      ].filter(Boolean).join("\n"),
    };
  }
}

async function inspect() {
  const manifest = await readJson(path.join(repoRoot, ".codex-plugin/plugin.json"));
  const mcp = await readJson(path.join(repoRoot, ".mcp.json"));
  const link = await pathStatus(pluginLinkPath);
  const manifestValidation = await validateManifest();
  const mcpServer = mcp.mcpServers?.["local-computer-use"] || {};
  const ok =
    manifest.name === "local-computer-use" &&
    manifest.mcpServers === "./.mcp.json" &&
    String(mcpServer.command || "").includes("LocalComputerUseClient") &&
    mcpServer.args?.[0] === "mcp" &&
    manifestValidation.ok &&
    link.exists &&
    link.isSymbolicLink &&
    link.realpath === repoRoot;

  return {
    ok,
    generatedAt: new Date().toISOString(),
    repoRoot,
    pluginRoot,
    pluginLinkPath,
    manifest: {
      name: manifest.name,
      version: manifest.version,
      mcpServers: manifest.mcpServers,
    },
    mcpServer,
    link,
    manifestValidation,
    guidance: {
      repairCommand: "npm run installer:m30:repair",
      codexAddCommand: "codex plugin add local-computer-use@personal",
      freshThreadNote:
        "After plugin metadata or install changes, open a fresh Codex thread.",
    },
  };
}

async function writeReport(report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function repairLink() {
  await mkdir(pluginRoot, { recursive: true });
  const link = await pathStatus(pluginLinkPath);
  if (link.exists) {
    if (link.isSymbolicLink && link.realpath === repoRoot) {
      return {
        changed: false,
        message: "Plugin link already points to this repo.",
      };
    }
    if (!link.isSymbolicLink || link.realpath !== repoRoot) {
      throw new Error(
        `Refusing to overwrite existing plugin path: ${pluginLinkPath} -> ${link.realpath || "non-symlink"}`,
      );
    }
  }
  await rm(pluginLinkPath, { force: true });
  await symlink(repoRoot, pluginLinkPath);
  return {
    changed: true,
    message: `Created plugin link ${pluginLinkPath} -> ${repoRoot}`,
  };
}

async function codexAdd() {
  const { stdout, stderr } = await execFile(
    "codex",
    ["plugin", "add", "local-computer-use@personal"],
    {
      cwd: repoRoot,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    },
  );
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function main() {
  const [command] = process.argv.slice(2);
  if (!["check", "repair-link", "codex-add"].includes(command)) {
    console.error(usage());
    process.exitCode = 64;
    return;
  }

  let action = null;
  if (command === "repair-link") {
    action = await repairLink();
  } else if (command === "codex-add") {
    action = await codexAdd();
  }

  const report = await inspect();
  report.command = command;
  report.action = action;
  await writeReport(report);
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
