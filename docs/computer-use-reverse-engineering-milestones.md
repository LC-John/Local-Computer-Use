# Computer Use Reverse Engineering and Reimplementation Milestones

Date: 2026-06-12
Updated: 2026-06-15

This document defines a practical milestone plan for reverse engineering and
reimplementing a Computer Use-like local MCP server. The intended approach is
black-box compatible reimplementation: observe public/local runtime behavior,
plugin metadata, bundle structure, MCP protocol messages, and macOS API effects,
then build an independent implementation with similar tool contracts.

This is not a plan to recover OpenAI source code. It should avoid bypassing
macOS permissions, app approvals, code signing protections, or Codex safety
boundaries.

## Current Progress

As of 2026-06-15, this project is holding the remaining raw native
state-capture investigation, has a working local macOS Accessibility reader,
and has an initial local screenshot/coordinate capture path.

```text
Milestone 0: Complete
Milestone 1: Complete
Milestone 2: Complete
Milestone 3: Complete
Milestone 4: In progress, raw proxy/native capture blocker on hold
Milestone 5: Complete
Milestone 6: Initial implementation complete, fixture diffing still open
Milestone 7: Initial screenshot and overlay implementation complete
Milestone 8: Initial implementation complete, Calculator/TextEdit/Chrome/Finder fixtures accepted
Milestone 9: Complete for local reimplementation
Milestone 10.1: Local fixture diff harness complete
Milestone 10.2: Hosted context emulation probe complete, native state gap still open
Milestone 10.3: Hosted oracle semantic diff complete for Calculator/TextEdit/Chrome/Finder, raw native-vs-local diff deferred
Milestone 11: Complete for local automated fixture gate
Milestone 12: Complete
Milestone 13: Complete for local error semantics baseline
Milestone 14: Complete for first native-version tracking baseline
```

Completed architecture discovery work is summarized in
`docs/computer-use-architecture-report.md`. Completed MCP protocol discovery
work is recorded under `protocol/`. Milestone 4 state model discovery remains
partially open and tracked in `STATE_MODEL.md`. Milestone 5 has a local Node.js
MCP skeleton under `src/`. Milestone 6 now has a Swift Accessibility helper at
`src/ax-state.swift`, wired through the Node MCP adapter. The implementation
details are summarized in `docs/milestone-6-local-ax-reader.md`. Milestone 7
adds target-window PNG capture and coordinate metadata through the same helper;
see `docs/milestone-7-screenshot-coordinate-capture.md`. Milestone 8 has
initial implementations for all action tools plus Calculator, TextEdit, Chrome,
and Finder acceptance probes; see `docs/milestone-8-action-tools.md`.
Milestone 9 adds resolved app identity, app policy, persisted approvals, manual
approval CLI, and permission checks before native helper execution; see
`docs/milestone-9-permission-approval-model.md`.
Milestone 10 is now split into M10.1 local fixture diff, M10.2 hosted-context
emulation, and M10.3 oracle-vs-local diff; see
`docs/milestone-10-diff-harness.md`. Milestone 11 has a local fixture test
runner covering every exposed tool across Calculator, TextEdit, Chrome, Finder,
and core policy errors; see `docs/milestone-11-fixture-test-suite.md`.
Milestone 12 adds and locally installs a distinct `local-computer-use` Codex
plugin bundle; see `docs/milestone-12-codex-plugin-packaging.md`. Milestone 13
adds the local error model, stable error metadata, negative tests, and
coordinate safety checks; see `docs/milestone-13-error-semantics.md`.
Milestone 14 adds a repeatable native snapshot system, native version changelog,
and compatibility matrix; see `docs/milestone-14-version-tracking.md`.

## Target Outcome

The target deliverable is a local Codex plugin or standalone MCP server that can
provide a Computer Use-like tool surface:

```text
get_app_state
list_apps
click
type_text
press_key
scroll
drag
set_value
select_text
perform_secondary_action
```

The implementation should:

- expose compatible or intentionally documented MCP schemas;
- return useful app state, including screenshot and accessibility structure;
- execute basic macOS GUI actions through native APIs;
- preserve clear permission and safety boundaries;
- include repeatable fixtures and regression tests.

## Milestone 0: Scope, Safety, and Legal Boundaries

Status: Complete as of 2026-06-12.

The safety boundaries, allowed evidence sources, disallowed work, and
compatibility levels are defined in this document and in `PROJECT_SCOPE.md`.
Project decisions are tracked in `DECISIONS.md`, and the initial fixture list is
tracked in `docs/fixture-list.md`.

### Purpose

Define what is allowed, what is out of scope, and what "compatible" means.

### Work Items

