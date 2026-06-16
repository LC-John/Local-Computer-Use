#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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
const reportPath = path.join(outDir, "m11-fixture-test-suite.json");
const jsonlPath = path.join(outDir, "m11-fixture-test-suite.jsonl");
const textEditFixturePath = path.resolve(".build/m11-textedit-fixture.txt");
const chromeUrlPrefix = `file://${path.resolve("fixtures/Chrome/static-page/index.html")}`;
const chromeUrl = `${chromeUrlPrefix}?m11=${Date.now()}`;
const finderDir = path.resolve("fixtures/Finder/project-list");
const missingAppName = "__definitely_missing_app_for_m11_fixture__";

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

function appleScriptString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
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

function hasText(state, text) {
  return stateTextCorpus(state).some((value) => value.includes(text));
}

function normalizeChromePageTitle(title) {
  return String(title || "").replace(/\s+-\s+Google Chrome(?:\s+-\s+.*)?$/, "");
}

function normalizeChromeFixtureUrl(url) {
  return String(url || "").replace(
    chromeUrlPrefix,
    "file://fixtures/Chrome/static-page/index.html",
  );
}

function normalizeChromeFrontWindowInfo(info) {
  return {
    tabCount: info.tabCount,
    activeUrl: normalizeChromeFixtureUrl(info.activeUrl),
  };
}

function normalizeStateShape(state) {
  const roleCounts = {};
  let nodeCount = 0;
  let indexedNodeCount = 0;
  walkTree(state.tree, (node) => {
    nodeCount += 1;
    if (node.index !== undefined) indexedNodeCount += 1;
    if (node.role) roleCounts[node.role] = (roleCounts[node.role] || 0) + 1;
  });
  return {
    ok: state.ok,
    bundleIdentifier: state.app?.bundleIdentifier || null,
    screenshotStatus: state.screenshot?.status || null,
    screenshotWidth: state.screenshot?.width || null,
    screenshotHeight: state.screenshot?.height || null,
    rootRole: state.tree?.role || null,
    nodeCount,
    indexedNodeCount,
    roleCounts,
  };
}

