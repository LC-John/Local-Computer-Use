# Computer Use State Model Discovery

Date: 2026-06-12
Updated: 2026-06-15

Status: In progress, with raw native/proxy capture on hold. Codex-hosted state
capture works for Calculator, TextEdit, Chrome, and Finder fixtures; direct
stdio MCP probing and proxied hosted probing still time out after app approval.
Milestone 6 now has an initial local macOS Accessibility reader that returns
filtered `list_apps` output and a bounded JSON AX tree through the
reimplementation MCP server.

This document tracks Milestone 4: discovery of the observable shape and
semantics of `get_app_state`.

## Current Finding

The native MCP server accepts `get_app_state` as a tool and validates app names.
Successful state capture is available through the Codex-hosted Computer Use
tool after restarting Codex, but the direct stdio probe still does not return
after app approval.

Observed behavior:

- `initialize` succeeds.
- `notifications/initialized` can be sent.
- `tools/call` with an invalid app name returns a normal tool result error:

```text
Invalid app: __definitely_missing_app_for_probe__
```

- `tools/call` with a real app name such as `Calculator` triggers an
  `elicitation/create` request:

```text
Allow Codex to use Calculator?
```

- The probe can now auto-accept that request with
  `CUA_AUTO_ACCEPT_ELICITATION=1`.
- After auto-accepting the Calculator app approval, the direct stdio probe still
  timed out after 60-90 seconds.
- Before restarting Codex, the Codex-exposed Computer Use `get_app_state` tool
  returned `Transport closed`.
- After restarting Codex, `mcp__computer_use.list_apps` and
  `mcp__computer_use.get_app_state({"app":"Calculator"})` both returned
  successfully.
- In a later thread, Calculator action tools worked normally; a direct hosted
  Calculator smoke test computed `9 * 9 = 81`.
- Hosted state capture now also works for TextEdit, Chrome, and Finder.
- A local Accessibility/UI scripting permission check initially returned
  `false`, then returned `true` after the user enabled Accessibility in macOS
  System Settings:

```bash
osascript -e 'tell application "System Events" to UI elements enabled'
```

- `SkyComputerUseService` was restarted after permission changes, but direct
  `get_app_state(Calculator)` still timed out after app approval.

Interpretation: the `get_app_state` handler appears to enter a deeper
app/session/screenshot/accessibility path after resolving a real app. That path
currently does not return in the direct probe environment. The successful hosted
calls indicate that the remaining direct-probe blocker is likely a Codex-hosted
Computer Use app approval/session context that raw stdio probing does not fully
emulate. Hosted Computer Use is now usable as the successful state oracle for
Milestone 4 fixture discovery. The local Milestone 6 AX reader is a
reimplementation path, not raw native CUA capture; it should be compared against
the hosted fixture observations before claiming closer compatibility.

## Known MCP-Level Contract

From `protocol/schemas/get_app_state.json`:

```json
{
  "additionalProperties": false,
  "properties": {
    "app": {
      "description": "App name, full app path, or unambiguous bundle identifier",
      "type": "string"
    }
  },
  "required": ["app"],
  "type": "object"
}
```

Known error behavior:

- Missing `app` returns a tool result error with text:
  `Missing required argument: app`.
- Non-string `app` values also return `Missing required argument: app`.
- Unknown app names return `Invalid app: <name>`.

## Observed Hosted State Payload Areas

From `fixtures/Calculator/basic/codex-hosted-state.md`, the Codex-hosted
response includes:

- CUA app version;
- app path, bundle ID, and pid;
- key window title and app name;
- hierarchical accessibility tree;
- decimal element indexes;
- localized role names;
- descriptions, help text, IDs, disabled/settable flags, and secondary actions;
- focused UI element;
- screenshot rendered as image content in the Codex UI.

Additional fixture observations:

- TextEdit exposes editable document text as `文本输入区 (settable, string)` with
  semantic ID `First Text View` and inline `Value` content.
