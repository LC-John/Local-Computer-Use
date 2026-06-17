#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { defaultReportsDir } from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const appPath = path.resolve(".build/Local Computer Use Dev Manager.app");
const clientAppPath = path.join(
  appPath,
  "Contents/SharedSupport/LocalComputerUseClient.app",
);
const servicePath = path.join(appPath, "Contents/MacOS/LocalComputerUseService");
const clientPath = path.join(
  clientAppPath,
  "Contents/MacOS/LocalComputerUseClient",
);
const reportPath = path.join(defaultReportsDir, "m35-release-package.json");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifySignature(targetPath) {
  try {
    const { stdout, stderr } = await execFile("codesign", ["--verify", targetPath], {
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

async function main() {
  const version = JSON.parse(await readFile("VERSION.json", "utf8"));
  const plugin = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const mcp = JSON.parse(await readFile(".mcp.json", "utf8"));
  const appSignature = await verifySignature(appPath);
  const clientSignature = await verifySignature(clientAppPath);
  const checks = {
    versionMetadataPresent:
      version.app &&
      version.client &&
      version.service &&
      version.plugin &&
      version.helper &&
      version.nativeShapeMilestone === "M35",
    pluginVersionMatches: plugin.version === version.plugin,
    appExists: await exists(appPath),
    clientAppExists: await exists(clientAppPath),
    serviceExists: await exists(servicePath),
    clientExists: await exists(clientPath),
    pluginUsesBundledClient:
      mcp.mcpServers?.["local-computer-use"]?.command?.includes("LocalComputerUseClient") &&
      mcp.mcpServers?.["local-computer-use"]?.args?.[0] === "mcp",
    appSignatureOk: appSignature.ok,
    clientSignatureOk: clientSignature.ok,
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    checks,
    version,
    appPath,
    clientAppPath,
    signatures: {
      app: appSignature,
      client: clientSignature,
    },
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`M35 release package probe failed: ${JSON.stringify(checks)}`);
  }
  console.log(`M35 release package probe passed: app=${version.app}, plugin=${version.plugin}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
