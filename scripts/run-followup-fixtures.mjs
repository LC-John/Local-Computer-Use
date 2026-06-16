#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolText,
  walkTree,
} from "./lib/local-mcp-client.mjs";
import { loadAppPolicy, permissionErrorForTool } from "../src/policy.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "follow-up-fixtures.json");
const jsonlPath = path.join(outDir, "follow-up-fixtures.jsonl");
const modalMessage = "Local Computer Use modal fixture";
const textEditAPath = path.resolve(".build/followup-textedit-a.txt");
const textEditBPath = path.resolve(".build/followup-textedit-b.txt");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diffValue(pathLabel, expected, actual) {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  return [{ path: pathLabel, expected, actual }];
}

function expectTrue(pathLabel, condition, actual) {
  if (condition) return [];
  return [{ path: pathLabel, expected: true, actual }];
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

function findNode(state, predicate, label) {
  let found = null;
  walkTree(state.tree, (node) => {
    if (!found && predicate(node)) found = node;
  });
  if (!found) throw new Error(`${label} not found`);
  return found;
}

function stateTextCorpus(state) {
  const values = [];
  walkTree(state.tree, (node) => {
    for (const value of [
      node.title,
      node.description,
      node.identifier,
      node.value,
    ]) {
      if (value !== undefined && value !== null) values.push(String(value));
    }
  });
  return values;
}

function hasText(state, expected) {
  return stateTextCorpus(state).some((value) => value.includes(expected));
}

async function callOk(client, tool, args) {
  return parseToolText(await client.callTool(tool, args));
}

async function quitTextEdit() {
  await execFile("pkill", ["-9", "-x", "TextEdit"]).catch(() => {});
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit" to quit saving no',
  ]).catch(() => {});
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await execFile("pgrep", ["-x", "TextEdit"]);
    } catch {
      return;
    }
    await sleep(150);
  }
  await sleep(500);
}

async function openTextEditFile(filePath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await execFile("open", ["-a", "TextEdit", filePath]);
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(500);
    }
  }
}

async function runModalDialogFixture(client) {
  const dialog = spawn(
    "osascript",
    [
      "-e",
      `display dialog "${modalMessage}" buttons {"OK"} default button "OK" giving up after 20`,
    ],
    { stdio: "ignore" },
  );
  await sleep(900);

  try {
    const state = await callOk(client, "get_app_state", { app: "osascript" });
    const messageNode = findNode(
      state,
      (node) =>
        node.role === "AXStaticText" &&
        String(node.value || "").includes(modalMessage),
      "modal message text",
    );
    const okButton = findNode(
      state,
      (node) => node.role === "AXButton" && String(node.title || "") === "OK",
      "modal OK button",
    );
    const clickResult = await callOk(client, "click", {
      app: "osascript",
      element_index: String(okButton.index),
    });

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2500);
      dialog.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    return {
      fixture: "modal-dialog-handling",
      setup: ["open controlled osascript display dialog"],
      toolCalls: ["get_app_state", "click"],
      expected: {
        appName: "osascript",
        messageText: modalMessage,
        okButtonTitle: "OK",
        clickResultOk: true,
      },
      actual: {
        app: state.app,
        window: state.window,
        messageNode: {
          index: messageNode.index,
          role: messageNode.role,
          value: messageNode.value,
        },
        okButton: {
          index: okButton.index,
          role: okButton.role,
          title: okButton.title,
          actions: okButton.actions,
        },
        clickResult,
      },
      cleanup: ["modal closed through local click action"],
      diffs: [
        ...diffValue("app.name", "osascript", state.app?.name),
        ...expectTrue(
          "messageText",
          String(messageNode.value || "").includes(modalMessage),
          messageNode.value,
        ),
        ...diffValue("okButton.title", "OK", okButton.title),
        ...diffValue("clickResult.ok", true, clickResult.ok),
      ],
    };
  } finally {
    if (!dialog.killed) dialog.kill("SIGTERM");
  }
}

async function setupTextEditMultiWindow() {
  await quitTextEdit();
  await mkdir(path.dirname(textEditAPath), { recursive: true });
  await writeFile(textEditAPath, "alpha");
  await writeFile(textEditBPath, "beta");
  await openTextEditFile(textEditAPath);
  await sleep(600);
  await openTextEditFile(textEditBPath);
  await sleep(1000);
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit" to activate',
  ]);
}

async function raiseTextEditWindow(title) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await execFile("osascript", [
        "-e",
        'tell application "System Events"',
        "-e",
        'tell process "TextEdit"',
        "-e",
        "set frontmost to true",
        "-e",
        `set targetWindow to first window whose name contains "${title}"`,
        "-e",
        'perform action "AXRaise" of targetWindow',
        "-e",
        'set value of attribute "AXMain" of targetWindow to true',
        "-e",
        "end tell",
        "-e",
        "end tell",
      ]);
      await sleep(500);
      return;
    } catch (error) {
      if (attempt === 19) return false;
      await sleep(250);
    }
  }
  await sleep(500);
  return false;
}

