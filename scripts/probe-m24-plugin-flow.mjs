#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createLocalMcpClient, defaultReportsDir } from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(".");
const pluginSymlinkPath = path.join(os.homedir(), "plugins/local-computer-use");
const installedPluginPath = path.join(
  os.homedir(),
  ".codex/plugins/cache/personal/local-computer-use/0.1.0",
);
const reportPath = path.join(defaultReportsDir, "m24-plugin-flow.json");

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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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

async function localMcpSmoke() {
  const client = createLocalMcpClient({ requestTimeoutMs: 30000 });
  try {
    await client.initialize({
      name: "local-computer-use-m24-plugin-flow",
      version: "0.1.0",
    });
    const tools = await client.request("tools/list", {});
    const toolNames = (tools.result?.tools || []).map((tool) => tool.name).sort();
    return {
      ok: toolNames.includes("get_app_state") && toolNames.includes("list_apps"),
      toolNames,
    };
  } finally {
    await client.close();
  }
}

async function main() {
  const sourceManifest = await readJson(path.join(repoRoot, ".codex-plugin/plugin.json"));
  const sourceMcp = await readJson(path.join(repoRoot, ".mcp.json"));
  const symlink = await pathStatus(pluginSymlinkPath);
  const installed = await pathStatus(installedPluginPath);
  const manifestValidation = await validateManifest();
  const smoke = await localMcpSmoke();

  const mcpServer = sourceMcp.mcpServers?.["local-computer-use"] || {};
  const report = {
    ok:
      sourceManifest.name === "local-computer-use" &&
      sourceManifest.mcpServers === "./.mcp.json" &&
      mcpServer.command === "node" &&
      mcpServer.args?.[0] === "src/server.mjs" &&
      symlink.exists &&
      symlink.realpath === repoRoot &&
      manifestValidation.ok &&
      smoke.ok,
    generatedAt: new Date().toISOString(),
    sourceManifest: {
      name: sourceManifest.name,
      version: sourceManifest.version,
      mcpServers: sourceManifest.mcpServers,
      skills: sourceManifest.skills,
    },
    sourceMcp: mcpServer,
    symlink,
    installed,
    manifestValidation,
    smoke,
    guidance: {
      installCommand: "codex plugin add local-computer-use@personal",
      refreshNote:
        "After reinstalling or changing plugin metadata, open a fresh Codex thread to pick up MCP tools.",
    },
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (!report.ok) {
    throw new Error(`M24 plugin flow probe failed: ${JSON.stringify({
      symlink: report.symlink,
      manifestValidation: report.manifestValidation.ok,
      smoke: report.smoke.ok,
    })}`);
  }
  console.log(
    `M24 plugin flow probe passed: ${report.sourceManifest.name}@${report.sourceManifest.version}, tools=${report.smoke.toolNames.length}`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
