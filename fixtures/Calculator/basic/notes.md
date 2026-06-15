# Calculator Basic Fixture

Date: 2026-06-12

Purpose: capture the native `get_app_state` state payload for a stable
Calculator window.

## Setup

Calculator was opened with:

```bash
open -a Calculator
osascript -e 'tell application "Calculator" to activate'
```

## Native Computer Use Result

Direct `SkyComputerUseClient mcp` probing successfully initialized the MCP
session, but `tools/call` for:

```json
{
  "name": "get_app_state",
  "arguments": {
    "app": "Calculator"
  }
}
```

did not return within the configured timeout.

The first probe showed that native Computer Use sends an MCP
`elicitation/create` request:

```text
Allow Codex to use Calculator?
```

The probe script was then updated to auto-accept that fixture-specific
elicitation when `CUA_AUTO_ACCEPT_ELICITATION=1` is set. After auto-accepting,
the `get_app_state` call still did not return within 60-90 seconds.

The user then enabled Accessibility in macOS System Settings, and:

```bash
osascript -e 'tell application "System Events" to UI elements enabled'
```

returned:

```text
true
```

`SkyComputerUseService` was restarted after the permission change. Direct
`get_app_state(Calculator)` still timed out after the app approval step.

The timeout record is stored in `native-state-timeout.json`, and the latest raw
request/response stream is stored in `request-response-samples.jsonl`.

## Status

State payload capture is blocked in this environment until native
`get_app_state` can return successfully through direct MCP probing. After
restarting Codex, the Codex-hosted Computer Use tool returned a successful
Calculator state payload; that hosted result is summarized in
`codex-hosted-state.md`. The local permission snapshot in
`../../permission-snapshot.md` records the permission change and the remaining
direct-probe blocking behavior.

## Local M7 Reimplementation Artifacts

The local reimplementation can now capture Calculator AX state, a target-window
screenshot, and an AX-bounds overlay:

```bash
LOCAL_CUA_PROBE_APP=Calculator npm run probe:local
npm run overlay:latest
```

Current local M7 fixture files:

```text
local-m7-state.json
local-m7-screenshot.png
local-m7-bounds-overlay.svg
```

The local M7 probe verifies that the screenshot was captured, the PNG file is
valid, and the overlay SVG contains mapped AX rectangles. This does not replace
the hosted native fixture; it records the current local reimplementation output
for comparison.
