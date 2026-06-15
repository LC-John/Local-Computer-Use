#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalMcpClient,
  defaultReportsDir,
  parseToolError,
  parseToolText,
} from "./lib/local-mcp-client.mjs";
import {
  evaluateAppPolicy,
  loadAppPolicy,
  permissionErrorForTool,
  evaluateApproval,
  evaluateApprovalWithPrompt,
} from "../src/policy.mjs";

const outDir = defaultReportsDir;
const buildDir = path.resolve(".build");
const policyPath = path.join(buildDir, "m9-app-policy.toml");
const promptPolicyPath = path.join(buildDir, "m9-prompt-policy.toml");
const nativePromptPolicyPath = path.join(
  buildDir,
  "m9-native-prompt-policy.toml",
);
const approvalStorePath = path.join(buildDir, "m9-approvals.json");
const promptApprovalStorePath = path.join(buildDir, "m9-prompt-approvals.json");
const nativePromptApprovalStorePath = path.join(
  buildDir,
  "m9-native-prompt-approvals.json",
);
const jsonReportPath = path.join(outDir, "m9-policy-probe.json");
const jsonlReportPath = path.join(outDir, "m9-policy-probe.jsonl");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectError(response, code) {
  const error = parseToolError(response);
  assert(
    error.meta["local-computer-use/errorCode"] === code,
    `Expected ${code}, got ${JSON.stringify(error)}`,
  );
  return error;
}

