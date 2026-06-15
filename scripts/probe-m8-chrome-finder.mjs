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
const chromeUrlPrefix = `file://${path.resolve("fixtures/Chrome/static-page/index.html")}`;
const chromeUrl = `${chromeUrlPrefix}?m8=${Date.now()}`;
const finderDir = path.resolve("fixtures/Finder/project-list");
const reportPath = path.join(outDir, "m8-chrome-finder-probe.json");
const jsonlPath = path.join(outDir, "m8-chrome-finder-probe.jsonl");

function appleScriptString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function findNode(state, predicate, label) {
  let found = null;
  walkTree(state.tree, (node) => {
    if (!found && predicate(node)) found = node;
  });
  if (!found) throw new Error(`${label} not found`);
  return found;
}

function hasText(state, text) {
  let found = false;
  walkTree(state.tree, (node) => {
    const values = [node.title, node.description, node.identifier, node.value]
      .filter((value) => value !== undefined && value !== null)
      .map(String);
    if (values.some((value) => value.includes(text))) found = true;
  });
  return found;
}

function screenshotPointForElement(
  state,
  element,
  horizontalFraction = 0.5,
  verticalFraction = 0.5,
) {
  const position = element.position;
  const size = element.size;
  for (const [name, value] of Object.entries({ position, size })) {
    if (!value || typeof value !== "object")
      throw new Error(`Missing ${name} metadata`);
  }
  return screenshotPointForGlobal(state, {
    x: position.x + size.width * horizontalFraction,
    y: position.y + size.height * verticalFraction,
  });
}

function screenshotPointForGlobal(state, point) {
  const screenshot = state.screenshot;
  const frame = screenshot.windowFrame;
  const scale = screenshot.displayScale;
  const origin = screenshot.imageContentOrigin || {};
  for (const [name, value] of Object.entries({
    screenshot,
    frame,
    scale,
    point,
  })) {
    if (!value || typeof value !== "object")
      throw new Error(`Missing ${name} metadata`);
  }
  return {
    x: (point.x - frame.x) * scale.x + (origin.x || 0),
    y: (point.y - frame.y) * scale.y + (origin.y || 0),
  };
}

async function appState(client, app) {
  return parseToolText(await client.callTool("get_app_state", { app }));
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
  await new Promise((resolve) => setTimeout(resolve, 200));
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

async function runChrome(client) {
  await openChromeFixture();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const initial = await chromeState(client);
  if (!hasText(initial, "Computer Use Fixture Page")) {
    throw new Error("Chrome did not open the deterministic fixture page");
  }

  const webArea = findNode(
    initial,
    (node) =>
      node.role === "AXWebArea" &&
      String(node.title || "").includes("Computer Use Fixture Page"),
    "Chrome fixture web area",
  );

  const beforeClick = await chromeFrontWindowInfo();
  const newTabButton = findNode(
    initial,
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
  const afterClick = await chromeFrontWindowInfo();
  if (
    afterClick.tabCount !== beforeClick.tabCount + 1 ||
    !afterClick.activeUrl.startsWith("chrome://newtab")
  ) {
    throw new Error(
      `Chrome new-tab click did not open a tab: ${JSON.stringify({ beforeClick, afterClick })}`,
    );
  }

  await execFile("osascript", [
    "-e",
    'tell application "Google Chrome"',
    "-e",
    "close active tab of front window",
    "-e",
    "end tell",
  ]);
  const afterRestore = await chromeState(client);
  const html = findNode(
    afterRestore,
    (node) =>
      String(node.role || "").includes("WebArea") ||
      String(node.role || "").includes("Group") ||
      hasText({ tree: node }, "Scroll marker 20"),
    "Chrome scroll target",
  );
  const scroll = parseToolText(
    await callChromeTool(client, "scroll", {
      element_index: String(html.index),
      direction: "down",
      pages: 1,
    }),
  );

  return {
    clickNewTab,
    tabCountAfterClick: afterClick.tabCount,
    tabCountBeforeClick: beforeClick.tabCount,
    fixtureWebAreaIndex: webArea.index,
    scroll,
  };
}

async function runFinder(client) {
  await execFile("open", [finderDir]);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const initial = await appState(client, "Finder");
  const item = findNode(
    initial,
    (node) => String(node.value || node.title || "").includes("notes.md"),
    "Finder notes.md row",
  );
  const clickItem = parseToolText(
    await client.callTool("click", {
      app: "Finder",
      element_index: String(item.index),
    }),
  );

  const pointA = screenshotPointForElement(initial, item, 0.2, 0.5);
  const pointB = { x: pointA.x + 12, y: pointA.y };
  const drag = parseToolText(
    await client.callTool("drag", {
      app: "Finder",
      from_x: pointA.x,
      from_y: pointA.y,
      to_x: pointB.x,
      to_y: pointB.y,
    }),
  );

  const badElement = parseToolError(
    await client.callTool("click", {
      app: "Finder",
      element_index: "999999",
    }),
  );
  if (badElement.meta["local-computer-use/errorCode"] !== "element_not_found") {
    throw new Error(
      `Unexpected Finder bad element error: ${JSON.stringify(badElement)}`,
    );
  }

  return {
    badElement,
    clickItem,
    drag,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const client = createLocalMcpClient();
  try {
    await client.initialize({
      name: "local-computer-use-m8-chrome-finder-probe",
      version: "0.1.0",
    });

    const report = {
      chrome: await runChrome(client),
      finder: await runFinder(client),
    };

    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log("Local MCP M8 Chrome/Finder acceptance probe passed.");
  } finally {
    await client.close({ jsonlPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
