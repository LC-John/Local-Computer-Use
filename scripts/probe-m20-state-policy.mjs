#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyStateReadPolicy,
  chooseStateReadPolicy,
  knownStateScenarios,
} from "../src/state-policy.mjs";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m20-state-policy.json");
const jsonlPath = path.join(outDir, "m20-state-policy.jsonl");

function assertEqual(label, expected, actual) {
  if (expected !== actual) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function nodeCount(state) {
  let count = 0;
  walkTree(state.tree, () => {
    count += 1;
  });
  return count;
}

function assertDecision(label, input, expected) {
  const decision = chooseStateReadPolicy(input);
  assertEqual(`${label}.stateMode`, expected.stateMode, decision.stateArgs.stateMode);
  assertEqual(
    `${label}.includeScreenshot`,
    expected.includeScreenshot,
    decision.stateArgs.includeScreenshot,
  );
  return decision;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const decisions = {
    observe: assertDecision(
      "observe",
      { app: "Finder", scenario: "observe" },
      { stateMode: "focused", includeScreenshot: false },
    ),
    inspect: assertDecision(
      "inspect",
      { app: "Finder", scenario: "inspect" },
      { stateMode: "visible", includeScreenshot: false },
    ),
    planAction: assertDecision(
      "plan_action",
      { app: "Finder", scenario: "plan_action" },
      { stateMode: "full", includeScreenshot: false },
    ),
    coordinateAction: assertDecision(
      "coordinate_action",
      { app: "Finder", scenario: "coordinate_action" },
      { stateMode: "full", includeScreenshot: true },
    ),
    afterStaleError: assertDecision(
      "after_stale_error",
      { app: "Finder", scenario: "observe", staleState: true },
      { stateMode: "full", includeScreenshot: true },
    ),
    afterWindowChange: assertDecision(
      "after_window_change",
      { app: "Finder", scenario: "observe", windowChanged: true },
      { stateMode: "full", includeScreenshot: true },
    ),
  };

  let invalidScenarioError = null;
  try {
    chooseStateReadPolicy({ scenario: "side_quest" });
  } catch (error) {
    invalidScenarioError = error.message;
  }
  if (!invalidScenarioError) {
    throw new Error("Expected unknown scenario to fail");
  }

  const client = createLocalMcpClient({ requestTimeoutMs: 30000 });
  let report;
  try {
    await client.initialize({
      name: "local-computer-use-m20-state-policy",
      version: "0.1.0",
    });
    const observeArgs = applyStateReadPolicy(
      "Calculator",
      chooseStateReadPolicy({ app: "Calculator", scenario: "observe" }),
    );
    const coordinateArgs = applyStateReadPolicy(
      "Calculator",
      chooseStateReadPolicy({ app: "Calculator", scenario: "coordinate_action" }),
    );
    const observeState = parseToolText(await client.callTool("get_app_state", observeArgs));
    const coordinateState = parseToolText(
      await client.callTool("get_app_state", coordinateArgs),
    );

    report = {
      ok:
        observeState.state?.mode === "focused" &&
        observeState.screenshot?.status === "skipped" &&
        coordinateState.state?.mode === "full" &&
        coordinateState.screenshot?.status === "captured",
      generatedAt: new Date().toISOString(),
      scenarios: knownStateScenarios(),
      decisions,
      invalidScenarioError,
      liveCalls: {
        observe: {
          args: observeArgs,
          state: observeState.state,
          screenshotStatus: observeState.screenshot?.status,
          nodeCount: nodeCount(observeState),
        },
        coordinateAction: {
          args: coordinateArgs,
          state: coordinateState.state,
          screenshotStatus: coordinateState.screenshot?.status,
          nodeCount: nodeCount(coordinateState),
        },
      },
    };
    if (!report.ok) {
      throw new Error(`Unexpected live M20 state policy behavior: ${JSON.stringify(report.liveCalls)}`);
    }
  } finally {
    await client.close({ jsonlPath });
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `M20 state policy probe passed: observe=${report.liveCalls.observe.state.mode}/${report.liveCalls.observe.screenshotStatus}, coordinate=${report.liveCalls.coordinateAction.state.mode}/${report.liveCalls.coordinateAction.screenshotStatus}`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
