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
} from "./lib/local-mcp-client.mjs";
import { loadAppPolicy, permissionErrorForTool } from "../src/policy.mjs";

const execFile = promisify(execFileCallback);
const outDir = defaultReportsDir;
const reportPath = path.join(outDir, "m13-negative-tests.json");
const jsonlPath = path.join(outDir, "m13-negative-tests.jsonl");
const approvalJsonlPath = path.join(outDir, "m13-approval-required.jsonl");

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

function normalizeToolError(response) {
  const error = parseToolError(response);
  return {
    isError: true,
    text: error.text,
    code: error.meta["local-computer-use/errorCode"] || null,
    severity: error.meta["local-computer-use/errorSeverity"] || null,
    retryable: error.meta["local-computer-use/retryable"] ?? null,
    recoveryHint: error.meta["local-computer-use/recoveryHint"] || null,
    status: error.meta["local-computer-use/status"] || null,
    tool: error.meta.tool || null,
  };
}

function normalizeJsonRpcError(response) {
  return {
    hasError: Boolean(response.error),
    rpcCode: response.error?.code || null,
    message: response.error?.message || null,
    code: response.error?.data?.["local-computer-use/errorCode"] || null,
    severity:
      response.error?.data?.["local-computer-use/errorSeverity"] || null,
    retryable: response.error?.data?.["local-computer-use/retryable"] ?? null,
    recoveryHint:
      response.error?.data?.["local-computer-use/recoveryHint"] || null,
  };
}

function errorExpectation(pathPrefix, actual, expected) {
  if (Array.isArray(expected.code) && expected.code.includes(actual.code)) {
    return [
      ...diffValue(`${pathPrefix}.severity`, expected.severity, actual.severity),
      ...diffValue(
        `${pathPrefix}.retryable`,
        expected.retryable,
        actual.retryable,
      ),
      ...expectTrue(
        `${pathPrefix}.recoveryHint present`,
        typeof actual.recoveryHint === "string" && actual.recoveryHint.length > 0,
        actual.recoveryHint,
      ),
    ];
  }
  return [
    ...diffValue(`${pathPrefix}.code`, expected.code, actual.code),
    ...diffValue(`${pathPrefix}.severity`, expected.severity, actual.severity),
    ...diffValue(
      `${pathPrefix}.retryable`,
      expected.retryable,
      actual.retryable,
    ),
    ...expectTrue(
      `${pathPrefix}.recoveryHint present`,
      typeof actual.recoveryHint === "string" && actual.recoveryHint.length > 0,
      actual.recoveryHint,
    ),
  ];
}

