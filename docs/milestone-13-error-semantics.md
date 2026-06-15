# Milestone 13 Error Semantics and Edge Cases

Date: 2026-06-15

Status: Complete for the local reimplementation baseline. The local MCP server
now returns stable error codes, severity, retryability, and recovery guidance for
protocol, schema, policy, permission, action, coordinate, and app-close recovery
cases.

## Purpose

Milestone 13 makes failures useful for real agent workflows. An agent should be
able to distinguish malformed input from recoverable stale state and from
blocked permission or policy conditions.

## Implemented Behavior

Tool errors now include these metadata fields:

```text
local-computer-use/status
local-computer-use/errorCode
local-computer-use/errorSeverity
local-computer-use/retryable
local-computer-use/recoveryHint
```

Pre-initialization JSON-RPC errors carry the same local metadata in
`error.data`.

The server validates argument object shape before dispatching to app policy or
the native helper. This catches unexpected arguments, wrong argument types, and
invalid enum values without launching or focusing an app.

Screenshot coordinate mapping now rejects points outside the screenshot pixel
bounds before emitting mouse events.

## Negative Test Suite

Run:

```bash
npm run test:m13:negative
```

Current accepted output:

```text
Local MCP M13 negative error suite passed.
```

The suite writes:

```text
reports/m13-negative-tests.json
reports/m13-negative-tests.jsonl
reports/m13-approval-required.jsonl
```

## Coverage

The M13 suite covers:

- protocol errors: `server_not_initialized`, `unknown_tool`;
- schema errors: `missing_required_argument`, `invalid_arguments`,
  `invalid_argument_type`, `unexpected_argument`, `invalid_argument_value`;
- policy and permission errors: `approval_required`,
  `accessibility_permission_missing`, `screen_recording_permission_missing`;
- action errors: `element_not_found`, `unsupported_action`,
  `unsupported_direction`, `unsupported_key`, `coordinate_mapping_failed`;
- recovery behavior after a target app closes, followed by a successful
  `get_app_state` refresh on Calculator.

## Recovery Rules

Recoverable errors tell the caller to refresh app state, approve the target app,
grant permissions, bring the target window back, or retry after a transient
condition changes.

Fatal errors tell the caller to change the request itself: tool name, argument
shape, argument type, enum value, key name, direction, or requested AX action.

Blocked errors require explicit user or environment action, such as changing
policy or granting macOS permissions.

The canonical reference is `ERROR_MODEL.md`.

## Follow-Ups

These are intentionally left for later compatibility and maintenance work:

- native-oracle comparison for every error string and code once raw native
  state/error capture is available again;
- modal-dialog specific fixtures;
- display sleep or lock fixtures;
- multi-window target-window-changed fixtures.
