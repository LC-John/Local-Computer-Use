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

function toolResultError(id, text, metadata = {}) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      _meta: {
        "local-computer-use/status": "not_implemented",
        ...metadata,
      },
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
    });
  }

  const requiredError = validateRequiredArguments(tool, args);
  if (requiredError) {
    return toolResultError(id, requiredError, {
      tool: name,
    });
  }

  const appPolicyResult = await enforcePolicy(name, args);
  if (!appPolicyResult.ok) {
    return toolResultError(id, appPolicyResult.message, {
      tool: name,
      "local-computer-use/status": "error",
      "local-computer-use/errorCode": appPolicyResult.code,
      "local-computer-use/policySource": appPolicy?.source,
    });
  }

  if (name === "list_apps") {
    const apps = await listApps();
    if (apps.error) {
      return toolResultError(id, apps.error.message, {
        tool: name,
        "local-computer-use/errorCode": apps.error.code,
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
          "local-computer-use/status": "error",
          "local-computer-use/errorCode": state.error?.code || "unknown",
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
        "local-computer-use/status": "error",
        "local-computer-use/errorCode": result.error?.code || "unknown",
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
          "local-computer-use/status": "error",
          "local-computer-use/errorCode": result.error?.code || "unknown",
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
          "local-computer-use/status": "error",
          "local-computer-use/errorCode": result.error?.code || "unknown",
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
          "local-computer-use/status": "error",
          "local-computer-use/errorCode": result.error?.code || "unknown",
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
    "local-computer-use/adapterStatus": result.status,
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
    return jsonRpcError(id, -32002, "Server not initialized");
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