function screenshotPointForElement(
  state,
  element,
  horizontalFraction = 0.5,
  verticalFraction = 0.5,
) {
  const screenshot = state.screenshot;
  const frame = screenshot?.windowFrame;
  const scale = screenshot?.displayScale;
  const origin = screenshot?.imageContentOrigin || {};
  const position = element.position;
  const size = element.size;

  for (const [name, value] of Object.entries({
    frame,
    scale,
    position,
    size,
  })) {
    if (!value || typeof value !== "object") {
      throw new Error(`Missing ${name} metadata for coordinate mapping`);
    }
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

async function callOk(client, tool, args) {
  return parseToolText(await client.callTool(tool, args));
}

async function appState(client, app) {
  return callOk(client, "get_app_state", { app });
}

function findCalculatorButton(state, labels) {
  return findNode(
    state,
    (node) => {
      if (node.role !== "AXButton") return false;
      const candidates = [
        node.title,
        node.description,
        node.identifier,
        node.value,
      ]
        .filter((value) => value !== undefined && value !== null)
        .map(String);
      return labels.some((label) => candidates.includes(label));
    },
    `Calculator button ${labels.join("/")}`,
  );
}

function calculatorDisplayValues(state) {
  const values = [];
  walkTree(state.tree, (node) => {
    if (node.role === "AXStaticText" && node.value !== undefined) {
      const normalized = String(node.value).replace(/[^\d.-]/g, "");
      if (normalized) values.push(normalized);
    }
  });
  return values;
}

async function clickCalculatorButton(client, labels) {
  const currentState = await appState(client, "Calculator");
  const element = findCalculatorButton(currentState, labels);
  const result = await callOk(client, "click", {
    app: "Calculator",
    element_index: String(element.index),
  });
  return {
    elementIndex: String(element.index),
    labels,
    method: result.result?.method || result.source || null,
  };
}

async function clearCalculator(client) {
  const attempts = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    attempts.push(
      await clickCalculatorButton(client, [
        "全部清除",
        "清除",
        "删除",
        "AllClear",
        "Clear",
        "Delete",
        "AC",
      ]),
    );
    const values = calculatorDisplayValues(
      await appState(client, "Calculator"),
    );
    if (
      values.length === 0 ||
      values.every((value) => value === "0" || value === "0.")
    ) {
      break;
    }
  }
  return attempts;
}

async function runCalculatorArithmeticFixture(client) {
  const steps = [
    ...(await clearCalculator(client)).map((step) => ({
      step: "clear",
      ...step,
    })),
  ];
  for (const [stepName, labels] of [
    ["one", ["1"]],
    ["add", ["加", "Add"]],
    ["two", ["2"]],
    ["equals", ["等于", "Equals", "="]],
  ]) {
    steps.push({
      step: stepName,
      ...(await clickCalculatorButton(client, labels)),
    });
  }

  const finalState = await appState(client, "Calculator");
  const displayValues = calculatorDisplayValues(finalState);
  const shape = normalizeStateShape(finalState);
  return {
    fixture: "calculator-arithmetic-click",
    setup: ["focus Calculator through get_app_state", "clear display"],
    toolCalls: ["get_app_state", "click"],
    expected: {
      displayValueIncludes: "3",
      bundleIdentifier: "com.apple.calculator",
      screenshotStatus: "captured",
    },
    actual: {
      displayValues,
      shape,
      steps,
    },
    cleanup: [],
    diffs: [
      ...diffValue(
        "shape.bundleIdentifier",
        "com.apple.calculator",
        shape.bundleIdentifier,
      ),
      ...diffValue(
        "shape.screenshotStatus",
        "captured",
        shape.screenshotStatus,
      ),
      ...expectTrue(
        "display includes 3",
        displayValues.includes("3"),
        displayValues,
      ),
      ...expectTrue(
        "tree.nodeCount >= 10",
        shape.nodeCount >= 10,
        shape.nodeCount,
      ),
    ],
  };
}

async function setupTextEditFixture() {
  await mkdir(path.dirname(textEditFixturePath), { recursive: true });
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit" to quit saving no',
  ]).catch(() => {});
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stillRunning = await execFile("pgrep", ["-x", "TextEdit"])
      .then(() => true)
      .catch(() => false);
    if (!stillRunning) break;
    await sleep(150);
  }
  await writeFile(textEditFixturePath, "");
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit"',
    "-e",
    "activate",
    "-e",
    'make new document with properties {text:""}',
    "-e",
    "end tell",
  ]).catch(() => {});
  await execFile("osascript", [
    "-e",
    'tell application "System Events"',
    "-e",
    'if exists process "TextEdit" then',
    "-e",
    'tell process "TextEdit"',
    "-e",
    "set frontmost to true",
    "-e",
    "key code 53",
    "-e",
    "end tell",
    "-e",
    "end if",
    "-e",
    "end tell",
  ]).catch(() => {});
  await sleep(1000);
}

async function cleanupTextEditFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "TextEdit" to quit saving no',
  ]).catch(() => {});
}

function textArea(state) {
  return findNode(
    state,
    (node) => node.role === "AXTextArea",
    "TextEdit AXTextArea",
  );
}

function textValue(state) {
  return String(textArea(state).value || "");
}

