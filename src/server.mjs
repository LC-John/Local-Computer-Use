#!/usr/bin/env node

import {
  click,
  checkPermissions,
  drag,
  getAppIdentity,
  getAppState,
  listApps,
  notImplemented,
  performSecondaryAction,
  pressKey,
  scroll,
  selectText,
  setValue,
  typeText,
} from "./mac-adapter.mjs";
import {
  evaluateApproval,
  evaluateAppPolicy,
  loadAppPolicy,
  permissionErrorForTool,
} from "./policy.mjs";
import {
  findTool,
  loadNativeToolCatalog,
  validateArgumentShape,
  validateRequiredArguments,
} from "./tools/catalog.mjs";

const serverInfo = {
  name: "Local Computer Use",
  version: "0.1.0",
};

let initialized = false;
let tools = [];
let appPolicy = null;

async function loadTools() {
  tools = await loadNativeToolCatalog();
  appPolicy = await loadAppPolicy();
}

function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const errorRecovery = {
  accessibility_permission_denied:
    "Grant Accessibility permission, then retry after refreshing app state.",
  accessibility_permission_missing:
    "Grant Accessibility permission, then retry after refreshing app state.",
  app_denied:
    "Choose a different app or update the local policy intentionally.",
  app_not_allowed:
    "Add the app to the allowlist or remove the strict allowlist for this test.",
  approval_denied: "Approve the app explicitly before retrying action tools.",
  approval_required:
    "Run the approval flow or switch to an approved app before retrying.",
  click_failed: "Refresh app state and retry the action on a current element.",
  coordinate_mapping_failed:
    "Refresh app state and use coordinates from the latest screenshot.",
  element_not_found:
    "Refresh app state and retry with an element index from the latest tree.",
  helper_failed:
    "Inspect helper stderr/stdout and retry after confirming macOS permissions.",
  helper_stderr:
    "Inspect helper stderr and retry after confirming the local helper can run.",
  helper_timeout:
    "Retry after closing modal dialogs or reducing app state complexity.",
  invalid_app:
    "Use list_apps to find a running app name or bundle identifier, then retry.",
  invalid_argument_type:
    "Fix the argument type to match the tool schema before retrying.",
  invalid_argument_value:
    "Use one of the schema-supported argument values before retrying.",
  invalid_arguments:
    "Send a JSON object matching the tool schema before retrying.",
  missing_arguments: "Send all required action arguments before retrying.",
  missing_click_target:
    "Pass either element_index or both x and y screenshot coordinates.",
  missing_element_index:
    "Refresh app state and pass an element index from the current tree.",
  missing_required_argument:
    "Add the missing required argument before retrying.",
  screen_recording_permission_missing:
    "Grant Screen Recording permission, then retry state or coordinate-based actions.",
  screenshot_capture_failed:
    "Grant Screen Recording permission or refresh the target window before retrying.",
  screenshot_directory_failed:
    "Ensure the local screenshot directory is writable before retrying.",
  server_not_initialized:
    "Call initialize and send notifications/initialized before other MCP requests.",
  text_not_found:
    "Refresh app state and select text that exists in the current element value.",
  unexpected_argument:
    "Remove arguments that are not declared in the tool schema before retrying.",
  unknown_tool: "Call tools/list and use one of the advertised tool names.",
  unsupported_action:
    "Refresh app state and choose one of the element's advertised AX actions.",
  unsupported_direction:
    "Use one of the supported directions: up, down, left, right.",
  unsupported_element:
    "Refresh app state and choose an element with AXPress or usable bounds.",
  unsupported_key:
    "Use a supported key name or key combination before retrying.",
  window_not_found:
    "Bring the app window on screen and retry after refreshing app state.",
};

const retryableErrorCodes = new Set([
  "accessibility_permission_denied",
  "accessibility_permission_missing",
  "approval_required",
  "coordinate_mapping_failed",
  "element_not_found",
  "helper_timeout",
  "screen_recording_permission_missing",
  "screenshot_capture_failed",
  "server_not_initialized",
  "text_not_found",
  "window_not_found",
]);