- Write a project charter that explicitly says this is a black-box
  reimplementation effort.
- Define allowed evidence sources:
  - plugin manifests;
  - local bundle metadata;
  - `otool`, `file`, `codesign`, `plutil`, `strings`;
  - MCP requests and responses;
  - runtime behavior in normal app usage;
  - public macOS APIs and self-written helpers.
- Define disallowed work:
  - no source-code theft;
  - no bypassing Screen Recording or Accessibility permissions;
  - no bypassing app approval;
  - no private credential extraction;
  - no automated approval of macOS security/privacy prompts;
  - no automation of Codex itself or terminal apps if matching Codex's safety
    boundary is a goal.
- Define compatibility levels:
  - Level 1: tool names and basic MCP schema;
  - Level 2: `get_app_state` shape and screenshot/accessibility payloads;
  - Level 3: basic actions work in stable fixture apps;
  - Level 4: multi-app workflows are reliable;
  - Level 5: error semantics and permission behavior are close to native CUA;
  - Level 6: Codex agents can use the replacement with minimal prompt changes.

### Feasible Methods

- Create a short `PROJECT_SCOPE.md`.
- Keep a `DECISIONS.md` file for boundary decisions.
- Create an explicit test fixture list before implementation starts.

### Verification Goals

- The team can state what will and will not be reverse engineered.
- No milestone depends on bypassing platform security controls.
- "Done" is measurable through compatibility levels rather than vague
  similarity.

### Deliverables

- Scope document.
- Compatibility-level definition.
- Initial fixture list.

### Risks and Notes

- Without this milestone, implementation can drift into unsafe or legally
  ambiguous territory.
- Compatibility should be defined around observable behavior, not internal
  implementation identity.

## Milestone 1: Entrypoint and Installation Mapping

Status: Complete as of 2026-06-12.

The active plugin cache, installed runtime app, Codex config entry, MCP
manifest, and effective `SkyComputerUseClient mcp` command have been identified
and recorded in `docs/computer-use-architecture-report.md`. The report also
confirms that `node_repl` is unrelated to the Computer Use implementation.

### Purpose

Locate the real Computer Use entrypoint and all local installation paths.

### Work Items

- Inspect Codex config:

```bash
sed -n '1,160p' ~/.codex/config.toml
```

- Locate the enabled plugin:

```bash
find ~/.codex/plugins/cache -path '*computer-use*' -maxdepth 8 -print
```

- Read plugin manifest:

```bash
cat ~/.codex/plugins/cache/openai-bundled/computer-use/*/.codex-plugin/plugin.json
```

- Read MCP manifest:

```bash
cat ~/.codex/plugins/cache/openai-bundled/computer-use/*/.mcp.json
```

- Locate installed runtime app:

```bash
find ~/.codex/computer-use -maxdepth 6 -print
```

- Confirm `node_repl` is unrelated to Computer Use by checking its exposed MCP
  tools separately.

### Feasible Methods

- Use `rg`, `find`, and direct manifest reads.
- Record both plugin-cache paths and active installed runtime paths.
- Compare `.mcp.json` command paths with the active app bundle.

### Verification Goals

- Confirm that the MCP command is `SkyComputerUseClient mcp`.
- Confirm Computer Use is not implemented by `node_repl`.
- Produce a path map from Codex config to plugin manifest to MCP entrypoint.

### Deliverables

- Installation path table.
- Entrypoint diagram:

```text
~/.codex/config.toml
-> plugin enabled
-> .codex-plugin/plugin.json
-> .mcp.json
-> SkyComputerUseClient mcp
```

### Risks and Notes

- Codex plugin versions can change. Always record the version directory, such as
  `1.0.809`.
- There may be both a plugin-cache app bundle and an installed runtime app
  bundle. Treat the installed runtime app as the active one when config points
  to it.

## Milestone 2: Native Bundle Static Profile

Status: Complete as of 2026-06-12.

The native app structure, key binaries, helper apps, bundle metadata,
entitlements, framework dependencies, resource bundles, and high-signal static
strings have been inspected and summarized in
`docs/computer-use-architecture-report.md`.

### Purpose

Understand the native app structure without disassembling or recovering source.

### Work Items

- Identify executable types:

```bash
file "Codex Computer Use.app/Contents/MacOS/SkyComputerUseService"
file "Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
```

- Inspect dynamic dependencies:

```bash
otool -L "path/to/SkyComputerUseClient"
otool -L "path/to/SkyComputerUseService"
```

- Inspect bundle metadata:

```bash
/usr/libexec/PlistBuddy -c 'Print' "path/to/Info.plist"
```

- Inspect entitlements:

```bash
codesign -d --entitlements :- "path/to/SkyComputerUseClient.app"
codesign -d --entitlements :- "path/to/Codex Computer Use.app"
```

- Inspect helper apps and resources:

```bash
find "Codex Computer Use.app/Contents/SharedSupport" -maxdepth 4 -print
find "SkyComputerUseClient.app/Contents/Resources" -maxdepth 4 -print
```

- Extract high-signal strings:

```bash
strings "path/to/SkyComputerUseClient" | rg "XPC|MCP|Accessibility|CGEvent|ScreenCapture|tools/list|initialize"
```

### Feasible Methods

- Use Apple command-line tools only.
- Keep raw command outputs in an evidence folder.
- Summarize findings in a component matrix.

### Verification Goals

- Confirm `SkyComputerUseClient` is a native Mach-O executable.
- Confirm `SkyComputerUseService` exists and links macOS GUI frameworks.
- Confirm evidence for IPC/XPC, MCP, Accessibility, and CGEvent behavior.
- Confirm resource bundles and helper apps exist.

### Deliverables

- Native component matrix:

```text
Component | Path | Type | Role | Evidence
```

- Dependency summary.
- Entitlement summary.
- Static string evidence summary.

### Risks and Notes

- `strings` evidence is suggestive, not proof of exact control flow.
- Dynamic library dependencies indicate capability areas, not full behavior.
- Entitlements and app groups imply relationships but do not fully describe IPC
  protocols.

## Milestone 3: MCP Protocol Discovery

Status: Complete as of 2026-06-12.

The native MCP entrypoint was probed directly. The `initialize` response,
`tools/list` response, per-tool schemas, request/response samples, tool coverage
matrix, and error catalog are recorded under `protocol/`.

The native `tools/list` response exposed 10 tools in this snapshot:

```text
list_apps
get_app_state
click
perform_secondary_action
set_value
select_text
scroll
drag
press_key
type_text
```

Valid action calls remain intentionally deferred to later fixture milestones
because they operate the real desktop. Direct `list_apps` `tools/call` probes
timed out in this environment, and that behavior is recorded in
`protocol/error-catalog.md`. That timeout is a direct raw-stdio probing
limitation, not evidence that `list_apps` is absent or unusable: later
Codex-hosted `mcp__computer_use.list_apps` calls returned successfully after
the Codex app was restarted. Compatibility work should therefore treat
`list_apps` as a supported read-only tool while keeping the raw direct-probe
timeout as an unresolved hosted-context difference.

### Purpose

Discover the observable MCP contract exposed by the native Computer Use client.

### Work Items

- Run the MCP process directly:

```bash
"path/to/SkyComputerUseClient" mcp
```