async function callOk(client, tool, args) {
  return parseToolText(await client.callTool(tool, args));
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

async function runProtocolErrorFixture() {
  const client = createLocalMcpClient();
  try {
    const uninitialized = normalizeJsonRpcError(
      await client.request("tools/list", {}),
    );

    await client.initialize({
      name: "local-computer-use-m13-negative-tests",
      version: "0.1.0",
    });

    const unknownTool = normalizeToolError(
      await client.callTool("__missing_tool_for_m13__", {}),
    );
    const missingRequired = normalizeToolError(
      await client.callTool("get_app_state", {}),
    );
    const nonObjectArguments = normalizeToolError(
      await client.request("tools/call", {
        name: "get_app_state",
        arguments: "bad",
      }),
    );
    const invalidType = normalizeToolError(
      await client.callTool("get_app_state", { app: 12345 }),
    );
    const unexpectedArgument = normalizeToolError(
      await client.callTool("list_apps", {
        __computer_use_probe_invalid_argument__: true,
      }),
    );
    const invalidEnum = normalizeToolError(
      await client.callTool("click", {
        app: "Calculator",
        mouse_button: "invalid",
      }),
    );

    return {
      fixture: "protocol-and-schema-errors",
      setup: ["start local MCP server"],
      toolCalls: ["tools/list", "tools/call"],
      expected: {
        uninitializedCode: "server_not_initialized",
        unknownToolCode: "unknown_tool",
        missingRequiredCode: "missing_required_argument",
        nonObjectCode: "invalid_arguments",
        invalidTypeCode: "invalid_argument_type",
        unexpectedArgumentCode: "unexpected_argument",
        invalidEnumCode: "invalid_argument_value",
      },
      actual: {
        uninitialized,
        unknownTool,
        missingRequired,
        nonObjectArguments,
        invalidType,
        unexpectedArgument,
        invalidEnum,
      },
      cleanup: [],
      diffs: [
        ...diffValue("uninitialized.rpcCode", -32002, uninitialized.rpcCode),
        ...errorExpectation("uninitialized", uninitialized, {
          code: "server_not_initialized",
          severity: "recoverable",
          retryable: true,
        }),
        ...errorExpectation("unknownTool", unknownTool, {
          code: "unknown_tool",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("missingRequired", missingRequired, {
          code: "missing_required_argument",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("nonObjectArguments", nonObjectArguments, {
          code: "invalid_arguments",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("invalidType", invalidType, {
          code: "invalid_argument_type",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("unexpectedArgument", unexpectedArgument, {
          code: "unexpected_argument",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("invalidEnum", invalidEnum, {
          code: "invalid_argument_value",
          severity: "fatal",
          retryable: false,
        }),
      ],
    };
  } finally {
    await client.close({ jsonlPath });
  }
}

async function runApprovalRequiredFixture() {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APPROVAL_MODE: "prompt",
      LOCAL_CUA_APPROVAL_STORE: path.resolve(".build/m13-approval-store.json"),
    },
  });
  try {
    await client.initialize({
      name: "local-computer-use-m13-approval-required",
      version: "0.1.0",
    });

    const approvalRequired = normalizeToolError(
      await client.callTool("click", {
        app: "Calculator",
        element_index: "0",
      }),
    );

    return {
      fixture: "approval-required",
      setup: ["start local MCP server with LOCAL_CUA_APPROVAL_MODE=prompt"],
      toolCalls: ["click"],
      expected: {
        approvalRequiredCode: "approval_required",
      },
      actual: {
        approvalRequired,
      },
      cleanup: [],
      diffs: errorExpectation("approvalRequired", approvalRequired, {
        code: "approval_required",
        severity: "recoverable",
        retryable: true,
      }),
    };
  } finally {
    await client.close({ jsonlPath: approvalJsonlPath });
  }
}

async function runPermissionClassificationFixture() {
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
    fixture: "permission-classification",
    setup: ["evaluate synthetic permission states"],
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
    cleanup: [],
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

async function runActionEdgeErrorFixture() {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
  });
  try {
    await client.initialize({
      name: "local-computer-use-m13-action-edge-errors",
      version: "0.1.0",
    });

    const state = await callOk(client, "get_app_state", { app: "Calculator" });
    const invalidElement = normalizeToolError(
      await client.callTool("click", {
        app: "Calculator",
        element_index: "999999",
      }),
    );
    const unsupportedAction = normalizeToolError(
      await client.callTool("perform_secondary_action", {
        app: "Calculator",
        element_index: "0",
        action: "__missing_action_for_m13__",
      }),
    );
    const unsupportedDirection = normalizeToolError(
      await client.callTool("scroll", {
        app: "Calculator",
        element_index: "0",
        direction: "diagonal",
      }),
    );
    const unsupportedKey = normalizeToolError(
      await client.callTool("press_key", {
        app: "Calculator",
        key: "__missing_key_for_m13__",
      }),
    );
    const coordinateMapping = normalizeToolError(
      await client.callTool("click", {
        app: "Calculator",
        x: -1_000_000,
        y: -1_000_000,
      }),
    );
    const refreshed = await callOk(client, "get_app_state", {
      app: "Calculator",
    });

    return {
      fixture: "action-edge-errors-and-refresh",
      setup: ["focus Calculator through get_app_state"],
      toolCalls: [
        "get_app_state",
        "click",
        "perform_secondary_action",
        "scroll",
        "press_key",
      ],
      expected: {
        invalidElementCode: "element_not_found",
        unsupportedActionCode: "unsupported_action",
        unsupportedDirectionCode: "unsupported_direction",
        unsupportedKeyCode: "unsupported_key",
        coordinateMappingCode: "coordinate_mapping_failed",
        refreshOk: true,
      },
      actual: {
        initialApp: state.app,
        invalidElement,
        unsupportedAction,
        unsupportedDirection,
        unsupportedKey,
        coordinateMapping,
        refreshedApp: refreshed.app,
        refreshedScreenshotStatus: refreshed.screenshot?.status || null,
      },
      cleanup: [],
      diffs: [
        ...errorExpectation("invalidElement", invalidElement, {
          code: "element_not_found",
          severity: "recoverable",
          retryable: true,
        }),
        ...errorExpectation("unsupportedAction", unsupportedAction, {
          code: "unsupported_action",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("unsupportedDirection", unsupportedDirection, {
          code: "unsupported_direction",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("unsupportedKey", unsupportedKey, {
          code: "unsupported_key",
          severity: "fatal",
          retryable: false,
        }),
        ...errorExpectation("coordinateMapping", coordinateMapping, {
          code: "coordinate_mapping_failed",
          severity: "recoverable",
          retryable: true,
        }),
        ...diffValue(
          "refreshed.bundleIdentifier",
          "com.apple.calculator",
          refreshed.app?.bundleIdentifier,
        ),
        ...diffValue(
          "refreshed.screenshot.status",
          "captured",
          refreshed.screenshot?.status,
        ),
      ],
    };
  } finally {
    await client.close();
  }
}

async function runAppCloseRecoveryFixture() {
  const client = createLocalMcpClient({
    env: {
      LOCAL_CUA_APPROVAL_MODE: "store",
    },
  });
  try {
    await client.initialize({
      name: "local-computer-use-m13-app-close-recovery",
      version: "0.1.0",
    });

    await execFile("open", ["-a", "TextEdit"]);
    const beforeClose = await callOk(client, "get_app_state", {
      app: "TextEdit",
    });
    await execFile("osascript", [
      "-e",
      'tell application "TextEdit" to quit saving no',
    ]).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 500));

    const afterCloseError = normalizeToolError(
      await client.callTool("click", {
        app: "TextEdit",
        element_index: "999999",
      }),
    );
    const calculatorRefresh = await callOk(client, "get_app_state", {
      app: "Calculator",
    });

    return {
      fixture: "app-close-recovery",
      setup: ["open TextEdit", "capture state", "quit TextEdit"],
      toolCalls: ["get_app_state", "click"],
      expected: {
        afterCloseCode: "element_not_found or stale_element_index",
        calculatorRefreshOk: true,
      },
      actual: {
        beforeCloseApp: beforeClose.app,
        afterCloseError,
        calculatorRefreshApp: calculatorRefresh.app,
      },
      cleanup: ["quit TextEdit without saving"],
      diffs: [
        ...errorExpectation("afterCloseError", afterCloseError, {
          code: ["element_not_found", "stale_element_index"],
          severity: "recoverable",
          retryable: true,
        }),
        ...diffValue(
          "calculatorRefresh.bundleIdentifier",
          "com.apple.calculator",
          calculatorRefresh.app?.bundleIdentifier,
        ),
      ],
    };
  } finally {
    await execFile("osascript", [
      "-e",
      'tell application "TextEdit" to quit saving no',
    ]).catch(() => {});
    await client.close();
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const fixtures = [];
  fixtures.push(
    await runFixture("protocol-and-schema-errors", runProtocolErrorFixture),
  );
  fixtures.push(
    await runFixture("approval-required", runApprovalRequiredFixture),
  );
  fixtures.push(
    await runFixture(
      "permission-classification",
      runPermissionClassificationFixture,
    ),
  );
  fixtures.push(
    await runFixture(
      "action-edge-errors-and-refresh",
      runActionEdgeErrorFixture,
    ),
  );
  fixtures.push(
    await runFixture("app-close-recovery", runAppCloseRecoveryFixture),
  );

  const summary = summarize(fixtures);
  const report = {
    generatedAt: new Date().toISOString(),
    milestone: "M13",
    backend: "local",
    scope: "negative error semantics and recoverability",
    coverage: {
      protocolErrors: [
        "server_not_initialized",
        "unknown_tool",
        "missing_required_argument",
        "invalid_arguments",
        "invalid_argument_type",
        "unexpected_argument",
        "invalid_argument_value",
      ],
      policyAndPermissionErrors: [
        "approval_required",
        "accessibility_permission_missing",
        "screen_recording_permission_missing",
      ],
      actionErrors: [
        "element_not_found",
        "unsupported_action",
        "unsupported_direction",
        "unsupported_key",
        "coordinate_mapping_failed",
      ],
      interruptedWorkflowChecks: ["app-close-recovery"],
    },
    summary,
    fixtures,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!summary.ok) {
    throw new Error(
      `M13 negative test suite failed: ${JSON.stringify(summary.diffs)}`,
    );
  }
  console.log("Local MCP M13 negative error suite passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