function recoveryHintFor(code) {
  return (
    errorRecovery[code] ||
    "Refresh app state, inspect the error, and retry if the condition is recoverable."
  );
}

function severityFor(code) {
  if (
    [
      "accessibility_permission_denied",
      "accessibility_permission_missing",
      "app_denied",
      "approval_denied",
      "screen_recording_permission_missing",
    ].includes(code)
  ) {
    return "blocked";
  }
  if (retryableErrorCodes.has(code)) return "recoverable";
  return "fatal";
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function errorMetadata({ tool = null, code = "unknown", metadata = {} } = {}) {
  return {
    "local-computer-use/status": "error",
    ...(tool === null ? {} : { tool }),
    "local-computer-use/errorCode": code,
    "local-computer-use/errorSeverity": severityFor(code),
    "local-computer-use/retryable": retryableErrorCodes.has(code),
    "local-computer-use/recoveryHint": recoveryHintFor(code),
    ...metadata,
  };
}

function toolResultError(
  id,
  text,
  { tool = null, code = "unknown", metadata = {} } = {},
) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _meta: errorMetadata({ tool, code, metadata }),
      content: [
        {
          type: "text",
          text,
        },
      ],
      isError: true,
    },
  };
}

function toolResultSuccess(id, text, metadata = {}) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _meta: {
        "local-computer-use/status": "implemented",
        ...metadata,
      },
      content: [
        {
          type: "text",
          text,
        },
      ],
      isError: false,
    },
  };
}

function handleInitialize(id, params = {}) {
  initialized = true;
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo,
    },
  };
}

function handleToolsList(id) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      tools,
    },
  };
}

async function handleToolsCall(id, params = {}) {
  const name = params.name;
  const args = params.arguments || {};
  const tool = findTool(tools, name);

  if (!tool) {
    return toolResultError(id, `Unknown tool: ${name || ""}`, {
      tool: name || null,
      code: "unknown_tool",
    });
  }

  const shapeError = validateArgumentShape(tool, args);
  if (shapeError) {
    return toolResultError(id, shapeError.message, {
      tool: name,
      code: shapeError.code,
    });
  }

  const requiredError = validateRequiredArguments(tool, args);
  if (requiredError) {
    return toolResultError(id, requiredError, {
      tool: name,
      code: "missing_required_argument",
    });
  }

  const appPolicyResult = await enforcePolicy(name, args);
  if (!appPolicyResult.ok) {
    return toolResultError(id, appPolicyResult.message, {
      tool: name,
      code: appPolicyResult.code,
      metadata: {
        "local-computer-use/policySource": appPolicy?.source,
      },
    });
  }

  if (name === "list_apps") {
    const apps = await listApps();
    if (apps.error) {
      return toolResultError(id, apps.error.message, {
        tool: name,
        code: apps.error.code,
      });
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        _meta: {
          "local-computer-use/status": "implemented",
        },
        content: [
          {
            type: "text",
            text: JSON.stringify(apps),
          },
        ],
        isError: false,
      },
    };
  }

  if (name === "get_app_state") {
    const state = await getAppState(args.app);
    if (!state.ok) {
      return toolResultError(
        id,
        state.error?.message || "Unable to read app state",
        {
          tool: name,
          code: state.error?.code || "unknown",
        },
      );
    }
    return toolResultSuccess(id, JSON.stringify(state), {
      tool: name,
      "local-computer-use/source": state.source,
    });
  }

  if (name === "click") {
    const result = await click(args);
    if (!result.ok) {
      return toolResultError(id, result.error?.message || "Unable to click", {
        tool: name,
        code: result.error?.code || "unknown",
      });
    }
    return toolResultSuccess(id, JSON.stringify(result), {
      tool: name,
      "local-computer-use/source": result.source,
    });
  }

  if (name === "type_text") {
    const result = await typeText(args);
    if (!result.ok) {
      return toolResultError(
        id,
        result.error?.message || "Unable to type text",
        {
          tool: name,
          code: result.error?.code || "unknown",
        },
      );
    }
    return toolResultSuccess(id, JSON.stringify(result), {
      tool: name,
      "local-computer-use/source": result.source,
    });
  }

  if (name === "press_key") {
    const result = await pressKey(args);
    if (!result.ok) {
      return toolResultError(
        id,
        result.error?.message || "Unable to press key",
        {
          tool: name,
          code: result.error?.code || "unknown",
        },
      );
    }
    return toolResultSuccess(id, JSON.stringify(result), {
      tool: name,
      "local-computer-use/source": result.source,
    });
  }

  const actionHandlers = {
    scroll,
    drag,
    set_value: setValue,
    select_text: selectText,
    perform_secondary_action: performSecondaryAction,
  };
  if (name in actionHandlers) {
    const result = await actionHandlers[name](args);
    if (!result.ok) {
      return toolResultError(
        id,
        result.error?.message || `Unable to execute ${name}`,
        {
          tool: name,
          code: result.error?.code || "unknown",
        },
      );
    }
    return toolResultSuccess(id, JSON.stringify(result), {
      tool: name,
      "local-computer-use/source": result.source,
    });
  }

  const result = await notImplemented(name);
  return toolResultError(id, result.message, {
    tool: name,
    code: "not_implemented",
    metadata: {
      "local-computer-use/adapterStatus": result.status,
    },
  });
}