- Chrome exposes browser chrome, address/search field, HTML content, headings,
  text, form input, button nodes, and selected tab state.
- Finder exposes sidebar rows, list-view rows, file URLs, folder collapsed state,
  toolbar controls, and sort buttons.
- Chrome scrolling changed the screenshot viewport while the AX text tree still
  listed the full local page content.

## Expected Remaining State Payload Areas

The model still needs more fixtures to document:

- element bounds and coordinate system;
- error states for app unavailable, permission missing, and window unavailable.
- repeated-capture element-index stability for unchanged layouts.

## Local Reimplementation State Reader

The initial Milestone 6 reader is implemented in `src/ax-state.swift` and wired
through `src/mac-adapter.mjs` and `src/server.mjs`. A more focused
implementation note is available in `docs/milestone-6-local-ax-reader.md`.

Current behavior:

- `list_apps` returns filtered user-facing running app metadata from
  `NSWorkspace`, excluding helper, daemon, and XPC-style applications.
- `get_app_state` resolves app name, bundle identifier, app path, executable
  path, frontmost app aliases, and app bundle basename such as `Calculator`.
- If an app is not running, the resolver tries known app bundle locations under
  `/Applications` and `/System/Applications` before returning `Invalid app`.
- The state payload includes app metadata, focused or first window title, a
  bounded AX tree, node indexes, role/subrole/title/value/description/help,
  enabled/focused/selected flags, position, size, actions, and available AX
  attributes.
- Screenshot capture and native CUA screenshot encoding are still out of scope
  for this milestone and remain in the Milestone 7 area.
- Native-style `list_apps` recent-app usage metadata is still out of scope for
  the current local implementation.

Validation:

```bash
npm run probe:local
LOCAL_CUA_PROBE_APP=Calculator npm run probe:local
```

## Fixture Plan

Initial state fixtures are defined in `docs/fixture-list.md`.

Current fixture directories:

```text
fixtures/Calculator/basic/
fixtures/TextEdit/plain-text/
fixtures/Chrome/static-page/
fixtures/Finder/project-list/
fixtures/__definitely_missing_app_for_probe__/invalid-app/
```

The Calculator fixture records both the direct-MCP timeout behavior and the
successful Codex-hosted state payload. TextEdit, Chrome, and Finder record
hosted state observations and local visual screenshots. The invalid-app fixture
records the known error shape for an unresolvable app.

Local permission notes are recorded in `fixtures/permission-snapshot.md`.
Coordinate and indexing notes are recorded in
`docs/state-model-coordinate-and-indexing.md`.
Hosted-context investigation notes are recorded in
`docs/computer-use-hosted-context-investigation.md`.
The hosted MCP proxy plugin setup is recorded in
`docs/computer-use-proxy-plugin.md`.

Fresh-thread proxy capture confirmed Codex sends hosted MCP calls with
`protocolVersion: 2025-06-18`, elicitation capabilities, turn metadata, and
`plugin_id: computer-use-proxy@personal`. The proxy was then updated to rewrite
`params._meta.plugin_id` to `computer-use@openai-bundled` before forwarding.
That updated path still timed out after the Calculator app approval was accepted,
so raw proxy capture is on hold while the reimplementation proceeds into the
Milestone 6 accessibility reader.

## Open Questions

- Does successful `get_app_state` require Codex host context beyond raw stdio
  MCP initialization? Current evidence: yes, for direct successful state
  capture.
- Does it require app approval state that is unavailable to direct probes?
- Does the local Computer Use service need to be started or addressed through a
  host-specific XPC/session channel?
- Can the direct probe emulate the hosted app approval/session context closely
  enough to receive the raw successful response?
- What is the exact screenshot content encoding: path, base64 image, or MCP
  image content?
- Are element indexes stable per call or across calls?
- Can a hosted MCP wrapper/proxy capture raw Computer Use stdio traffic without
  changing the official bundled plugin?
