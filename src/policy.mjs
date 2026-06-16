import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultPolicyPath = path.join(repoRoot, "config", "app-policy.toml");
const defaultApprovalStorePath = path.join(
  repoRoot,
  ".build",
  "approvals.json",
);

const readTools = new Set(["get_app_state"]);
const actionTools = new Set([
  "click",
  "drag",
  "perform_secondary_action",
  "press_key",
  "scroll",
  "select_text",
  "set_value",
  "type_text",
]);

const defaultPolicy = {
  apps: {
    allowed: [],
    denied: [
      "Terminal",
      "iTerm",
      "iTerm2",
      "Warp",
      "Alacritty",
      "kitty",
      "WezTerm",
      "Hyper",
      "Codex",
      "Cursor",
      "Visual Studio Code",
      "VS Code",
      "Xcode",
      "System Settings",
      "System Preferences",
      "Keychain Access",
      "Password Manager",
      "1Password",
      "Bitwarden",
      "Dashlane",
      "LastPass",
      "Keeper Password Manager",
      "com.apple.Terminal",
      "com.googlecode.iterm2",
      "dev.warp.Warp-Stable",
      "org.alacritty",
      "net.kovidgoyal.kitty",
      "com.github.wez.wezterm",
      "co.zeit.hyper",
      "com.todesktop.230313mzl4w4u92",
      "com.microsoft.VSCode",
      "com.microsoft.VSCodeInsiders",
      "com.apple.dt.Xcode",
      "com.apple.systempreferences",
      "com.apple.keychainaccess",
      "com.1password.1password",
      "com.bitwarden.desktop",
    ],
  },
  approvals: {
    mode: "store",
    store_path: defaultApprovalStorePath,
    require_for_read: false,
    require_for_actions: true,
    auto_approve_allowed: true,
    native_prompt_timeout_seconds: 60,
  },
  permissions: {
    require_accessibility: true,
    require_screen_recording_for_state: true,
  },
};