- Send valid MCP initialization:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {
      "name": "probe",
      "version": "0.1.0"
    }
  }
}
```

- Send `notifications/initialized`.
- Send `tools/list`.
- Call every listed tool with:
  - missing params;
  - minimal params;
  - valid params;
  - intentionally invalid app names;
  - no prior `get_app_state`;
  - missing permissions where safe to test.
- Record:
  - serverInfo;
  - capabilities;
  - tool names;
  - JSON schemas;
  - successful result shapes;
  - error codes/messages;
  - ordering requirements.

### Feasible Methods

- Write a small probe script in Node.js or Python that speaks JSON-RPC over
  stdio.
- Store every request/response pair as JSONL.
- Keep probes read-only until action tools are intentionally tested.
- Use a throwaway macOS user account or a VM if broad GUI testing is needed.

### Verification Goals

- A complete `tools/list` snapshot exists.
- Each tool has a captured schema.
- Each tool has at least one captured success or known blocked response.
- Common error states are documented.

### Deliverables

- `protocol/tools-list.json`
- `protocol/schemas/*.json`
- `protocol/request-response-samples.jsonl`
- `protocol/error-catalog.md`

### Risks and Notes

- Running action tools can operate the real desktop. Start with state/query
  tools.
- Some tools may be hidden, gated, or unavailable outside the Codex host.
- The native client may depend on environment variables, app group state, or a
  running service.

## Milestone 4: State Model Discovery

### Purpose

Reverse engineer the observable shape and semantics of `get_app_state`.

### Work Items

- Pick stable fixture apps:
  - Calculator;
  - TextEdit;
  - Chrome or Safari;
  - Cursor or VS Code;
  - Numbers, if table controls matter.
- For each fixture:
  - open a known window state;
  - call `get_app_state`;
  - save screenshot output;
  - save accessibility tree output;
  - save element index mappings;
  - save app/window metadata.
- Compare how state changes after:
  - focus changes;
  - window movement;
  - text input;
  - scroll position changes;
  - modal dialogs;
  - multiple windows.
- Identify coordinate systems:
  - screenshot pixel coordinates;
  - screen coordinates;
  - window-relative coordinates;
  - element bounds.
- Identify element indexing rules:
  - stable per call or stable across calls;
  - depth-first or layout-dependent;
  - hidden/disabled element handling;
  - text node treatment.

### Feasible Methods

- Use the native CUA as oracle.
- Save state snapshots before and after deterministic UI actions.
- Use macOS Accessibility Inspector to compare AX attributes.
- Write a diff tool for state JSON outputs.

### Verification Goals

- State payload fields are documented.
- Screenshot dimensions and coordinate semantics are understood.
- Element index behavior is predictable enough to reproduce.
- Accessibility tree fields are mapped to macOS AX attributes where possible.

### Deliverables

- Fixture state corpus:

```text
fixtures/<app>/<case>/native-state.json
fixtures/<app>/<case>/screenshot.png
fixtures/<app>/<case>/notes.md
```

- `STATE_MODEL.md`
- Coordinate-system reference.
- Element-indexing reference.

### Risks and Notes

- `get_app_state` is the hardest and most important compatibility surface.
- If state format diverges too much, agents may fail even if action tools work.
- Some apps expose poor Accessibility trees; screenshot plus coordinates may be
  needed as fallback.
- Raw hosted-proxy capture is on hold: even after rewriting
  `params._meta.plugin_id` from `computer-use-proxy@personal` to
  `computer-use@openai-bundled`, the proxied Calculator `get_app_state` call
  accepts app approval and then times out without returning state. Existing
  hosted fixture observations are enough to continue with the reimplementation
  skeleton.

## Milestone 5: Minimal Reimplementation Skeleton

Status: Complete as of 2026-06-12. A Node.js stdio MCP skeleton exists under
`src/server.mjs` and is configured in `.mcp.json`.

### Purpose

Create an independent MCP server that exposes the discovered tool surface.

### Work Items

- Choose implementation stack:
  - Node.js MCP server plus Swift helpers;
  - Swift MCP server;
  - Python MCP server plus native helpers.
- Implement MCP lifecycle:
  - `initialize`;
  - `notifications/initialized`;
  - `tools/list`;
  - `tools/call`.
- Stub all discovered Computer Use tools.
- Match basic schemas or document intentional deviations.
- Return structured "not implemented" errors for unimplemented tools.

### Feasible Methods

- Start with Node.js for MCP framing and child-process orchestration.
- Use Swift command-line helpers for macOS Accessibility and screenshots.
- Keep protocol and macOS adapter layers separate.

### Verification Goals

- Codex or a standalone MCP client can connect to the server. Complete for the
  standalone probe.
- `tools/list` returns the expected tool names. Complete: the skeleton returns
  the 10 native tool names captured in `protocol/tools-list.json`.
- Stub calls return deterministic JSON-RPC responses. Complete for
  `list_apps` and the `get_app_state` not-implemented path.
- No GUI action occurs during skeleton tests. Complete for
  `scripts/probe-reimplementation-mcp.mjs`.

### Deliverables

- `src/server.*`
- `src/tools/*`
- `src/mac-adapter.*`
- `.mcp.json`
- Basic protocol tests.

Current artifacts:

```text
src/server.mjs
src/tools/catalog.mjs
src/mac-adapter.mjs
.mcp.json
scripts/probe-reimplementation-mcp.mjs
reports/local-mcp-skeleton-probe.json
reports/local-mcp-skeleton-probe.jsonl
```

### Risks and Notes

- Matching MCP transport behavior matters before native GUI work begins.
- Keep the initial skeleton simple; avoid mixing protocol discovery and GUI
  implementation in the same code.

## Milestone 6: macOS Accessibility State Reader

Status: Initial implementation complete as of 2026-06-15; fixture diffing
against hosted native Computer Use remains open. A Swift helper at
`src/ax-state.swift` can list filtered user-facing running apps, resolve app
names/bundle IDs/paths, launch known app bundles when needed, and return a
bounded AX tree for `get_app_state`. `npm run probe:local` verifies the local
MCP path against a readable app, and
`LOCAL_CUA_PROBE_APP=Calculator npm run probe:local` verifies the Calculator
fixture path. See `docs/milestone-6-local-ax-reader.md`.

### Purpose

Implement the core of `get_app_state`: app/window discovery and AX tree reading.

### Work Items

- Implement app resolution:
  - app name;
  - bundle identifier;
  - running process;
  - frontmost app fallback.
- Use `AXUIElementCreateApplication(pid)` to read app-level UI.
- Recursively read AX attributes:
  - role;
  - title;
  - value;
  - description;
  - enabled/focused state;
  - position and size;
  - actions;
  - children.
- Add recursion limits and cycle protection.
- Normalize values into the state model discovered in Milestone 4.
- Assign element indexes in a deterministic way.
- Return useful errors for:
  - app not running;
  - no accessibility permission;
  - window unavailable;
  - AX timeouts.

### Feasible Methods

- Write Swift helpers such as:

```text
src/ax-state.swift
src/app-resolve.swift
```

- Call helpers from the MCP server and parse JSON output.
- Compare outputs against native CUA state snapshots.

### Verification Goals

- Calculator state includes buttons with stable indexes and labels. Initial
  local AX tree capture is working; fixture diffing against native CUA remains.
- TextEdit state includes editable text areas. Local AX reader support is
  implemented; fixture-specific diffing remains.
- Chrome state includes address bar or page controls where AX exposes them.
  Local AX reader support is implemented; browser-specific diffing remains.
- Permission errors are clear and machine-readable for missing Accessibility
  permission and helper failures.

### Deliverables

- AX state helper. Initial implementation complete in `src/ax-state.swift`.
- State normalization layer. Initial bounded JSON normalization is implemented
  for role/title/value/description/position/size/actions/children.
- Local `list_apps` implementation. Initial filtered running-app output is
  implemented; native-style recent-app usage metadata remains open.
- Fixture comparisons against native CUA remain open.

### Risks and Notes

- AX trees vary significantly across apps.
- Some controls may be present visually but weakly exposed through AX.
- Index stability across calls is hard; document the chosen strategy.

## Milestone 7: Screenshot and Coordinate Capture

Status: Initial implementation complete as of 2026-06-15; overlay tooling is
available, while multi-display validation and click-coordinate validation remain
open.
`get_app_state` now includes a `screenshot` object with a PNG file path,
dimensions, CoreGraphics window ID, window frame, display-scale estimate, and
coordinate-system notes. See
`docs/milestone-7-screenshot-coordinate-capture.md`.

### Purpose

Add visual state so agents can reason about UI even when AX data is incomplete.

### Work Items

- Capture target window screenshot. Initial implementation complete via
  `/usr/sbin/screencapture -x -l <windowID>`.
- Capture metadata:
  - screenshot width and height; initial implementation complete.
  - window frame; initial implementation complete from CoreGraphics window
    bounds.
  - display scale; initial estimate complete from screenshot pixels divided by
    window-frame points.
  - screen origin; documented as top-left for current payload.
  - app/window identifier; initial `windowID` included.
- Decide output encoding:
  - file path; initial implementation complete under `.build/screenshots/`.
  - base64 image;
  - binary MCP content if supported.
- Align screenshot coordinates with element bounds.
- Add an overlay/debug tool for element bounds. Initial implementation complete
  in `scripts/render-bounds-overlay.mjs`.
- Test retina display scaling and multiple-monitor setups.

### Feasible Methods

- Use ScreenCaptureKit where possible.
- Consider `CGWindowListCreateImage` for simpler window snapshots if suitable.
- Use fixture images to verify bounds and coordinates.

### Verification Goals

- Returned screenshot is nonblank and corresponds to the target app/window.
  Initial probe verifies PNG existence, header, and positive dimensions.
- Clicking by returned coordinates lands at the intended visual point.
- Element bounds overlay correctly on screenshots. Initial SVG overlay
  generation is implemented and verified by the local probe.
- Retina scaling does not produce off-by-two coordinate bugs.

### Deliverables

- Screenshot capture path. Initial implementation is in `src/ax-state.swift`.
- Screenshot metadata schema. Initial JSON object returned under
  `get_app_state.screenshot`.
- Overlay/debug tool for element bounds. Initial implementation complete in
  `scripts/render-bounds-overlay.mjs`.

### Risks and Notes

- Screen Recording permission is required.
- Minimized or occluded windows may behave differently depending on capture API.
- Multi-display coordinate systems can be surprisingly easy to get wrong.

## Milestone 8: Action Tool Implementation

Status: Initial implementation complete as of 2026-06-15. All action tools are
wired through the local MCP server and accepted against the current Calculator,
TextEdit, Chrome, and Finder fixtures. See
`docs/milestone-8-action-tools.md`.

### Purpose

Implement GUI actions with macOS-native APIs.

### Work Items

- Implement `click`:
  - by element index;
  - by absolute/screenshot coordinates;
  - with click count and mouse button if schema supports it.
- Implement `type_text`:
  - text insertion through keyboard events or AX value setting where appropriate.
- Implement `press_key`:
  - key names;
  - modifier combinations;
  - navigation keys;
  - function keys where needed.
- Implement `scroll`:
  - element-targeted scroll;
  - window-level fallback;
  - page count or delta normalization.
- Implement `drag`:
  - coordinates;
  - timing;
  - mouse down/move/up.
- Implement `set_value`:
  - AX settable value path;
  - fallback behavior when unsupported.
- Implement `select_text`:
  - full text selection;
  - cursor before/after;
  - disambiguation with prefix/suffix.
- Implement `perform_secondary_action`:
  - map exposed AX actions to tool-callable names.

### Feasible Methods

- Use AX actions first when they are semantically available.
- Use CGEvent for lower-level mouse and keyboard events.
- Refocus the target app/window before actions.
- Re-read state after actions in tests.

### Verification Goals

- Calculator smoke test can press buttons and verify a result.
- TextEdit smoke test can type, select, replace, and save text.
- Browser smoke test can operate stable browser chrome and scroll page content.
- Action errors distinguish "bad element", "unsupported action", and
  "permission/app unavailable".

### Deliverables

- Action helper implementation.
- Per-tool behavior documentation.
- Smoke tests for every action tool.

### Risks and Notes

- AX actions are more semantic but inconsistent across apps.
- CGEvent is more general but can be fragile around focus and coordinates.
- Keyboard layouts and IME state can affect text input.

## Milestone 9: Permission and Approval Model

Status: Complete for the local reimplementation as of 2026-06-15. The local MCP
server now loads `config/app-policy.toml`, resolves app identity, applies
denied/allowed app policy, checks persisted/manual approval state, verifies
Accessibility and Screen Recording permission with the Swift helper, and
includes an M9 acceptance probe. See
`docs/milestone-9-permission-approval-model.md`.

### Purpose

Make the reimplementation safe and predictable.

### Work Items

- Detect Accessibility permission.
- Detect Screen Recording permission.
- Return explicit permission-pending errors.
- Implement app allow/deny policy:

```toml
[apps]
allowed = ["Calculator", "TextEdit"]
denied = ["Terminal", "Codex"]
```

- Block or warn on sensitive apps by default.
- Prevent automation of terminal apps and Codex itself if matching native safety
  behavior is desired.
- Add an approval callback or manual allowlist mechanism.

### Feasible Methods

- Use macOS APIs for permission checks where available.
- Maintain local config under the replacement plugin directory.
- Keep safety checks in the MCP layer before native actions execute.

### Verification Goals

- Missing Accessibility returns a clear error.
- Missing Screen Recording returns a clear error.
- Denied apps cannot be acted on.
- Allowed apps can proceed without repeated prompts.
- Tests can run in a controlled allowlist mode.

### Deliverables

- Permission-check module.
- App policy config.
- Safety/error documentation.

### Risks and Notes

- A reimplementation should not silently broaden what native Computer Use would
  refuse to do.
- App identity should use bundle identifier where possible, not only display
  name.

## Milestone 10: Native-vs-Reimplementation Diff Harness

Status: Split into M10.1/M10.2/M10.3 as of 2026-06-15. M10.1 is complete:
`npm run diff:m10:local` compares local MCP tool names, fixture state semantics,
and structured error behavior against stable expectations. M10.2 now has a
probe: `npm run probe:m10:host` replays hosted MCP context against the native
client and confirms that hosted initialize/tools metadata is not enough to make
real-app native state capture return. M10.3 now has Codex-hosted oracle semantic
diffs for Calculator, TextEdit, Chrome, and Finder; raw native-vs-local state
diffing remains deferred until raw native/proxy `get_app_state` capture can
return successfully after app approval. See
`docs/milestone-10-diff-harness.md`.

### Purpose

Continuously compare the replacement against native CUA behavior.

### Work Items

- Build a harness that can call:
  - native `SkyComputerUseClient mcp`;
  - replacement MCP server.
- Run the same tool calls against both when safe.
- Normalize volatile fields:
  - timestamps;
  - screenshot file paths;
  - transient element IDs;
  - window positions if not fixed.
- Compare:
  - tool schemas;
  - state tree shape;
  - error codes/messages;
  - action results;
  - screenshot dimensions;
  - element bounds.
- Store diffs by fixture and version.

### Feasible Methods

- Use JSONL request/response logs.
- Use semantic JSON diff rather than raw text diff.
- Create per-fixture expected thresholds.

### Verification Goals

- A single command can produce native-vs-reimplementation diffs.
- Regressions are visible when state shape or action behavior changes.
- Version upgrades of native Computer Use can be evaluated quickly.

### Deliverables

- `scripts/probe-native.*`
- `scripts/probe-reimplementation.*`
- `scripts/diff-fixtures.*`
- Diff reports under `reports/`.

### Risks and Notes

- Exact byte-for-byte compatibility is unlikely and unnecessary.
- The useful target is agent-level compatibility: can the caller reason and act
  successfully?

## Milestone 11: Fixture Test Suite

Status: Complete for the local automated fixture gate as of 2026-06-15. The command
`npm run test:m11:fixtures` covers all exposed tools at least once across
Calculator/TextEdit/Chrome/Finder state and action fixtures, plus missing-app,
denied-app, and malformed-click error behavior. Modal-dialog, multi-window, and
explicit missing-permission fixtures remain deferred follow-up coverage because
they are environment-sensitive rather than core local gate blockers; see
`docs/milestone-11-fixture-test-suite.md`.

### Purpose

Turn exploratory behavior into repeatable tests.

### Work Items

- Create deterministic fixture scenarios:
  - Calculator arithmetic;
  - TextEdit text editing;
  - browser form input;
  - browser scrolling;
  - modal dialog handling;
  - multi-window app selection;
  - denied app behavior;
  - missing permission behavior.
- For every fixture, define:
  - setup steps;
  - tool-call sequence;
  - expected app state;
  - cleanup steps.
- Add visual verification:
  - screenshot nonblank checks;
  - expected pixel-region checks where useful;
  - element-bound overlays for debugging.

### Feasible Methods

- Use AppleScript or shell to set up fixture apps before tests.
- Use the reimplementation MCP server for actions.
- Use screenshots and AX state after each action.

### Verification Goals

- Every action tool has at least one passing fixture.
- `get_app_state` is tested across multiple app types.
- Tests can be run after macOS or Codex updates.

### Deliverables

- Fixture runner.
- Test corpus.
- CI-compatible subset, if GUI environment exists.
- Manual test checklist for cases that cannot run headlessly.

### Risks and Notes

- GUI tests are inherently flaky without careful setup.
- Keep fixtures small and deterministic.
- Avoid relying on user-specific browser profiles unless explicitly testing
  signed-in browser behavior.

## Milestone 12: Codex Plugin Packaging

Status: Complete as of 2026-06-15. The bundle uses the distinct plugin name
`local-computer-use`, points `.codex-plugin/plugin.json` at `./.mcp.json` and
`./skills/`, starts the local MCP server through `node src/server.mjs` with
plugin-root cwd, is listed in the personal marketplace, and is installed/enabled
in Codex. A fresh-thread Codex smoke test verified `list_apps`,
`get_app_state(Calculator)`, and a Calculator action sequence ending with result
`3`; see `docs/milestone-12-codex-plugin-packaging.md`.

### Purpose

Package the replacement so Codex can load and call it as a plugin.

### Work Items

- Create plugin structure:

```text
.codex-plugin/plugin.json
.mcp.json
skills/computer-use/SKILL.md
bin/ or src/
```

- Define plugin metadata:
  - name;
  - version;
  - description;
  - MCP server path;
  - skill instructions;
  - safety notes.
- Ensure `.mcp.json` starts the replacement server.
- Install the plugin locally.
- Confirm Codex exposes replacement tools in a new thread.

### Feasible Methods

- Follow Codex plugin manifest conventions.
- Use a unique plugin name to avoid colliding with OpenAI bundled Computer Use.
- Start with a test plugin before attempting any replacement behavior.

### Verification Goals

- Codex lists or loads the plugin.
- MCP server starts successfully.
- Tools are callable from Codex.
- A basic fixture task can be completed through Codex using the replacement.

### Deliverables

- Local plugin bundle.
- Installation instructions.
- Codex smoke test transcript.

### Risks and Notes

- Do not overwrite the bundled OpenAI plugin.
- Keep plugin naming distinct, such as `local-computer-use`.
- Codex may prefer the official plugin if both expose similar names; document
  invocation instructions.

## Milestone 13: Error Semantics and Edge Cases

Status: Complete for the local reimplementation baseline as of 2026-06-15.
The MCP server now returns stable local error metadata, validates schema shape
before native dispatch, rejects out-of-bounds screenshot coordinates, and passes
`npm run test:m13:negative`. See `ERROR_MODEL.md` and
`docs/milestone-13-error-semantics.md`.

### Purpose

Make the replacement robust enough for real agent workflows.

### Work Items

- Catalog native CUA errors:
  - uninitialized MCP session;
  - app not found;
  - permission pending;
  - app approval denied;
  - invalid element index;
  - stale element index;
  - unsupported AX action;
  - screenshot failure;
  - target window changed.
- Implement equivalent or clearly documented errors.
- Add recovery guidance in error messages where helpful.
- Test interrupted workflows:
  - user moves mouse;
  - app closes mid-action;
  - focus changes;
  - modal appears;
  - display sleeps or locks.

### Feasible Methods

- Use native probe logs as oracle.
- Use controlled negative tests.
- Keep stable machine-readable error codes with human-readable messages.

### Verification Goals

- Agents receive actionable errors.
- Invalid calls do not leave the desktop in a bad state.
- State can be refreshed after recoverable errors.

### Deliverables

- `ERROR_MODEL.md`
- Negative test suite.
- Recovery behavior documentation.

### Risks and Notes

- Error behavior can matter as much as success behavior for agents.
- Overly generic errors make autonomous recovery difficult.

## Milestone 14: Version Tracking and Maintenance

Status: Complete for the first native-version tracking baseline as of
2026-06-15. The command `npm run snapshot:m14:native` captures native Computer
Use `1.0.809` into `snapshots/native/1.0.809`, writes a diff baseline, and
updates `docs/native-version-changelog.md` plus `docs/compatibility-matrix.md`.
See `docs/milestone-14-version-tracking.md`.

### Purpose

Keep the implementation useful as native Computer Use and Codex evolve.

### Work Items

- Record native plugin version on every probe.
- Save:
  - `.mcp.json`;
  - `plugin.json`;
  - `tools/list`;
  - state snapshots;
  - error catalog;
  - binary metadata summaries.
- Build a version-diff report.
- Run smoke tests after:
  - Codex app update;
  - Computer Use plugin update;
  - macOS update;
  - display/permission changes.

### Feasible Methods

- Use a `snapshots/native/<version>/` directory.
- Automate capture with a single script.
- Keep fixture outputs small enough to review.

### Verification Goals

- A native update can be compared against the previous known version.
- The replacement can be updated based on observed diffs.
- Compatibility claims always mention the native version used for comparison.

### Deliverables

- Version snapshot system.
- Changelog.
- Compatibility matrix.

### Risks and Notes

- Native behavior may change without public notice.
- A replacement should expose its own version and native-compatibility target.

## Suggested Execution Order

Recommended order:

```text
0. Scope and boundaries
1. Entrypoint mapping
2. Native static profile
3. MCP protocol discovery
4. State model discovery
5. Minimal MCP skeleton
6. Accessibility state reader
7. Screenshot and coordinate capture
8. Action tool implementation
9. Permission and approval model
10. Native-vs-reimplementation diff harness
11. Fixture test suite
12. Codex plugin packaging
13. Error semantics and edge cases
14. Version tracking and maintenance
```

The most important dependency is that `get_app_state` should be understood
before action tools are deeply implemented. Actions can be made to click and
type relatively early, but agents become reliable only when the state payload,
element indexes, coordinates, and error semantics are coherent.

## Minimum Viable Reimplementation

The smallest useful version is:

- MCP server starts and returns `tools/list`;
- `get_app_state` returns:
  - app/window metadata;
  - screenshot;
  - simplified accessibility tree;
  - stable element indexes for common controls;
- `click`, `type_text`, `press_key`, and `scroll` work in Calculator, TextEdit,
  and one browser;
- permission errors are explicit;
- denied apps are blocked;
- fixture smoke tests are repeatable.

That version would not be fully native-compatible, but it would be useful enough
to validate the architecture and drive agent workflows.

## High-Risk Areas

### `get_app_state`

This is the highest-risk area. The agent's next action depends on state quality.
Poor element indexing, missing bounds, or mismatched coordinate systems will
make otherwise working actions unreliable.

### Coordinate Systems

Retina scaling, multiple displays, window shadows, title bars, and screenshot
cropping can all create coordinate bugs. Build visual overlays early.

### Focus and Timing

macOS GUI automation is sensitive to focus, animations, modal dialogs, and app
latency. Tests should re-read state after every action.

### Text Input

Text input may differ by keyboard layout, IME, secure text fields, and app
implementation. Prefer semantic AX setting when safe and fall back to events
where needed.

### Permission State

Accessibility and Screen Recording permissions can be pending, denied, or
granted. Treat these as first-class states, not generic failures.

## Final Acceptance Criteria

A strong reimplementation should satisfy these criteria:

- Codex can connect to it as an MCP server.
- The exposed tool schemas are documented and stable.
- `get_app_state` is useful across at least five fixture apps.
- Core actions work through native macOS APIs.
- Safety and app-deny policies are enforced before actions execute.
- Native-vs-reimplementation diffs are captured and reviewed.
- Every supported tool has at least one fixture test.
- Known incompatibilities with native Computer Use are documented.
