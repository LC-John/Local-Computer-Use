#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultReportsDir } from "./lib/local-mcp-client.mjs";

const reportPath = path.join(defaultReportsDir, "m33-native-consolidation.json");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [
    macAdapter,
    axState,
    server,
    buildScript,
    mcpConfig,
  ] = await Promise.all([
    readFile("src/mac-adapter.mjs", "utf8"),
    readFile("src/ax-state.swift", "utf8"),
    readFile("src/server.mjs", "utf8"),
    readFile("scripts/build-m22-dev-manager-app.sh", "utf8"),
    readFile(".mcp.json", "utf8"),
  ]);

  const checks = {
    protocolLayerRemainsNode:
      server.includes("handleToolsCall") && server.includes("process.stdin"),
    helperDefaultsPersistent:
      macAdapter.includes('process.env.LOCAL_CUA_HELPER_MODE || "persistent"'),
    helperHasServeMode:
      axState.includes('if command == "serve"') &&
      axState.includes("runServeMode()"),
    appBundleHasServiceWrapper:
      buildScript.includes("macos_dir=") &&
      buildScript.includes("LocalComputerUseService") &&
      buildScript.includes("src/app-host.mjs"),
    appBundleHasClientWrapper:
      buildScript.includes("LocalComputerUseClient.app") &&
      buildScript.includes("src/client-cli.mjs"),
    pluginUsesBundledClient:
      mcpConfig.includes("LocalComputerUseClient.app/Contents/MacOS/LocalComputerUseClient") &&
      mcpConfig.includes('"mcp"'),
    screenshotPathDocumented:
      axState.includes("/usr/sbin/screencapture") &&
      axState.includes("ScreenCaptureKit") === false,
    helperBinaryBuildableSourceExists: await exists("src/ax-state.swift"),
  };

  const report = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    checks,
    decision: {
      protocolLayer: "Node MCP server remains the protocol boundary for now.",
      nativeLayer:
        "Swift AX helper remains the long-lived native automation/capture boundary.",
      screenshotCapture:
        "screencapture remains the current verified screenshot path; ScreenCaptureKit migration is deferred.",
    },
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    throw new Error(`M33 native consolidation probe failed: ${JSON.stringify(checks)}`);
  }
  console.log("M33 native consolidation probe passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