async function main() {
  await mkdir(buildDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await rm(approvalStorePath, { force: true });
  await rm(promptApprovalStorePath, { force: true });
  await rm(nativePromptApprovalStorePath, { force: true });
  await writeFile(
    policyPath,
    `[apps]
allowed = ["Calculator"]
denied = ["Terminal", "Codex", "com.apple.Terminal", "com.googlecode.iterm2"]

[approvals]
mode = "store"
store_path = "${approvalStorePath}"
require_for_read = false
require_for_actions = true
auto_approve_allowed = true

[permissions]
require_accessibility = true
require_screen_recording_for_state = true
`,
  );
  await writeFile(
    promptPolicyPath,
    `[apps]
allowed = ["Calculator"]
denied = ["Terminal", "Codex"]

[approvals]
mode = "prompt"
store_path = "${promptApprovalStorePath}"
require_for_read = false
require_for_actions = true
auto_approve_allowed = false

[permissions]
require_accessibility = true
require_screen_recording_for_state = true
`,
  );
  await writeFile(
    nativePromptPolicyPath,
    `[apps]
allowed = ["Calculator"]
denied = ["Terminal", "Codex"]

[approvals]
mode = "native_prompt"
store_path = "${nativePromptApprovalStorePath}"
require_for_read = false
require_for_actions = true
auto_approve_allowed = false
native_prompt_timeout_seconds = 1

[permissions]
require_accessibility = true
require_screen_recording_for_state = true
`,
  );

  const loadedPolicy = await loadAppPolicy({ policyPath });
  const calculatorIdentity = {
    query: "Calculator",
    name: "Calculator",
    bundleIdentifier: "com.apple.calculator",
    path: "/System/Applications/Calculator.app",
  };
  assert(
    evaluateAppPolicy(loadedPolicy, "Terminal").code === "app_denied",
    "Expected Terminal to be denied by policy",
  );
  assert(
    evaluateAppPolicy(loadedPolicy, {
      query: "iTerm",
      name: "iTerm2",
      bundleIdentifier: "com.googlecode.iterm2",
      path: "/Applications/iTerm.app",
    }).code === "app_denied",
    "Expected bundle-id identity to be denied by policy",
  );
  assert(
    evaluateAppPolicy(loadedPolicy, "TextEdit").code === "app_not_allowed",
    "Expected TextEdit to be blocked by strict allowlist",
  );
  assert(
    evaluateAppPolicy(loadedPolicy, "Calculator").ok,
    "Expected Calculator to be allowed",
  );
  assert(
    permissionErrorForTool(
      loadedPolicy,
      {
        accessibility: { granted: false },
        screenRecording: { granted: true },
      },
      "click",
      { app: "Calculator", element_index: "1" },
    ).code === "accessibility_permission_missing",
    "Expected accessibility permission error",
  );
  assert(
    permissionErrorForTool(
      loadedPolicy,
      {
        accessibility: { granted: true },
        screenRecording: { granted: false },
      },
      "click",
      { app: "Calculator", x: 10, y: 10 },
    ).code === "screen_recording_permission_missing",
    "Expected coordinate click to require Screen Recording",
  );
  assert(
    (await evaluateApproval(loadedPolicy, calculatorIdentity, "get_app_state"))
      .ok,
    "Expected read calls to skip approval by default",
  );
  const storedApproval = await evaluateApproval(
    loadedPolicy,
    calculatorIdentity,
    "click",
  );
  assert(
    storedApproval.ok,
    "Expected store mode to auto-approve allowed action",
  );
  const approvalStore = JSON.parse(await readFile(approvalStorePath, "utf8"));
  assert(
    approvalStore.approvals["com.apple.calculator"]?.scope === "actions",
    "Expected approval store to persist Calculator action approval",
  );
  const promptPolicy = await loadAppPolicy({ policyPath: promptPolicyPath });
  const promptApproval = await evaluateApproval(
    promptPolicy,
    calculatorIdentity,
    "click",
  );
  assert(
    promptApproval.code === "approval_required",
    "Expected prompt mode to require explicit approval",
  );
  const nativePromptPolicy = await loadAppPolicy({
    policyPath: nativePromptPolicyPath,
  });
  const nativePromptApproval = await evaluateApprovalWithPrompt(
    nativePromptPolicy,
    calculatorIdentity,
    "click",
    {
      nativePrompt: async () => ({ ok: true }),
    },
  );
  assert(
    nativePromptApproval.ok,
    "Expected native prompt approval to grant action approval",
  );
  const nativePromptStore = JSON.parse(
    await readFile(nativePromptApprovalStorePath, "utf8"),
  );
  assert(
    nativePromptStore.approvals["com.apple.calculator"]?.source ===
      "native_gui_prompt",
    "Expected native prompt approval to be persisted",
  );
  await rm(nativePromptApprovalStorePath, { force: true });
  const nativePromptDenied = await evaluateApprovalWithPrompt(
    nativePromptPolicy,
    calculatorIdentity,
    "click",
    {
      nativePrompt: async () => ({
        ok: false,
        code: "approval_denied",
        message: "Native approval denied for Calculator",
      }),
    },
  );
  assert(
    nativePromptDenied.code === "approval_denied",
    "Expected native prompt denial to block approval",
  );

  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APP_POLICY: policyPath,
    },
  });

  const report = {
    policyPath,
    directPolicyChecks: {
      terminalDenied: true,
      bundleIdentityDenied: true,
      textEditNotAllowed: true,
      calculatorAllowed: true,
      approvalStore: true,
      promptModeRequiresApproval: true,
      nativePromptApproval: true,
      nativePromptDenied: true,
      permissionErrors: true,
    },
    toolChecks: {},
  };

  try {
    await client.initialize({
      name: "local-computer-use-m9-policy-probe",
      version: "0.1.0",
    });

    const listApps = await client.callTool("list_apps", {});
    assert(
      !listApps.result?.isError,
      "Expected list_apps to bypass app policy",
    );
    report.toolChecks.listApps = "passed";

    const terminalState = await client.callTool("get_app_state", {
      app: "Terminal",
    });
    report.toolChecks.terminalDenied = expectError(terminalState, "app_denied");

    const textEditState = await client.callTool("get_app_state", {
      app: "TextEdit",
    });
    report.toolChecks.textEditNotAllowed = expectError(
      textEditState,
      "app_not_allowed",
    );

    const deniedClick = await client.callTool("click", {
      app: "Terminal",
      element_index: "1",
    });
    report.toolChecks.deniedClick = expectError(deniedClick, "app_denied");

    const bundleDenied = await client.callTool("get_app_state", {
      app: "com.apple.Terminal",
    });
    report.toolChecks.bundleDenied = expectError(bundleDenied, "app_denied");

    const calculatorState = await client.callTool("get_app_state", {
      app: "Calculator",
    });
    const parsedState = parseToolText(calculatorState);
    assert(
      parsedState.app?.name,
      "Expected allowed Calculator state to return app metadata",
    );
    assert(
      parsedState.tree,
      "Expected allowed Calculator state to return AX tree",
    );
    assert(
      parsedState.screenshot?.status === "captured",
      `Expected allowed Calculator state to capture screenshot: ${JSON.stringify(
        parsedState.screenshot,
      )}`,
    );
    report.toolChecks.calculatorState = {
      app: parsedState.app.name,
      bundleIdentifier: parsedState.app.bundleIdentifier,
      screenshot: parsedState.screenshot.status,
    };
    report.approvalStore = JSON.parse(
      await readFile(approvalStorePath, "utf8"),
    );

    await writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log("Local MCP M9 policy and permission probe passed.");
  } finally {
    await client.close({ jsonlPath: jsonlReportPath });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