async function enforcePolicy(name, args = {}) {
  if (!appPolicy) appPolicy = await loadAppPolicy();
  if (name === "list_apps") return { ok: true };

  const app = args.app;
  const identity = await getAppIdentity(app);
  if (!identity.ok) {
    return {
      ok: false,
      code: identity.error?.code || "invalid_app",
      message: identity.error?.message || `Invalid app: ${app}`,
    };
  }

  const appResult = evaluateAppPolicy(appPolicy, identity.app);
  if (!appResult.ok) return appResult;

  const approvalResult = await evaluateApproval(appPolicy, identity.app, name);
  if (!approvalResult.ok) return approvalResult;

  const permissions = await checkPermissions();
  if (!permissions.ok) {
    return {
      ok: false,
      code: permissions.error?.code || "permission_check_failed",
      message:
        permissions.error?.message || "Unable to check local permissions",
    };
  }

  const permissionError = permissionErrorForTool(
    appPolicy,
    permissions.permissions || {},
    name,
    args,
  );
  if (permissionError) return { ok: false, ...permissionError };

  return {
    ok: true,
    identity: identity.app,
    approval: approvalResult.approval,
  };
}

async function handleMessage(message) {
  const { id, method, params } = message;

  if (method === "initialize") return handleInitialize(id, params);
  if (method === "notifications/initialized") {
    initialized = true;
    return null;
  }

  if (!initialized) {
    return jsonRpcError(id, -32002, "Server not initialized", {
      "local-computer-use/errorCode": "server_not_initialized",
      "local-computer-use/errorSeverity": severityFor("server_not_initialized"),
      "local-computer-use/retryable": true,
      "local-computer-use/recoveryHint": recoveryHintFor(
        "server_not_initialized",
      ),
    });
  }

  if (method === "tools/list") return handleToolsList(id);
  if (method === "tools/call") return await handleToolsCall(id, params);

  return jsonRpcError(
    id,
    -32601,
    `Method not found: Unknown method: ${method}`,
    {
      detail: `Unknown method: ${method}`,
    },
  );
}

async function main() {
  await loadTools();

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;

      try {
        handleMessage(JSON.parse(line))
          .then((response) => {
            if (response) writeJson(response);
          })
          .catch((error) => {
            writeJson(
              jsonRpcError(null, -32603, "Internal error", {
                detail: error.message,
              }),
            );
          });
      } catch (error) {
        writeJson(
          jsonRpcError(null, -32700, "Parse error", { detail: error.message }),
        );
      }
    }
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
