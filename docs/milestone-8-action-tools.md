# Milestone 8 Action Tool Implementation

Date: 2026-06-15

Status: Initial implementation complete. All action tools are implemented and
accepted against the current Calculator/TextEdit fixtures, with additional
Chrome/Finder app-coverage probes for browser and file-manager behavior.

## Implemented Components

### `click`

`click` is routed from `src/server.mjs` through `src/mac-adapter.mjs` into
`src/ax-state.swift`.

Supported target modes:

- `element_index`: resolves the current AX tree by deterministic per-call
  indexes, then tries `AXPress` for simple left-clicks.
- `element_index` fallback: if `AXPress` is unavailable or fails, the helper
  clicks the AX element center with `CGEvent`.
- `x` and `y`: maps screenshot pixel coordinates back into global screen points
  using the M7 `windowFrame`, `displayScale`, and `imageContentOrigin`
  metadata, then clicks with `CGEvent`.

Supported click options:

- `click_count`, defaulting to `1`.
- `mouse_button`, supporting `left`, `right`, and `middle`.

Current result shape:

```json
{
  "ok": true,
  "source": "local-macos-accessibility-action",
  "action": "click",
  "result": {
    "method": "ax_press",
    "elementIndex": 23,
    "clickCount": 1,
    "button": "left"
  }
}
```

## Verification

Run the click acceptance probe:

```bash
npm run probe:m8:click
```

The probe:

- starts the local MCP server;
- calls `get_app_state` for Calculator before each state-dependent action;
- dynamically finds button indexes before each action, because Calculator can
  shift indexes when the clear/delete button changes;
- verifies element-index clicks by clicking clear, `1`, add, `2`, and equals,
  then asserting that the displayed value is `3`;
- verifies screenshot-coordinate clicks by mapping button centers through M7
  screenshot metadata and asserting that the displayed value is `3`;
- verifies the `click_count`/CGEvent fallback path by double-clicking `1` and
  asserting that Calculator displays `11`;
- verifies structured errors for missing click targets and unknown element
  indexes.

Expected output:

```text
Local MCP M8 click acceptance probe passed.
```

Probe artifacts:

```text
reports/m8-click-probe.json
reports/m8-click-probe.jsonl
```

Acceptance result from the current run:

```text
element-index arithmetic: displayValue = 3, method = ax_press
coordinate arithmetic: displayValue = 3, method = cg_event_screenshot_coordinate
double-click fallback: displayValue includes 11, method = cg_event_element_center
error checks: missing_click_target and element_not_found
```

Run the keyboard acceptance probe:

```bash
npm run probe:m8:keyboard
```

The keyboard probe:

- creates a scratch TextEdit file under `.build/`;
- closes old TextEdit documents without saving to make setup deterministic;
- opens the scratch file and clicks the editable `AXTextArea`;
- verifies `type_text` by entering `M8 keyboard action probe`;
- verifies `press_key` with `super+a` and `BackSpace`;
- verifies replacement typing with `Replacement text`;
- verifies structured `unsupported_key` errors.

Expected output:

```text
Local MCP M8 keyboard acceptance probe passed.
```

Probe artifacts:

```text
reports/m8-keyboard-probe.json
reports/m8-keyboard-probe.jsonl
```

Run the remaining action acceptance probe:

```bash
npm run probe:m8:remaining
```

The remaining-action probe:

- creates a scratch TextEdit file under `.build/`;
- verifies `set_value` by setting a long editable text value;
- verifies `select_text` by selecting `beta` and replacing it with `BETA`;
- verifies `scroll` with the TextEdit scroll area, falling back to scroll-wheel
  events when the exposed AX scroll action fails at runtime;
- verifies `perform_secondary_action` with the window-level `AXRaise` action;
- verifies `drag` by mapping screenshot coordinates through M7 metadata and
  issuing a left-button drag;
- verifies structured errors for unsupported secondary actions and unsupported
  scroll directions.

Expected output:

```text
Local MCP M8 remaining actions acceptance probe passed.
```

Probe artifacts:

```text
reports/m8-remaining-actions-probe.json
reports/m8-remaining-actions-probe.jsonl
```

Run the Chrome/Finder app-coverage probe:

```bash
npm run probe:m8:chrome-finder
```

The Chrome/Finder probe:

- opens the local Chrome fixture page in a controlled Chrome window;
- clicks Chrome's new-tab button via `AXPress` and verifies the tab count
  changes;
- restores the fixture tab and verifies `scroll` against the Chrome web area;
- opens the deterministic Finder fixture directory;
- clicks the `notes.md` item and verifies the Finder click path;
- verifies `drag` through screenshot-coordinate mapping on the Finder item;
- verifies a structured `element_not_found` error for a bad Finder index.

Expected output:

```text
Local MCP M8 Chrome/Finder acceptance probe passed.
```

Probe artifacts:

```text
reports/m8-chrome-finder-probe.json
reports/m8-chrome-finder-probe.jsonl
```

## Reusable Action Tool Path

Use this path for the remaining Milestone 8 action tools:

1. Confirm the native schema under `protocol/schemas/<tool>.json`.
2. Add a typed route in `src/server.mjs` that returns implemented success or
   structured tool errors.
3. Add an adapter function in `src/mac-adapter.mjs` that calls the Swift helper
   with JSON action arguments.
4. Add a Swift command in `src/ax-state.swift` that:
   - parses JSON arguments;
   - resolves the app and current target window;
   - reuses the current AX tree/index traversal when element indexes are needed;
   - returns `{ ok, source, action, result }` on success;
   - throws `ToolError(code, message)` for machine-readable failures.
5. Add or extend an M8 probe under `scripts/probe-m8-*.mjs`.
6. Reuse `scripts/lib/local-mcp-client.mjs` for MCP server startup, tool calls,
   JSONL capture, and tool-result parsing.
7. Record acceptance evidence under `reports/`.
8. Update this document and `protocol/tool-coverage.md`.

The `click` probe is the reference structure for future action tools: it keeps
fixture setup deterministic, re-reads state before index-sensitive actions,
asserts visible app state after actions, and includes negative cases for error
semantics.

GUI action probes must run serially. They activate and mutate real foreground
apps, so running probes in parallel can make them flaky by stealing focus from
each other.

## Known Gaps

- `type_text` currently uses Unicode `CGEvent` keyboard events and is accepted
  in TextEdit.
- `press_key` currently supports common virtual keys and modifier combinations
  such as `super+a`, `BackSpace`, `Return`, `Tab`, arrows, letters, and digits.
- `scroll` uses AX scroll actions when they work and falls back to CGEvent
  scroll-wheel events.
- `drag` uses screenshot-coordinate to global-coordinate mapping plus CGEvent
  mouse drag events.
- `set_value` uses AX value setting.
- `select_text` uses AX selected text ranges.
- `perform_secondary_action` maps requested action names to exposed AX actions.
- Chrome app coverage intentionally avoids typing into the fixture page because
  Chrome's address-bar focus behavior is profile-dependent; text input remains
  accepted through TextEdit, while Chrome covers browser click and scroll paths.
- App allow/deny policy is not yet implemented; that is tracked under
  Milestone 9.
