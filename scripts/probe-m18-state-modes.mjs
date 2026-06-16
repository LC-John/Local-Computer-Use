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
const reportPath = path.join(outDir, "m18-state-modes.json");
const jsonlPath = path.join(outDir, "m18-state-modes.jsonl");

function nodeCount(state) {
  let count = 0;
  walkTree(state.tree, () => {
    count += 1;
  });
  return count;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient({ requestTimeoutMs: 30000 });
  let report;

  try {
    await client.initialize({
      name: "local-computer-use-m18-state-modes",
      version: "0.1.0",
    });

    const toolsList = await client.request("tools/list", {});
    const stateTool = toolsList.result.tools.find((tool) => tool.name === "get_app_state");
    const properties = stateTool?.inputSchema?.properties || {};
    if (!properties.stateMode || !properties.includeScreenshot) {
      throw new Error("get_app_state schema is missing M18 state mode fields");
    }

    const full = parseToolText(
      await client.callTool("get_app_state", {
        app: "Calculator",
        stateMode: "full",
        includeScreenshot: true,
      }),
    );
    const visible = parseToolText(
      await client.callTool("get_app_state", {
        app: "Calculator",
        stateMode: "visible",
        includeScreenshot: false,
      }),
    );
    const focused = parseToolText(
      await client.callTool("get_app_state", {
        app: "Calculator",
        stateMode: "focused",
        includeScreenshot: false,
      }),
    );

    report = {
      ok:
        full.state?.mode === "full" &&
        full.screenshot?.status === "captured" &&
        visible.state?.mode === "visible" &&
        visible.screenshot?.status === "skipped" &&
        focused.state?.mode === "focused" &&
        focused.screenshot?.status === "skipped" &&
        nodeCount(focused) <= nodeCount(visible) &&
        nodeCount(visible) <= nodeCount(full),
      generatedAt: new Date().toISOString(),
      schema: {
        stateMode: properties.stateMode,
        includeScreenshot: properties.includeScreenshot,
      },
      samples: {
        full: {
          mode: full.state,
          screenshotStatus: full.screenshot?.status,
          limits: full.limits,
          nodeCount: nodeCount(full),
        },
        visible: {
          mode: visible.state,
          screenshotStatus: visible.screenshot?.status,
          limits: visible.limits,
          nodeCount: nodeCount(visible),
        },
        focused: {
          mode: focused.state,
          screenshotStatus: focused.screenshot?.status,
          limits: focused.limits,
          nodeCount: nodeCount(focused),
        },
      },
    };

    if (!report.ok) {
      throw new Error(`Unexpected M18 state mode behavior: ${JSON.stringify(report.samples)}`);
    }
  } finally {
    await client.close({ jsonlPath });
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `M18 state modes probe passed: full=${report.samples.full.nodeCount}, visible=${report.samples.visible.nodeCount}, focused=${report.samples.focused.nodeCount}`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
