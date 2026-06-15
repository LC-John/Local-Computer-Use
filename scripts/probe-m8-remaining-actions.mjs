#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolError,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const fixturePath = path.resolve(".build/m8-remaining-actions.txt");
const reportPath = path.join(outDir, "m8-remaining-actions-probe.json");
const jsonlPath = path.join(outDir, "m8-remaining-actions-probe.jsonl");

function findNode(state, predicate, label) {
  let found = null;
  walkTree(state.tree, (node) => {
    if (!found && predicate(node)) found = node;
  });
  if (!found) throw new Error(`${label} not found`);
  return found;
}

function textArea(state) {
  return findNode(
    state,
    (node) => node.role === "AXTextArea",
    "TextEdit AXTextArea",
  );
}

function scrollArea(state) {
  return findNode(
    state,
    (node) =>
      node.role === "AXScrollArea" &&
      (node.actions || []).includes("AXScrollDownByPage"),
    "scrollable AXScrollArea",
  );
}

function windowElement(state) {
  return findNode(state, (node) => node.role === "AXWindow", "AXWindow");
}

function textValue(state) {
  return textArea(state).value || "";
}

function screenshotPointForElement(
  state,
  element,
  horizontalFraction = 0.5,
  verticalFraction = 0.5,
) {
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
    if (!value || typeof value !== "object")
      throw new Error(`Missing ${name} metadata`);
  }
  return {
    x:
      (position.x + size.width * horizontalFraction - frame.x) * scale.x +
      (origin.x || 0),
    y:
      (position.y + size.height * verticalFraction - frame.y) * scale.y +
      (origin.y || 0),
  };
}

async function state(client) {
  return parseToolText(
    await client.callTool("get_app_state", { app: "TextEdit" }),
  );
}

async function setupTextEdit() {
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit" to close every document saving no',
  ]).catch(() => {});
  await writeFile(fixturePath, "");
  await execFile("open", ["-a", "TextEdit", fixturePath]);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await setupTextEdit();

  const client = createLocalMcpClient();
  try {
    await client.initialize({
      name: "local-computer-use-m8-remaining-actions-probe",
      version: "0.1.0",
    });

    const initialState = await state(client);
    const initialTextArea = textArea(initialState);
    parseToolText(
      await client.callTool("click", {
        app: "TextEdit",
        element_index: String(initialTextArea.index),
      }),
    );

    const longText = [
      "alpha beta gamma",
      ...Array.from(
        { length: 40 },
        (_, index) => `scroll marker ${String(index + 1).padStart(2, "0")}`,
      ),
      "omega",
    ].join("\n");

    const setValue = parseToolText(
      await client.callTool("set_value", {
        app: "TextEdit",
        element_index: String(initialTextArea.index),
        value: longText,
      }),
    );
    const afterSet = await state(client);
    if (
      !textValue(afterSet).includes("alpha beta gamma") ||
      !textValue(afterSet).includes("omega")
    ) {
      throw new Error("set_value did not update TextEdit AXTextArea value");
    }

    const afterSetTextArea = textArea(afterSet);
    const selectText = parseToolText(
      await client.callTool("select_text", {
        app: "TextEdit",
        element_index: String(afterSetTextArea.index),
        text: "beta",
      }),
    );
    const replacement = parseToolText(
      await client.callTool("type_text", {
        app: "TextEdit",
        text: "BETA",
      }),
    );
    const afterSelectionReplace = await state(client);
    if (!textValue(afterSelectionReplace).includes("alpha BETA gamma")) {
      throw new Error(
        "select_text did not select the target range for replacement",
      );
    }

    const currentScrollArea = scrollArea(afterSelectionReplace);
    const scroll = parseToolText(
      await client.callTool("scroll", {
        app: "TextEdit",
        element_index: String(currentScrollArea.index),
        direction: "down",
        pages: 1,
      }),
    );
    const secondaryAction = parseToolText(
      await client.callTool("perform_secondary_action", {
        app: "TextEdit",
        element_index: String(windowElement(afterSelectionReplace).index),
        action: "AXRaise",
      }),
    );

    const dragState = await state(client);
    const dragTextArea = textArea(dragState);
    const from = screenshotPointForElement(dragState, dragTextArea, 0.1, 0.1);
    const to = screenshotPointForElement(dragState, dragTextArea, 0.55, 0.1);
    const drag = parseToolText(
      await client.callTool("drag", {
        app: "TextEdit",
        from_x: from.x,
        from_y: from.y,
        to_x: to.x,
        to_y: to.y,
      }),
    );

    const unsupportedAction = parseToolError(
      await client.callTool("perform_secondary_action", {
        app: "TextEdit",
        element_index: String(windowElement(afterSelectionReplace).index),
        action: "AXDefinitelyMissingAction",
      }),
    );
    if (
      unsupportedAction.meta["local-computer-use/errorCode"] !==
      "unsupported_action"
    ) {
      throw new Error(
        `Unexpected unsupported action error: ${JSON.stringify(unsupportedAction)}`,
      );
    }

    const badScroll = parseToolError(
      await client.callTool("scroll", {
        app: "TextEdit",
        element_index: String(currentScrollArea.index),
        direction: "diagonal",
      }),
    );
    if (
      badScroll.meta["local-computer-use/errorCode"] !== "unsupported_direction"
    ) {
      throw new Error(
        `Unexpected bad scroll error: ${JSON.stringify(badScroll)}`,
      );
    }

    const report = {
      drag,
      secondaryAction,
      selectText,
      setValue,
      scroll,
      replacement,
      unsupportedAction,
      badScroll,
      finalTextPrefix: textValue(await state(client)).slice(0, 80),
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log("Local MCP M8 remaining actions acceptance probe passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
