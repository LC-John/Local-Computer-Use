#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolError,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m10-local-fixture-diff.json");
const jsonlPath = path.join(outDir, "m10-local-fixture-diff.jsonl");
const nativeToolsPath = path.resolve("protocol/tools-list.json");
const hostedCalculatorOraclePath = path.resolve(
  "fixtures",
  "Calculator",
  "basic",
  "codex-hosted-state.md",
);
const missingAppName = "__definitely_missing_app_for_m10_diff__";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(value) {
  return [...value].sort((a, b) => a.localeCompare(b));
}

function diffValue(pathLabel, expected, actual) {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  return [
    {
      path: pathLabel,
      expected,
      actual,
    },
  ];
}

function expectTrue(pathLabel, condition, actual) {
  if (condition) return [];
  return [
    {
      path: pathLabel,
      expected: true,
      actual,
    },
  ];
}

function responseText(response) {
  return response.result?.content?.[0]?.text || "";
}

function normalizeToolError(response) {
  const error = parseToolError(response);
  return {
    isError: true,
    text: error.text,
    code: error.meta["local-computer-use/errorCode"] || null,
    status: error.meta["local-computer-use/status"] || null,
    tool: error.meta.tool || null,
  };
}

function normalizeState(state) {
  const roleCounts = {};
  const identifiers = new Set();
  const descriptions = new Set();
  let nodeCount = 0;
  let indexedNodeCount = 0;
  let buttonCount = 0;
  let staticTextCount = 0;

  walkTree(state.tree, (node) => {
    nodeCount += 1;
    if (node.index !== undefined) indexedNodeCount += 1;
    if (node.role) roleCounts[node.role] = (roleCounts[node.role] || 0) + 1;
    if (node.role === "AXButton") buttonCount += 1;
    if (node.role === "AXStaticText") staticTextCount += 1;
    if (node.identifier) identifiers.add(String(node.identifier));
    if (node.description) descriptions.add(String(node.description));
  });

  return {
    ok: state.ok,
    source: state.source,
    app: {
      bundleIdentifier: state.app?.bundleIdentifier,
      pathBasename: state.app?.path ? path.basename(state.app.path) : "",
      hasPid: Number.isInteger(state.app?.pid) && state.app.pid > 0,
    },
    window: {
      hasTitle: typeof state.window?.title === "string",
      hasPosition: typeof state.window?.position?.x === "number",
      hasSize: typeof state.window?.size?.width === "number",
    },
    screenshot: {
      status: state.screenshot?.status,
      hasPath: Boolean(state.screenshot?.path),
      widthPositive: Number(state.screenshot?.width) > 0,
      heightPositive: Number(state.screenshot?.height) > 0,
      hasWindowFrame: typeof state.screenshot?.windowFrame?.x === "number",
      hasDisplayScale: typeof state.screenshot?.displayScale?.x === "number",
    },
    tree: {
      nodeCount,
      indexedNodeCount,
      buttonCount,
      staticTextCount,
      rootRole: state.tree?.role,
      roleCounts,
      identifiers: sorted(identifiers),
      descriptions: sorted(descriptions),
    },
  };
}

