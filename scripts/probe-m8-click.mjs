#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolError,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m8-click-probe.json");
const jsonlPath = path.join(outDir, "m8-click-probe.jsonl");

function findCalculatorButton(state, labels) {
  let found = null;
  walkTree(state.tree, (node) => {
    if (found || node.role !== "AXButton") return;
    const candidates = [
      node.title,
      node.description,
      node.identifier,
      node.value,
    ]
      .filter((value) => value !== undefined && value !== null)
      .map(String);
    if (labels.some((label) => candidates.includes(label))) {
      found = node;
    }
  });
  if (!found) {
    throw new Error(
      `Calculator button not found for labels: ${labels.join(", ")}`,
    );
  }
  return found;
}

function findCalculatorDisplayValue(state) {
  const values = [];
  walkTree(state.tree, (node) => {
    if (node.role === "AXStaticText" && node.value !== undefined) {
      values.push(String(node.value).replace(/[^\d.-]/g, ""));
    }
  });
  return values.find((value) => value === "3" || value === "3.") || "";
}

function calculatorNumericValues(state) {
  const values = [];
  walkTree(state.tree, (node) => {
    if (node.role === "AXStaticText" && node.value !== undefined) {
      const normalized = String(node.value).replace(/[^\d.-]/g, "");
      if (normalized) values.push(normalized);
    }
  });
  return values;
}

function screenshotPointForElement(state, element) {
  const screenshot = state.screenshot;
  const frame = screenshot.windowFrame;
  const scale = screenshot.displayScale;
  const origin = screenshot.imageContentOrigin || {};
  const position = element.position;
  const size = element.size;

  for (const [name, value] of Object.entries({
    screenshot,
    frame,
    scale,
    position,
    size,
  })) {
    if (!value || typeof value !== "object") {
      throw new Error(`Missing ${name} metadata for coordinate mapping`);
    }
  }

  const centerX = position.x + size.width / 2;
  const centerY = position.y + size.height / 2;
  return {
    x: (centerX - frame.x) * scale.x + (origin.x || 0),
    y: (centerY - frame.y) * scale.y + (origin.y || 0),
  };
}

async function state(client) {
  return parseToolText(
    await client.callTool("get_app_state", { app: "Calculator" }),
  );
}

async function click(client, args) {
  return parseToolText(
    await client.callTool("click", { app: "Calculator", ...args }),
  );
}

async function clickButtonByLabels(client, step, labels) {
  const currentState = await state(client);
  const element = findCalculatorButton(currentState, labels);
  const result = await click(client, { element_index: String(element.index) });
  return {
    step,
    elementIndex: String(element.index),
    method: result.result?.method,
  };
}

async function clearCalculator(client) {
  const clearLabels = [
    "全部清除",
    "清除",
    "删除",
    "AllClear",
    "Clear",
    "Delete",
    "AC",
  ];
  const attempts = [];

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    attempts.push(
      await clickButtonByLabels(client, `clear:${attempt}`, clearLabels),
    );
    const currentValues = calculatorNumericValues(await state(client));
    if (
      currentValues.length === 0 ||
      currentValues.every((value) => value === "0" || value === "0.")
    ) {
      break;
    }
  }

  return {
    step: "clear",
    attempts,
  };
}

async function runElementIndexArithmetic(client) {
  const steps = [
    await clearCalculator(client),
    await clickButtonByLabels(client, "one", ["1"]),
    await clickButtonByLabels(client, "add", ["加", "Add"]),
    await clickButtonByLabels(client, "two", ["2"]),
    await clickButtonByLabels(client, "equals", ["等于", "Equals", "="]),
  ];

  const finalState = await state(client);
  const displayValue = findCalculatorDisplayValue(finalState);
  if (displayValue !== "3") {
    throw new Error(
      `Expected Calculator display to be 3, got ${displayValue || "unknown"}`,
    );
  }

  return {
    displayValue,
    steps,
  };
}

async function runCoordinateArithmetic(client) {
  const steps = [await clearCalculator(client)];
  for (const [step, labels] of [
    ["one", ["1"]],
    ["add", ["加", "Add"]],
    ["two", ["2"]],
    ["equals", ["等于", "Equals", "="]],
  ]) {
    const currentState = await state(client);
    const element = findCalculatorButton(currentState, labels);
    const point = screenshotPointForElement(currentState, element);
    const result = await click(client, point);
    steps.push({
      step,
      elementIndex: String(element.index),
      method: result.result?.method,
      point,
    });
  }

  const finalState = await state(client);
  const displayValue = findCalculatorDisplayValue(finalState);
  if (displayValue !== "3") {
    throw new Error(
      `Expected coordinate click display to be 3, got ${displayValue || "unknown"}`,
    );
  }

  return {
    displayValue,
    steps,
  };
}

async function runFallbackDoubleClick(client) {
  await clearCalculator(client);
  const currentState = await state(client);
  const element = findCalculatorButton(currentState, ["1"]);
  const result = await click(client, {
    click_count: 2,
    element_index: String(element.index),
  });
  const finalState = await state(client);
  const values = [];
  walkTree(finalState.tree, (node) => {
    if (node.role === "AXStaticText" && node.value !== undefined) {
      values.push(String(node.value).replace(/[^\d.-]/g, ""));
    }
  });
  if (!values.some((value) => value === "11" || value === "11.")) {
    throw new Error(
      `Expected double-click on 1 to produce 11, got ${values.join(", ")}`,
    );
  }

  return {
    elementIndex: String(element.index),
    method: result.result?.method,
    values,
  };
}

async function runErrorChecks(client) {
  const missingTarget = parseToolError(
    await client.callTool("click", { app: "Calculator" }),
  );
  const badElement = parseToolError(
    await client.callTool("click", {
      app: "Calculator",
      element_index: "999999",
    }),
  );

  if (
    missingTarget.meta["local-computer-use/errorCode"] !==
    "missing_click_target"
  ) {
    throw new Error(
      `Unexpected missing target error: ${JSON.stringify(missingTarget)}`,
    );
  }
  if (badElement.meta["local-computer-use/errorCode"] !== "element_not_found") {
    throw new Error(
      `Unexpected bad element error: ${JSON.stringify(badElement)}`,
    );
  }

  return {
    badElement,
    missingTarget,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient();

  try {
    await client.initialize({
      name: "local-computer-use-m8-click-probe",
      version: "0.1.0",
    });

    const report = {
      elementIndexArithmetic: await runElementIndexArithmetic(client),
      coordinateArithmetic: await runCoordinateArithmetic(client),
      fallbackDoubleClick: await runFallbackDoubleClick(client),
      errorChecks: await runErrorChecks(client),
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log("Local MCP M8 click acceptance probe passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
