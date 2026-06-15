# Milestone 10 Diff Harness

Date: 2026-06-15

Status: Initial local fixture diff harness complete. Native-vs-local state
diffing remains deferred until raw native/proxy `get_app_state` capture can
return successfully after app approval.

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