function parseHostedCalculatorOracle(markdown) {
  const bundleIdentifier =
    markdown.match(/bundleID\s+([^\s]+)/)?.[1] ||
    markdown.match(/bundleIdentifier["\s:]+([A-Za-z0-9_.-]+)/)?.[1] ||
    null;
  const observedTree =
    markdown.match(/Observed tree shape:\n\n```text\n([\s\S]*?)```/)?.[1] || "";
  const nodeLines = observedTree
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\s+/.test(line));
  const ids = sorted(
    new Set(
      nodeLines
        .map((line) => line.match(/\bID:\s*([^,\n]+)/)?.[1]?.trim())
        .filter(Boolean),
    ),
  );
  const buttonDescriptions = sorted(
    new Set(
      nodeLines
        .filter((line) => line.includes("按钮"))
        .map((line) => line.match(/Description:\s*([^,]+)/)?.[1]?.trim())
        .filter(Boolean),
    ),
  );

  return {
    source: hostedCalculatorOraclePath,
    bundleIdentifier,
    nodeCount: nodeLines.length,
    ids,
    buttonDescriptions,
  };
}

function compareToolList(nativeToolNames, localToolNames) {
  const expected = sorted(nativeToolNames);
  const actual = sorted(localToolNames);
  return {
    fixture: "tools-list",
    expected: {
      toolNames: expected,
    },
    actual: {
      toolNames: actual,
    },
    diffs: diffValue("toolNames", expected, actual),
  };
}

function compareCalculatorState(state) {
  const normalized = normalizeState(state);
  const diffs = [
    ...diffValue("ok", true, normalized.ok),
    ...diffValue(
      "app.bundleIdentifier",
      "com.apple.calculator",
      normalized.app.bundleIdentifier,
    ),
    ...diffValue("screenshot.status", "captured", normalized.screenshot.status),
    ...expectTrue("app.hasPid", normalized.app.hasPid, normalized.app.hasPid),
    ...expectTrue(
      "screenshot.hasPath",
      normalized.screenshot.hasPath,
      normalized.screenshot.hasPath,
    ),
    ...expectTrue(
      "screenshot.widthPositive",
      normalized.screenshot.widthPositive,
      normalized.screenshot.widthPositive,
    ),
    ...expectTrue(
      "screenshot.heightPositive",
      normalized.screenshot.heightPositive,
      normalized.screenshot.heightPositive,
    ),
    ...expectTrue(
      "screenshot.hasWindowFrame",
      normalized.screenshot.hasWindowFrame,
      normalized.screenshot.hasWindowFrame,
    ),
    ...expectTrue(
      "tree.nodeCount >= 10",
      normalized.tree.nodeCount >= 10,
      normalized.tree.nodeCount,
    ),
    ...expectTrue(
      "tree.indexedNodeCount >= 10",
      normalized.tree.indexedNodeCount >= 10,
      normalized.tree.indexedNodeCount,
    ),
    ...expectTrue(
      "tree.buttonCount >= 10",
      normalized.tree.buttonCount >= 10,
      normalized.tree.buttonCount,
    ),
  ];

  return {
    fixture: "calculator-state",
    expected: {
      appBundleIdentifier: "com.apple.calculator",
      screenshotStatus: "captured",
      minimumNodeCount: 10,
      minimumButtonCount: 10,
    },
    actual: normalized,
    diffs,
  };
}

function compareHostedCalculatorOracle(hostedOracle, state) {
  const normalized = normalizeState(state);
  const requiredIds = ["One", "Add", "Equals", "StandardInputView"];
  const hostedSemanticIds = hostedOracle.ids.filter((id) =>
    requiredIds.includes(id),
  );
  const missingIds = hostedSemanticIds.filter(
    (id) => !normalized.tree.identifiers.includes(id),
  );
  const hostedMinNodeCount = Math.max(
    10,
    Math.floor(hostedOracle.nodeCount * 0.7),
  );

  const diffs = [
    ...diffValue(
      "app.bundleIdentifier",
      hostedOracle.bundleIdentifier,
      normalized.app.bundleIdentifier,
    ),
    ...expectTrue(
      "tree.nodeCount >= 70% hosted oracle nodes",
      normalized.tree.nodeCount >= hostedMinNodeCount,
      normalized.tree.nodeCount,
    ),
    ...diffValue("missingSemanticIds", [], missingIds),
  ];

  return {
    fixture: "calculator-hosted-oracle-semantic-diff",
    expected: {
      source: path.relative(process.cwd(), hostedOracle.source),
      bundleIdentifier: hostedOracle.bundleIdentifier,
      minimumNodeCount: hostedMinNodeCount,
      semanticIdsPresent: hostedSemanticIds,
    },
    actual: {
      bundleIdentifier: normalized.app.bundleIdentifier,
      nodeCount: normalized.tree.nodeCount,
      identifiersPresent: hostedSemanticIds.filter((id) =>
        normalized.tree.identifiers.includes(id),
      ),
      missingSemanticIds: missingIds,
    },
    diffs,
  };
}

function compareErrorFixture(fixture, response, expectedCode) {
  const normalized = normalizeToolError(response);
  return {
    fixture,
    expected: {
      isError: true,
      code: expectedCode,
    },
    actual: normalized,
    diffs: [
      ...diffValue("isError", true, normalized.isError),
      ...diffValue("code", expectedCode, normalized.code),
    ],
  };
}

function summarize(fixtures) {
  const diffs = fixtures.flatMap((fixture) =>
    fixture.diffs.map((diff) => ({
      fixture: fixture.fixture,
      ...diff,
    })),
  );
  return {
    ok: diffs.length === 0,
    fixtureCount: fixtures.length,
    diffCount: diffs.length,
    diffs,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const nativeTools = JSON.parse(await readFile(nativeToolsPath, "utf8"));
  const nativeToolList = nativeTools.tools || nativeTools.result?.tools || [];
  const nativeToolNames = nativeToolList.map((tool) => tool.name);
  const hostedCalculatorOracle = parseHostedCalculatorOracle(
    await readFile(hostedCalculatorOraclePath, "utf8"),
  );
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
  });

  const fixtures = [];
  try {
    await client.initialize({
      name: "local-computer-use-m10-diff-harness",
      version: "0.1.0",
    });

    const toolsList = await client.request("tools/list", {});
    const localToolNames = (toolsList.result?.tools || []).map(
      (tool) => tool.name,
    );
    fixtures.push(compareToolList(nativeToolNames, localToolNames));

    const calculatorStateResponse = await client.callTool("get_app_state", {
      app: "Calculator",
    });
    assert(
      !calculatorStateResponse.result?.isError,
      `Calculator get_app_state failed: ${responseText(calculatorStateResponse)}`,
    );
    const calculatorState = parseToolText(calculatorStateResponse);
    fixtures.push(compareCalculatorState(calculatorState));
    fixtures.push(
      compareHostedCalculatorOracle(hostedCalculatorOracle, calculatorState),
    );

    fixtures.push(
      compareErrorFixture(
        "missing-app-state-error",
        await client.callTool("get_app_state", { app: missingAppName }),
        "invalid_app",
      ),
    );

    fixtures.push(
      compareErrorFixture(
        "denied-app-policy-error",
        await client.callTool("get_app_state", { app: "Terminal" }),
        "app_denied",
      ),
    );

    fixtures.push(
      compareErrorFixture(
        "click-missing-target-error",
        await client.callTool("click", { app: "Calculator" }),
        "missing_click_target",
      ),
    );

    const summary = summarize(fixtures);
    const report = {
      generatedAt: new Date().toISOString(),
      milestone: "M10",
      backend: "local",
      nativeBackend: {
        status: "deferred",
        reason:
          "Raw native/proxy get_app_state capture still times out after app approval in this environment.",
      },
      hostedOracle: {
        status: "active",
        source: path.relative(process.cwd(), hostedCalculatorOracle.source),
        role: "Codex-hosted Computer Use fixture used as semantic oracle while raw native backend is blocked.",
      },
      summary,
      fixtures,
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!summary.ok) {
      throw new Error(
        `M10 fixture diff failed: ${JSON.stringify(summary.diffs)}`,
      );
    }

    console.log("Local MCP M10 fixture diff harness passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
