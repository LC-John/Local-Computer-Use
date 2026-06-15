#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const fixturePath = path.resolve(".build/m8-textedit-keyboard.txt");
const reportPath = path.join(outDir, "m8-keyboard-probe.json");
const jsonlPath = path.join(outDir, "m8-keyboard-probe.jsonl");

function textValues(state) {
  const values = [];
  walkTree(state.tree, (node) => {
    if (node.role === "AXTextArea" || node.role === "AXStaticText") {
      if (typeof node.value === "string") values.push(node.value);
    }
  });
  return values;
}

function stateHasText(state, expected) {
  return textValues(state).some((value) => value.includes(expected));
}

function findTextArea(state) {
  let found = null;
  walkTree(state.tree, (node) => {
    if (!found && node.role === "AXTextArea") {
      found = node;
    }
  });
  if (!found) throw new Error("TextEdit AXTextArea not found");
  return found;
}

async function waitForText(client, expected) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const state = parseToolText(
      await client.callTool("get_app_state", { app: "TextEdit" }),
    );
    if (stateHasText(state, expected)) return state;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for TextEdit text: ${expected}`);
}

async function main() {
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await mkdir(outDir, { recursive: true });
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit" to close every document saving no',
  ]).catch(() => {});
  await writeFile(fixturePath, "");
  await execFile("open", ["-a", "TextEdit", fixturePath]);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const client = createLocalMcpClient();
  try {
    await client.initialize({
      name: "local-computer-use-m8-keyboard-probe",
      version: "0.1.0",
    });

    const typedText = "M8 keyboard action probe";
    const replacementText = "Replacement text";
    const initialState = parseToolText(
      await client.callTool("get_app_state", { app: "TextEdit" }),
    );
    const textArea = findTextArea(initialState);
    parseToolText(
      await client.callTool("click", {
        app: "TextEdit",
        element_index: String(textArea.index),
      }),
    );
    const typed = parseToolText(
      await client.callTool("type_text", {
        app: "TextEdit",
        text: typedText,
      }),
    );
    await waitForText(client, typedText);

    const selectAll = parseToolText(
      await client.callTool("press_key", {
        app: "TextEdit",
        key: "super+a",
      }),
    );
    const deleteSelection = parseToolText(
      await client.callTool("press_key", {
        app: "TextEdit",
        key: "BackSpace",
      }),
    );
    const replacement = parseToolText(
      await client.callTool("type_text", {
        app: "TextEdit",
        text: replacementText,
      }),
    );
    const finalState = await waitForText(client, replacementText);

    const unsupportedKey = parseToolError(
      await client.callTool("press_key", {
        app: "TextEdit",
        key: "NotARealKey",
      }),
    );
    if (
      unsupportedKey.meta["local-computer-use/errorCode"] !== "unsupported_key"
    ) {
      throw new Error(
        `Unexpected unsupported key error: ${JSON.stringify(unsupportedKey)}`,
      );
    }

    const report = {
      fixturePath,
      typed,
      selectAll,
      deleteSelection,
      replacement,
      unsupportedKey,
      finalTextValues: textValues(finalState),
      fileText: await readFile(fixturePath, "utf8").catch(() => ""),
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log("Local MCP M8 keyboard acceptance probe passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
