# Native MCP Protocol Snapshot

Date: 2026-06-12

This directory contains the Milestone 3 protocol discovery artifacts captured
from the native Computer Use MCP entrypoint:

```text
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient mcp
```

## Captured Artifacts

- `initialize-response.json`: MCP initialize response, including server
  capabilities and server version.
- `tools-list.json`: Native `tools/list` response. This is the authoritative
  tool inventory for this snapshot.
- `schemas/*.json`: One input schema per discovered tool.
- `request-response-samples.jsonl`: Raw probe requests, responses, stderr, and
  timeout records.
- `tool-coverage.md`: Coverage matrix generated from `tools-list.json`.
- `error-catalog.md`: Human-readable summary of read-only and intentionally
  invalid probes.
- `error-catalog.raw.json`: Structured form of the error catalog.
- `stderr.log`: Native process stderr captured during probes.

## Discovered Tools

The native server exposed 10 tools in this snapshot:

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

`list_apps` was discovered in the native `tools/list` response and should be
included in future compatibility tracking.

## Probe Scope

Milestone 3 intentionally avoids valid action calls because those operate the
real desktop. This snapshot covers:

- MCP initialization;
- `notifications/initialized`;
- `tools/list`;
- per-tool input schema capture;
- missing required argument probes where applicable;
- invalid argument probes;
- invalid tool-name behavior.

Valid action behavior is deferred to fixture-based milestones.

## Notable Findings

- The server reports the protocol version `2025-03-26`.
- The server reports `capabilities.tools.listChanged = false`.
- Most invalid or missing required argument calls return a tool result with
  `isError: true` rather than a JSON-RPC-level error.
- Unknown tool names return a tool result error with text beginning
  `Unknown tool:`.
- Direct `list_apps` `tools/call` probes timed out in this environment even
  with a 20 second timeout. The schema was still captured from `tools/list`.
