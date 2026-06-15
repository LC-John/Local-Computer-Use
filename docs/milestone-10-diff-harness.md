# Milestone 10 Diff Harness

Date: 2026-06-15

Status: M10.1 local fixture diff harness complete. M10.2 hosted-context
emulation probe complete, with the native real-app state gap reproduced and
documented. M10.3 has Codex-hosted oracle semantic diffs for Calculator,
TextEdit, Chrome, and Finder; raw native-vs-local state diffing remains deferred
until raw native/proxy `get_app_state` capture can return successfully after app
approval.

## Split Milestones

### M10.1 Local Fixture Diff

Status: Complete.

The local backend produces stable semantic fixture reports and catches local
regressions without depending on native Computer Use state capture.

### M10.2 Hosted Context Emulation

Status: Probe complete, native state gap still open.

Goal: replay the closest observed Codex-hosted MCP context against the native
Computer Use client, identify what is still missing, and determine whether the
native backend can become a reliable oracle.

Run:

```bash
npm run probe:m10:host
```

The probe:

- reads the latest usable `computer-use-proxy` hosted capture;
- extracts hosted `initialize`, `tools/list`, and resource request shapes;
- starts native `SkyComputerUseClient mcp` with the hosted plugin cwd;
- replays the hosted initialization and metadata shape;
- checks `tools/list`, resource method behavior, invalid-app `get_app_state`,
  and real-app `get_app_state(Calculator)`;
- writes a report describing whether the native state gap remains.

Reports:

```text
reports/m10-host-context-probe.json
reports/m10-host-context-probe.jsonl
```

Current accepted result:

```text
M10.2 native host-context probe reproduced the native state gap.
```

The report confirms:

- hosted `initialize` parameters can be replayed directly;
- native `tools/list` succeeds with hosted `_meta.progressToken`;
- hosted resource/list calls still return expected `-32601` unsupported-method
  errors;
- invalid-app `get_app_state` returns the expected native tool error;
- real-app `get_app_state(Calculator)` triggers `elicitation/create`, accepts
  successfully, and then times out without returning a state payload.

### M10.3 Oracle-vs-Local Diff

Status: Codex-hosted oracle semantic diff complete for the accepted M7/M8
fixture set; raw native backend deferred.

The local diff harness now parses Codex-hosted fixture notes and compares local
state against stable hosted-oracle semantics:

- Calculator bundle identifier is `com.apple.calculator`;
- stable semantic IDs such as `One`, `Add`, `Equals`, and `StandardInputView`
  are present locally;
- TextEdit exposes the `First Text View` editable text area and fixture text;
- Chrome exposes the fixture page through an AX web area and page title text;
- Finder exposes the `FinderWindow` and `ListView` semantic IDs and list-view
  description;
- each compared local AX tree meets the hosted fixture's semantic node-count
  threshold.

Raw native-vs-local diffing becomes actionable when a future M10.2 follow-up can
obtain a successful native real-app state payload.

## Implemented Components

### Local fixture diff command

Run:

```bash
npm run diff:m10:local
```

The command starts the local MCP server and compares normalized local fixture
results against stable semantic expectations:

- `tools/list` exposes the same tool names captured under `protocol/`.
- Calculator `get_app_state` returns the expected app identity, screenshot
  metadata, and a sufficiently populated AX tree.
- Calculator, TextEdit, Chrome, and Finder local states match Codex-hosted
  oracle fixtures on stable semantic IDs, roles, text markers, and minimum tree
  shape.
- Unknown apps return `invalid_app`.
- Denied sensitive apps return `app_denied`.
- Malformed click calls on an allowed app return `missing_click_target`.

The harness normalizes volatile data instead of comparing raw JSON bytes. It
checks stable facts such as bundle identifier, screenshot availability, positive
image dimensions, AX node counts, and structured error codes.

## Reports

The command writes:

```text
reports/m10-local-fixture-diff.json
reports/m10-local-fixture-diff.jsonl
```

The JSON report contains:

- backend metadata;
- native backend status;
- hosted oracle status and source fixture list;
- fixture summary;
- per-fixture expected values;
- per-fixture normalized actual values;
- semantic diffs.

The JSONL report contains the MCP request/response transcript for the local
backend run.

## Native Backend Status

The native backend is intentionally not marked complete yet. Prior raw
native/proxy `get_app_state` attempts still time out after app approval in this
environment. M10 therefore starts with a local diff harness that can catch
regressions in the reimplementation while leaving the native backend as a clear
follow-up integration point.

## Verification

Current accepted output:

```text
Local MCP M10 fixture diff harness passed.
```

Current report summary:

```text
fixtureCount: 9
diffCount: 0
```