function splitEnvList(value) {
  if (!value) return null;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseTomlArray(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map(stripQuotes)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScalar(value) {
  if (value.startsWith("[")) return parseTomlArray(value);
  if (value === "true" || value === "false") return value === "true";
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return stripQuotes(value);
}

function setNestedValue(parsed, section, key, value) {
  if (!parsed[section]) parsed[section] = {};
  parsed[section][key.replaceAll("-", "_")] = parseScalar(value);
}

function parsePolicyToml(source) {
  const parsed = structuredClone(defaultPolicy);
  let section = null;
  let pendingArray = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    if (pendingArray) {
      pendingArray.lines.push(line);
      if (line.includes("]")) {
        setNestedValue(
          parsed,
          pendingArray.section,
          pendingArray.key,
          pendingArray.lines.join(" "),
        );
        pendingArray = null;
      }
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!assignment || !section) continue;

    const [, key, rawValue] = assignment;
    const value = rawValue.trim();
    if (value.startsWith("[") && !value.includes("]")) {
      pendingArray = { key, lines: [value], section };
      continue;
    }
    setNestedValue(parsed, section, key, value);
  }

  return parsed;
}

export async function loadAppPolicy({
  policyPath = process.env.LOCAL_CUA_APP_POLICY || defaultPolicyPath,
} = {}) {
  let policy = structuredClone(defaultPolicy);
  try {
    const source = await readFile(policyPath, "utf8");
    policy = parsePolicyToml(source);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const allowedOverride = splitEnvList(process.env.LOCAL_CUA_ALLOWED_APPS);
  const deniedOverride = splitEnvList(process.env.LOCAL_CUA_DENIED_APPS);
  if (allowedOverride) policy.apps.allowed = allowedOverride;
  if (deniedOverride) policy.apps.denied = deniedOverride;

  if (process.env.LOCAL_CUA_APPROVAL_MODE) {
    policy.approvals.mode = process.env.LOCAL_CUA_APPROVAL_MODE;
  }
  if (process.env.LOCAL_CUA_APPROVAL_STORE) {
    policy.approvals.store_path = process.env.LOCAL_CUA_APPROVAL_STORE;
  }

  return {
    ...policy,
    source: policyPath,
  };
}

function appIdentityCandidates(appOrIdentity) {
  const app =
    typeof appOrIdentity === "object" && appOrIdentity
      ? appOrIdentity
      : { query: appOrIdentity };
  const rawValues = [
    app.query,
    app.name,
    app.bundleIdentifier,
    app.path,
    app.executablePath,
    app.path ? path.basename(app.path, ".app") : null,
    app.executablePath ? path.basename(app.executablePath) : null,
  ];
  return new Set(
    rawValues
      .filter(Boolean)
      .flatMap((value) => {
        const stringValue = String(value).trim();
        return [stringValue, stringValue.replace(/\.app$/i, "")];
      })
      .map((value) => value.toLowerCase())
      .filter(Boolean),
  );
}

function matchesApp(candidateSet, configured) {
  return configured.some((entry) => {
    const normalized = entry
      .trim()
      .toLowerCase()
      .replace(/\.app$/i, "");
    return candidateSet.has(normalized);
  });
}

function appLabel(appOrIdentity) {
  if (typeof appOrIdentity === "object" && appOrIdentity) {
    return (
      appOrIdentity.name ||
      appOrIdentity.bundleIdentifier ||
      appOrIdentity.path ||
      appOrIdentity.query ||
      ""
    );
  }
  return String(appOrIdentity || "");
}

export function evaluateAppPolicy(policy, appOrIdentity) {
  const candidates = appIdentityCandidates(appOrIdentity);
  const label = appLabel(appOrIdentity);

  if (!candidates.size) {
    return {
      ok: false,
      code: "missing_app",
      message: "Missing required argument: app",
    };
  }

  if (matchesApp(candidates, policy.apps.denied || [])) {
    return {
      ok: false,
      code: "app_denied",
      message: `App is denied by local Computer Use policy: ${label}`,
    };
  }

  const allowed = policy.apps.allowed || [];
  if (allowed.length > 0 && !matchesApp(candidates, allowed)) {
    return {
      ok: false,
      code: "app_not_allowed",
      message: `App is not in the local Computer Use allowlist: ${label}`,
    };
  }

  return { ok: true };
}

export function approvalScopeForTool(toolName) {
  if (actionTools.has(toolName)) return "actions";
  if (readTools.has(toolName)) return "read";
  return "none";
}

function approvalKey(identity) {
  return (
    identity?.bundleIdentifier ||
    identity?.path ||
    identity?.name ||
    identity?.query ||
    ""
  ).toLowerCase();
}

async function loadApprovalStore(storePath) {
  try {
    return JSON.parse(await readFile(storePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      version: 1,
      approvals: {},
    };
  }
}

async function saveApprovalStore(storePath, store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function approvalCovers(existingScope, requestedScope) {
  if (existingScope === "actions") return true;
  return existingScope === requestedScope;
}

export async function grantApproval(
  policy,
  identity,
  scope = "actions",
  source = "manual",
) {
  if (!["read", "actions"].includes(scope)) {
    return {
      ok: false,
      code: "invalid_approval_scope",
      message: `Unsupported approval scope: ${scope}`,
    };
  }

  const storePath = policy.approvals?.store_path || defaultApprovalStorePath;
  const key = approvalKey(identity);
  if (!key) {
    return {
      ok: false,
      code: "approval_required",
      message: "App approval requires a resolvable app identity",
    };
  }

  const store = await loadApprovalStore(storePath);
  store.approvals ||= {};
  store.approvals[key] = {
    scope,
    app: {
      name: identity.name || "",
      bundleIdentifier: identity.bundleIdentifier || "",
      path: identity.path || "",
      query: identity.query || "",
    },
    approvedAt: new Date().toISOString(),
    source,
  };
  await saveApprovalStore(storePath, store);

  return {
    ok: true,
    approval: {
      key,
      scope,
      source,
      storePath,
    },
  };
}

export async function evaluateApproval(policy, identity, toolName) {
  return await evaluateApprovalWithPrompt(policy, identity, toolName);
}

export async function evaluateApprovalWithPrompt(
  policy,
  identity,
  toolName,
  { nativePrompt = requestNativeApproval } = {},
) {
  const scope = approvalScopeForTool(toolName);
  if (scope === "none") return { ok: true };

  const approvals = policy.approvals || {};
  const mode = approvals.mode || "store";
  if (mode === "disabled") return { ok: true };

  const requireApproval =
    scope === "actions"
      ? approvals.require_for_actions !== false
      : approvals.require_for_read === true;
  if (!requireApproval) return { ok: true };

  const storePath = approvals.store_path || defaultApprovalStorePath;
  const key = approvalKey(identity);
  if (!key) {
    return {
      ok: false,
      code: "approval_required",
      message: "App approval requires a resolvable app identity",
    };
  }

  const store = await loadApprovalStore(storePath);
  const existing = store.approvals?.[key];
  if (existing && approvalCovers(existing.scope, scope)) {
    return {
      ok: true,
      approval: {
        key,
        scope: existing.scope,
        source: "store",
      },
    };
  }

  if (mode === "prompt") {
    return {
      ok: false,
      code: "approval_required",
      message: `Manual approval is required for ${appLabel(identity)} (${scope})`,
    };
  }

  if (mode === "native_prompt") {
    const promptResult = await nativePrompt(policy, identity, scope);
    if (promptResult.ok) {
      return await grantApproval(policy, identity, scope, "native_gui_prompt");
    }
    return promptResult;
  }

  if (approvals.auto_approve_allowed === false) {
    return {
      ok: false,
      code: "approval_required",
      message: `App is allowed but not approved for ${scope}: ${appLabel(identity)}`,
    };
  }

  return await grantApproval(
    policy,
    identity,
    scope,
    "auto_approve_allowed_policy",
  );
}

export async function requestNativeApproval(policy, identity, scope) {
  const approvals = policy.approvals || {};
  const timeoutSeconds = Math.max(
    1,
    Number(approvals.native_prompt_timeout_seconds || 60),
  );
  const label = appLabel(identity);
  const bundle = identity.bundleIdentifier || "unknown bundle";
  const message = [
    "Local Computer Use is requesting approval.",
    "",
    `App: ${label}`,
    `Bundle: ${bundle}`,
    `Scope: ${scope}`,
    "",
    "Approve only if you expected this automation.",
  ].join("\n");

  const script = `
set dialogResult to display dialog ${JSON.stringify(message)} buttons {"Deny", "Approve"} default button "Deny" cancel button "Deny" with title "Local Computer Use Approval" with icon caution giving up after ${timeoutSeconds}
if gave up of dialogResult is true then
  return "timeout"
end if
return button returned of dialogResult
`;

  try {
    const { stdout } = await execFile("/usr/bin/osascript", ["-e", script], {
      timeout: (timeoutSeconds + 5) * 1000,
      maxBuffer: 1024 * 1024,
    });
    const choice = stdout.trim();
    if (choice === "Approve") return { ok: true };
    if (choice === "timeout") {
      return {
        ok: false,
        code: "approval_required",
        message: `Native approval timed out for ${label}`,
      };
    }
    return {
      ok: false,
      code: "approval_denied",
      message: `Native approval denied for ${label}`,
    };
  } catch (error) {
    if (error.killed || error.signal === "SIGTERM") {
      return {
        ok: false,
        code: "approval_required",
        message: `Native approval timed out for ${label}`,
      };
    }
    return {
      ok: false,
      code: "approval_denied",
      message: `Native approval denied for ${label}`,
    };
  }
}

export function permissionErrorForTool(
  policy,
  permissions,
  toolName,
  args = {},
) {
  const requireAccessibility =
    policy.permissions?.require_accessibility !== false;
  const requireScreenRecording =
    policy.permissions?.require_screen_recording_for_state !== false;

  if (requireAccessibility && permissions.accessibility?.granted === false) {
    return {
      code: "accessibility_permission_missing",
      message:
        "Accessibility permission is required before this app can be automated",
    };
  }

  const needsScreenRecording =
    (toolName === "get_app_state" && args.includeScreenshot !== false) ||
    toolName === "drag" ||
    (toolName === "click" && args.x !== undefined && args.y !== undefined);

  if (
    requireScreenRecording &&
    needsScreenRecording &&
    permissions.screenRecording?.granted === false
  ) {
    return {
      code: "screen_recording_permission_missing",
      message:
        "Screen Recording permission is required before screenshot coordinates can be used",
    };
  }

  return null;
}