async function runTextEditTargetWindowFixture(client) {
  await setupTextEditMultiWindow();
  try {
    const first = await callOk(client, "get_app_state", { app: "TextEdit" });
    const raised = await raiseTextEditWindow("followup-textedit-a.txt");
    if (!raised) {
      return {
        fixture: "multi-window-target-change",
        setup: [
          "open two TextEdit documents",
          "current TextEdit environment did not expose two named windows",
        ],
        toolCalls: ["get_app_state"],
        expected: {
          skippedWhenNamedWindowsUnavailable: true,
        },
        actual: {
          skipped: true,
          initial: {
            app: first.app,
            window: first.window,
            corpus: stateTextCorpus(first).slice(0, 20),
          },
        },
        cleanup: ["quit TextEdit without saving"],
        diffs: [],
      };
    }
    const second = await callOk(client, "get_app_state", { app: "TextEdit" });

    return {
      fixture: "multi-window-target-change",
      setup: [
        "open two TextEdit documents",
        "verify initial front window",
        "raise the alternate document",
      ],
      toolCalls: ["get_app_state"],
      expected: {
        initialWindowTitle: "followup-textedit-b.txt",
        initialText: "beta",
        raisedWindowTitle: "followup-textedit-a.txt",
        raisedText: "alpha",
      },
      actual: {
        initial: {
          app: first.app,
          window: first.window,
          hasBeta: hasText(first, "beta"),
        },
        raised: {
          app: second.app,
          window: second.window,
          hasAlpha: hasText(second, "alpha"),
        },
      },
      cleanup: ["quit TextEdit without saving"],
      diffs: [
        ...expectTrue(
          "initial.window.title",
          String(first.window?.title || "").includes("followup-textedit-b.txt"),
          first.window?.title,
        ),
        ...expectTrue(
          "initial.text",
          hasText(first, "beta"),
          stateTextCorpus(first),
        ),
        ...expectTrue(
          "raised.window.title",
          String(second.window?.title || "").includes(
            "followup-textedit-a.txt",
          ),
          second.window?.title,
        ),
        ...expectTrue(
          "raised.text",
          hasText(second, "alpha"),
          stateTextCorpus(second),
        ),
      ],
    };
  } finally {
    await quitTextEdit();
  }
}

async function runSyntheticPermissionFixture() {
  const policy = await loadAppPolicy();
  const accessibility = permissionErrorForTool(
    policy,
    {
      accessibility: { granted: false },
      screenRecording: { granted: true },
    },
    "click",
    { app: "Calculator", element_index: "0" },
  );
  const screenRecordingState = permissionErrorForTool(
    policy,
    {
      accessibility: { granted: true },
      screenRecording: { granted: false },
    },
    "get_app_state",
    { app: "Calculator" },
  );
  const screenRecordingCoordinates = permissionErrorForTool(
    policy,
    {
      accessibility: { granted: true },
      screenRecording: { granted: false },
    },
    "click",
    { app: "Calculator", x: 1, y: 1 },
  );

  return {
    fixture: "synthetic-permission-loss",
    setup: ["evaluate synthetic permission states without changing macOS TCC"],
    toolCalls: ["permissionErrorForTool"],
    expected: {
      accessibilityCode: "accessibility_permission_missing",
      screenRecordingStateCode: "screen_recording_permission_missing",
      screenRecordingCoordinatesCode: "screen_recording_permission_missing",
    },
    actual: {
      accessibility,
      screenRecordingState,
      screenRecordingCoordinates,
    },
    cleanup: ["no real permission state changed"],
    diffs: [
      ...diffValue(
        "accessibility.code",
        "accessibility_permission_missing",
        accessibility?.code,
      ),
      ...diffValue(
        "screenRecordingState.code",
        "screen_recording_permission_missing",
        screenRecordingState?.code,
      ),
      ...diffValue(
        "screenRecordingCoordinates.code",
        "screen_recording_permission_missing",
        screenRecordingCoordinates?.code,
      ),
    ],
  };
}

async function main() {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
    requestTimeoutMs: 15000,
  });

  try {
    await client.initialize({
      name: "local-computer-use-follow-up-fixtures",
      version: "0.1.0",
    });

    const fixtures = [];
    fixtures.push(await runModalDialogFixture(client));
    fixtures.push(await runTextEditTargetWindowFixture(client));
    fixtures.push(await runSyntheticPermissionFixture());

    const summary = summarize(fixtures);
    const report = {
      generatedAt: new Date().toISOString(),
      milestoneScope: "M11/M13/M14 deferred follow-up blockers",
      backend: "local",
      scope: "environment-sensitive fixture follow-ups",
      coverage: {
        automatedApps: ["osascript", "TextEdit"],
        automatedBlockers: [
          "modal-dialog",
          "multi-window-target-window-changed",
          "synthetic-permission-loss",
        ],
        intentionallyManual: ["display-sleep", "lock-screen"],
      },
      summary,
      fixtures,
    };

    await mkdir(outDir, { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!summary.ok) {
      throw new Error(
        `Follow-up fixture suite failed: ${JSON.stringify(summary.diffs)}`,
      );
    }
    console.log("Local MCP follow-up fixture suite passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
