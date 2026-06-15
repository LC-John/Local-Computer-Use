# Milestone 9 Permission and Approval Model

Date: 2026-06-15

Status: Complete for the local reimplementation. The local MCP server now
resolves app identity, evaluates app policy, checks approval state, and verifies
local macOS permissions before dispatching app-state or action calls to the
Swift Accessibility helper.

## Implemented Components

### App policy

The default app policy is stored in `config/app-policy.toml`:

```toml
[apps]
allowed = []
denied = [
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
]

[approvals]
mode = "store"
store_path = ".build/approvals.json"
require_for_read = false
require_for_actions = true
auto_approve_allowed = true

[permissions]
require_accessibility = true
require_screen_recording_for_state = true
```

An empty `allowed` list means "allow unless denied". When `allowed` contains
entries, the policy switches to strict allowlist mode.

The MCP server also supports probe/runtime overrides:

```bash
LOCAL_CUA_APP_POLICY=/path/to/app-policy.toml
LOCAL_CUA_ALLOWED_APPS=Calculator,TextEdit
LOCAL_CUA_DENIED_APPS=Terminal,Codex
```

Policy matching is intentionally conservative and happens before GUI actions.
The MCP server first calls the Swift helper's read-only `app-identity` command,
then compares the requested query, resolved app name, bundle identifier, app
path, executable path, and basenames against configured entries.

### App approvals

Approval mode is configured under `[approvals]`:

- `store`: persist approvals in `store_path`.
- `prompt`: return `approval_required` instead of automatically approving.
- `native_prompt`: show a macOS approval dialog, then persist approved apps.
- `disabled`: skip approval after allow/deny policy.

Read calls do not require approval by default. Action calls require approval by
default. In `store` mode, `auto_approve_allowed = true` records the first
allowed action approval in the approval store. In `native_prompt` mode, the
server displays a macOS dialog with Approve and Deny buttons; approval is then
persisted in the same store. In stricter non-GUI runs, set
`auto_approve_allowed = false` or `mode = "prompt"` and approve manually:

```bash
LOCAL_CUA_APP_POLICY=/path/to/app-policy.toml npm run approve:app -- Calculator --scope actions
```

### Permission checks

`src/ax-state.swift` exposes read-only `app-identity` and `permissions`
commands:

```bash
.build/ax-state app-identity Calculator
.build/ax-state permissions
```

The command reports:

- Accessibility status from `AXIsProcessTrusted`.
- Screen Recording status from `CGPreflightScreenCaptureAccess`.

`src/server.mjs` calls this permission check before app-state and action tools.
The check returns clear MCP tool errors before native GUI work begins:

```text
accessibility_permission_missing
screen_recording_permission_missing
app_denied
app_not_allowed
approval_required
approval_denied
```

Screen Recording is required for `get_app_state`, `drag`, and click calls that
use screenshot coordinates. Element-index click and keyboard/text actions only
require Accessibility.

## Verification

Run the M9 acceptance probe:

```bash
npm run probe:m9:policy
```

The probe:

- creates a strict temporary allowlist policy under `.build/`;
- verifies policy parsing and direct policy evaluation;
- verifies resolved app identity matching, including bundle identifiers;
- verifies approval store persistence and prompt-mode `approval_required`;
- verifies native-prompt approval and denial behavior with an injected prompt
  runner so CI does not require a person to click a dialog;
- verifies synthetic permission-error classification;
- confirms `list_apps` bypasses app policy because it has no target app;
- confirms denied apps fail with `app_denied`;
- confirms apps outside a strict allowlist fail with `app_not_allowed`;
- confirms denied action calls are blocked before target/action validation;
- confirms an allowed Calculator `get_app_state` call still returns app
  metadata, AX tree, and captured screenshot.

Expected output:

```text
Local MCP M9 policy and permission probe passed.
```

Probe artifacts:

```text
reports/m9-policy-probe.json
reports/m9-policy-probe.jsonl
```

## Remaining Differences From Native Computer Use

- The local implementation now supports a native macOS GUI approval dialog with
  `mode = "native_prompt"`, but its text and persistence format are local to
  this reimplementation rather than the bundled Computer Use service.
- Permission checks are preflight checks. If macOS permission state changes
  while the server is running, the next tool call will observe the new state.
- The sensitive-app denylist is intentionally conservative, but it is not a
  complete taxonomy of every password manager, terminal, system tool, or IDE.