async function waitForTextArea(client) {
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await appState(client, "TextEdit");
    try {
      textArea(state);
      return state;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError || new Error("TextEdit AXTextArea not found");
}

async function waitForText(client, expected) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const state = await appState(client, "TextEdit");
    if (textValue(state).includes(expected)) return state;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for TextEdit text: ${expected}`);
}

async function runTextEditKeyboardFixture(client) {
  await setupTextEditFixture();
  const typedText = "M11 keyboard fixture";
  const replacementText = "M11 replacement text";
  const initialState = await waitForTextArea(client);
  const initialTextArea = textArea(initialState);
  const clickTextArea = await callOk(client, "click", {
    app: "TextEdit",
    element_index: String(initialTextArea.index),
  });
  const typeText = await callOk(client, "type_text", {
    app: "TextEdit",
    text: typedText,
  });
  await waitForText(client, typedText);
  const selectAll = await callOk(client, "press_key", {
    app: "TextEdit",
    key: "super+a",
  });
  const deleteSelection = await callOk(client, "press_key", {
    app: "TextEdit",
    key: "BackSpace",
  });
  const typeReplacement = await callOk(client, "type_text", {
    app: "TextEdit",
    text: replacementText,
  });
  const finalState = await waitForText(client, replacementText);
  const shape = normalizeStateShape(finalState);

  return {
    fixture: "textedit-keyboard-editing",
    setup: [`open ${path.relative(process.cwd(), textEditFixturePath)}`],
    toolCalls: ["get_app_state", "click", "type_text", "press_key"],
    expected: {
      textIncludes: replacementText,
      bundleIdentifier: "com.apple.TextEdit",
      hasTextArea: true,
    },
    actual: {
      clickTextArea,
      typeText,
      selectAll,
      deleteSelection,
      typeReplacement,
      finalTextPrefix: textValue(finalState).slice(0, 120),
      shape,
    },
    cleanup: ["close TextEdit documents without saving"],
    diffs: [
      ...diffValue(
        "shape.bundleIdentifier",
        "com.apple.TextEdit",
        shape.bundleIdentifier,
      ),
      ...expectTrue(
        "text includes replacement",
        textValue(finalState).includes(replacementText),
        textValue(finalState),
      ),
      ...expectTrue(
        "has AXTextArea",
        Boolean(shape.roleCounts.AXTextArea),
        shape.roleCounts,
      ),
    ],
  };
}

async function runTextEditActionFixture(client) {
  await setupTextEditFixture();
  const initialState = await waitForTextArea(client);
  const initialTextArea = textArea(initialState);
  await callOk(client, "click", {
    app: "TextEdit",
    element_index: String(initialTextArea.index),
  });

  const longText = [
    "alpha beta gamma",
    ...Array.from(
      { length: 40 },
      (_, index) => `scroll marker ${String(index + 1).padStart(2, "0")}`,
    ),
    "omega",
  ].join("\n");
  const setValue = await callOk(client, "set_value", {
    app: "TextEdit",
    element_index: String(initialTextArea.index),
    value: longText,
  });

  const afterSet = await appState(client, "TextEdit");
  const afterSetTextArea = textArea(afterSet);
  const selectText = await callOk(client, "select_text", {
    app: "TextEdit",
    element_index: String(afterSetTextArea.index),
    text: "beta",
  });
  const replacement = await callOk(client, "type_text", {
    app: "TextEdit",
    text: "BETA",
  });
  const afterReplacement = await appState(client, "TextEdit");

  const scrollArea = findNode(
    afterReplacement,
    (node) =>
      node.role === "AXScrollArea" &&
      (node.actions || []).includes("AXScrollDownByPage"),
    "TextEdit scrollable AXScrollArea",
  );
  const scroll = await callOk(client, "scroll", {
    app: "TextEdit",
    element_index: String(scrollArea.index),
    direction: "down",
    pages: 1,
  });

  const windowNode = findNode(
    afterReplacement,
    (node) => node.role === "AXWindow",
    "TextEdit AXWindow",
  );
  const secondaryAction = await callOk(client, "perform_secondary_action", {
    app: "TextEdit",
    element_index: String(windowNode.index),
    action: "AXRaise",
  });

  const dragState = await appState(client, "TextEdit");
  const dragTextArea = textArea(dragState);
  const from = screenshotPointForElement(dragState, dragTextArea, 0.1, 0.1);
  const to = screenshotPointForElement(dragState, dragTextArea, 0.55, 0.1);
  const drag = await callOk(client, "drag", {
    app: "TextEdit",
    from_x: from.x,
    from_y: from.y,
    to_x: to.x,
    to_y: to.y,
  });

  const finalState = await appState(client, "TextEdit");
  const finalText = textValue(finalState);
  return {
    fixture: "textedit-rich-actions",
    setup: [`open ${path.relative(process.cwd(), textEditFixturePath)}`],
    toolCalls: [
      "get_app_state",
      "click",
      "set_value",
      "select_text",
      "type_text",
      "scroll",
      "perform_secondary_action",
      "drag",
    ],
    expected: {
      textIncludes: ["alpha BETA gamma", "omega"],
      scrollStatus: "ok",
      secondaryActionStatus: "ok",
      dragStatus: "ok",
    },
    actual: {
      setValue,
      selectText,
      replacement,
      scroll,
      secondaryAction,
      drag,
      dragPoints: { from, to },
      finalTextPrefix: finalText.slice(0, 120),
      shape: normalizeStateShape(finalState),
    },
    cleanup: ["close TextEdit documents without saving"],
    diffs: [
      ...expectTrue(
        "text includes alpha BETA gamma",
        finalText.includes("alpha BETA gamma"),
        finalText.slice(0, 120),
      ),
      ...expectTrue(
        "text includes omega",
        finalText.includes("omega"),
        finalText.slice(-120),
      ),
      ...diffValue("scroll.ok", true, Boolean(scroll.ok)),
      ...diffValue("secondaryAction.ok", true, Boolean(secondaryAction.ok)),
      ...diffValue("drag.ok", true, Boolean(drag.ok)),
    ],
  };
}

async function chromeFrontWindowInfo() {
  const { stdout } = await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    'return ((count of tabs of front window) as string) & "|" & (URL of active tab of front window as string)',
    "-e",
    "end tell",
  ]);
  const [tabCount, activeUrl] = stdout.trim().split("|");
  return {
    activeUrl,
    tabCount: Number(tabCount),
  };
}

async function focusChromeFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    "activate",
    "-e",
    `set fixtureUrlPrefix to ${appleScriptString(chromeUrlPrefix)}`,
    "-e",
    "repeat with candidateWindow in windows",
    "-e",
    "if URL of active tab of candidateWindow starts with fixtureUrlPrefix then",
    "-e",
    "set index of candidateWindow to 1",
    "-e",
    "exit repeat",
    "-e",
    "end if",
    "-e",
    "end repeat",
    "-e",
    "end tell",
  ]);
  await sleep(250);
}

async function openChromeFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    "activate",
    "-e",
    `set fixtureUrlPrefix to ${appleScriptString(chromeUrlPrefix)}`,
    "-e",
    "repeat with windowIndex from (count of windows) to 1 by -1",
    "-e",
    "set candidateWindow to window windowIndex",
    "-e",
    "if URL of active tab of candidateWindow starts with fixtureUrlPrefix then close candidateWindow",
    "-e",
    "end repeat",
    "-e",
    "set fixtureWindow to make new window",
    "-e",
    `set URL of active tab of fixtureWindow to ${appleScriptString(chromeUrl)}`,
    "-e",
    "set active tab index of fixtureWindow to 1",
    "-e",
    "repeat with tabIndex from (count of tabs of fixtureWindow) to 2 by -1",
    "-e",
    "close tab tabIndex of fixtureWindow",
    "-e",
    "end repeat",
    "-e",
    "set index of fixtureWindow to 1",
    "-e",
    "end tell",
  ]);
  await focusChromeFixture();
  await sleep(1000);
}

async function cleanupChromeFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    `set fixtureUrlPrefix to ${appleScriptString(chromeUrlPrefix)}`,
    "-e",
    "repeat with windowIndex from (count of windows) to 1 by -1",
    "-e",
    "set candidateWindow to window windowIndex",
    "-e",
    "if URL of active tab of candidateWindow starts with fixtureUrlPrefix then close candidateWindow",
    "-e",
    "end repeat",
    "-e",
    "end tell",
  ]).catch(() => {});
}

async function chromeState(client) {
  await focusChromeFixture();
  return appState(client, "Google Chrome");
}

async function callChromeTool(client, toolName, args) {
  await focusChromeFixture();
  return client.callTool(toolName, {
    app: "Google Chrome",
    ...args,
  });
}

async function runChromeBrowserFixture(client) {
  await openChromeFixture();
  const initial = await chromeState(client);
  const initialShape = normalizeStateShape(initial);
  const webArea = findNode(
    initial,
    (node) =>
      node.role === "AXWebArea" &&
      String(node.title || "").includes("Computer Use Fixture Page"),
    "Chrome fixture web area",
  );
  const beforeClick = await chromeFrontWindowInfo();
  const browserFormText = "-m11";
  const typeIntoPage = parseToolText(
    await callChromeTool(client, "type_text", {
      text: browserFormText,
    }),
  );
  const submitPageForm = parseToolText(
    await callChromeTool(client, "press_key", {
      key: "Return",
    }),
  );
  await sleep(500);
  const afterFormInput = await chromeState(client);
  const newTabButton = findNode(
    afterFormInput,
    (node) =>
      node.role === "AXButton" &&
      ["新标签页", "New Tab"].some((label) =>
        String(node.description || node.title || "").includes(label),
      ),
    "Chrome new tab button",
  );
  const clickNewTab = parseToolText(
    await callChromeTool(client, "click", {
      element_index: String(newTabButton.index),
    }),
  );
  await sleep(300);
  const afterClick = await chromeFrontWindowInfo();

  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    "close active tab of front window",
    "-e",
    "end tell",
  ]);
  const restored = await chromeState(client);
  const scrollTarget = findNode(
    restored,
    (node) =>
      String(node.role || "").includes("WebArea") ||
      hasText({ tree: node }, "Scroll marker 20"),
    "Chrome scroll target",
  );
  const scroll = parseToolText(
    await callChromeTool(client, "scroll", {
      element_index: String(scrollTarget.index),
      direction: "down",
      pages: 1,
    }),
  );
  const finalState = await chromeState(client);

  return {
    fixture: "chrome-browser-page-actions",
    setup: ["open fixtures/Chrome/static-page/index.html"],
    toolCalls: ["get_app_state", "type_text", "press_key", "click", "scroll"],
    expected: {
      pageText: "Computer Use Fixture Page",
      submittedTitlePrefix: "Enter submitted:",
      bundleIdentifier: "com.google.Chrome",
      newTabCountDelta: 1,
      scrollStatus: "ok",
    },
    actual: {
      initialShape,
      fixtureWebAreaIndex: webArea.index,
      newTabButtonIndex: newTabButton.index,
      typeIntoPage,
      submitPageForm,
      titleAfterFormInput: normalizeChromePageTitle(
        afterFormInput.window?.title,
      ),
      clickNewTab,
      beforeClick: normalizeChromeFrontWindowInfo(beforeClick),
      afterClick: normalizeChromeFrontWindowInfo(afterClick),
      scroll,
      finalShape: normalizeStateShape(finalState),
    },
    cleanup: ["close Chrome fixture window"],
    diffs: [
      ...diffValue(
        "initialShape.bundleIdentifier",
        "com.google.Chrome",
        initialShape.bundleIdentifier,
      ),
      ...expectTrue(
        "initial page has fixture text",
        hasText(initial, "Computer Use Fixture Page"),
        stateTextCorpus(initial).slice(0, 20),
      ),
      ...expectTrue(
        "form submission updates title",
        String(afterFormInput.window?.title || "").includes(
          "Enter submitted:",
        ) &&
          String(afterFormInput.window?.title || "").includes(browserFormText),
        afterFormInput.window?.title || "",
      ),
      ...expectTrue(
        "new tab count increments",
        afterClick.tabCount === beforeClick.tabCount + 1,
        { beforeClick, afterClick },
      ),
      ...expectTrue(
        "new tab is active",
        afterClick.activeUrl.startsWith("chrome://newtab"),
        afterClick.activeUrl,
      ),
      ...diffValue("scroll.ok", true, Boolean(scroll.ok)),
    ],
  };
}

async function cleanupFinderFixture() {
  await execFile("osascript", [
    "-e",
    'tell application "Finder"',
    "-e",
    `set fixturePath to POSIX file ${appleScriptString(finderDir)} as alias`,
    "-e",
    "repeat with candidateWindow in windows",
    "-e",
    "try",
    "-e",
    "if target of candidateWindow is fixturePath then close candidateWindow",
    "-e",
    "end try",
    "-e",
    "end repeat",
    "-e",
    "end tell",
  ]).catch(() => {});
}

async function runFinderFixture(client) {
  await execFile("open", [finderDir]);
  await sleep(1000);
  const initial = await appState(client, "Finder");
  const shape = normalizeStateShape(initial);
  const item = findNode(
    initial,
    (node) => String(node.value || node.title || "").includes("notes.md"),
    "Finder notes.md row",
  );
  const clickItem = await callOk(client, "click", {
    app: "Finder",
    element_index: String(item.index),
  });
  const pointA = screenshotPointForElement(initial, item, 0.2, 0.5);
  const pointB = { x: pointA.x + 12, y: pointA.y };
  const drag = await callOk(client, "drag", {
    app: "Finder",
    from_x: pointA.x,
    from_y: pointA.y,
    to_x: pointB.x,
    to_y: pointB.y,
  });
  const badElement = normalizeToolError(
    await client.callTool("click", {
      app: "Finder",
      element_index: "999999",
    }),
  );

  return {
    fixture: "finder-project-list-actions",
    setup: [`open ${path.relative(process.cwd(), finderDir)}`],
    toolCalls: ["get_app_state", "click", "drag"],
    expected: {
      bundleIdentifier: "com.apple.finder",
      itemText: "notes.md",
      badElementCode: "element_not_found",
    },
    actual: {
      shape,
      itemIndex: item.index,
      clickItem,
      drag,
      dragPoints: { from: pointA, to: pointB },
      badElement,
    },
    cleanup: ["close Finder fixture window"],
    diffs: [
      ...diffValue(
        "shape.bundleIdentifier",
        "com.apple.finder",
        shape.bundleIdentifier,
      ),
      ...expectTrue(
        "state contains notes.md",
        hasText(initial, "notes.md"),
        stateTextCorpus(initial).slice(0, 30),
      ),
      ...diffValue("clickItem.ok", true, Boolean(clickItem.ok)),
      ...diffValue("drag.ok", true, Boolean(drag.ok)),
      ...diffValue("badElement.code", "element_not_found", badElement.code),
    ],
  };
}

async function runStateAndPolicyFixture(client) {
  const toolsList = await client.request("tools/list", {});
  const toolNames = (toolsList.result?.tools || [])
    .map((tool) => tool.name)
    .sort((a, b) => a.localeCompare(b));
  const listAppsResult = await callOk(client, "list_apps", {});
  const listedApps = Array.isArray(listAppsResult)
    ? listAppsResult
    : listAppsResult.apps;
  const missingApp = normalizeToolError(
    await client.callTool("get_app_state", { app: missingAppName }),
  );
  const deniedApp = normalizeToolError(
    await client.callTool("get_app_state", { app: "Terminal" }),
  );
  const missingClickTarget = normalizeToolError(
    await client.callTool("click", { app: "Calculator" }),
  );

  const expectedTools = [
    "click",
    "drag",
    "get_app_state",
    "list_apps",
    "perform_secondary_action",
    "press_key",
    "scroll",
    "select_text",
    "set_value",
    "type_text",
  ].sort((a, b) => a.localeCompare(b));

  return {
    fixture: "tool-catalog-and-policy-errors",
    setup: ["start local MCP server"],
    toolCalls: ["tools/list", "list_apps", "get_app_state", "click"],
    expected: {
      toolNames: expectedTools,
      missingAppCode: "invalid_app",
      deniedAppCode: "app_denied",
      missingClickTargetCode: "missing_click_target",
    },
    actual: {
      toolNames,
      listedAppCount: Array.isArray(listedApps) ? listedApps.length : null,
      missingApp,
      deniedApp,
      missingClickTarget,
    },
    cleanup: [],
    diffs: [
      ...diffValue("toolNames", expectedTools, toolNames),
      ...expectTrue(
        "list_apps returns array",
        Array.isArray(listedApps),
        typeof listAppsResult,
      ),
      ...diffValue("missingApp.code", "invalid_app", missingApp.code),
      ...diffValue("deniedApp.code", "app_denied", deniedApp.code),
      ...diffValue(
        "missingClickTarget.code",
        "missing_click_target",
        missingClickTarget.code,
      ),
    ],
  };
}

async function runFixture(name, fn, cleanup = async () => {}) {
  const startedAt = new Date().toISOString();
  try {
    const fixture = await fn();
    return {
      ...fixture,
      status: fixture.diffs.length === 0 ? "passed" : "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      fixture: name,
      status: "error",
      setup: [],
      toolCalls: [],
      expected: {},
      actual: {
        error: error.stack || error.message,
      },
      cleanup: [],
      diffs: [
        {
          path: "exception",
          expected: "no exception",
          actual: error.message,
        },
      ],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    await cleanup();
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
  });

  const fixtures = [];
  try {
    await client.initialize({
      name: "local-computer-use-m11-fixture-suite",
      version: "0.1.0",
    });

    fixtures.push(
      await runFixture("tool-catalog-and-policy-errors", () =>
        runStateAndPolicyFixture(client),
      ),
    );
    fixtures.push(
      await runFixture("calculator-arithmetic-click", () =>
        runCalculatorArithmeticFixture(client),
      ),
    );
    fixtures.push(
      await runFixture(
        "textedit-keyboard-editing",
        () => runTextEditKeyboardFixture(client),
        cleanupTextEditFixture,
      ),
    );
    fixtures.push(
      await runFixture(
        "textedit-rich-actions",
        () => runTextEditActionFixture(client),
        cleanupTextEditFixture,
      ),
    );
    fixtures.push(
      await runFixture(
        "chrome-browser-page-actions",
        () => runChromeBrowserFixture(client),
        cleanupChromeFixture,
      ),
    );
    fixtures.push(
      await runFixture(
        "finder-project-list-actions",
        () => runFinderFixture(client),
        cleanupFinderFixture,
      ),
    );

    const summary = summarize(fixtures);
    const report = {
      generatedAt: new Date().toISOString(),
      milestone: "M11",
      backend: "local",
      scope: "automated core fixture suite",
      coverage: {
        automatedTools: [
          "click",
          "drag",
          "get_app_state",
          "list_apps",
          "perform_secondary_action",
          "press_key",
          "scroll",
          "select_text",
          "set_value",
          "type_text",
        ],
        automatedApps: ["Calculator", "TextEdit", "Google Chrome", "Finder"],
        manualOrDeferredApps: ["modal-dialog", "missing-permission"],
      },
      summary,
      fixtures,
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!summary.ok) {
      throw new Error(
        `M11 fixture suite failed: ${JSON.stringify(summary.diffs)}`,
      );
    }
    console.log("Local MCP M11 fixture test suite passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
