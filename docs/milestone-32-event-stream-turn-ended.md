# Milestone 32 Event Stream and Turn-Ended Integration

Date: 2026-06-17

Status: Complete for the first event-stream and turn-ended integration pass.
M32 connects the service and client to a privacy-safe local event log.

## Purpose

Bring the local client surface closer to the native shape where the client has
`event-stream` and `turn-ended` entrypoints in addition to `mcp`.

## Implementation

- `src/app-host.mjs` writes service events:
  - `service-started`;
  - `session-opened`;
  - `session-closed`;
  - `service-stopping`.
- `src/client-cli.mjs mcp` records `bridge-connected`.
- `src/client-cli.mjs turn-ended` records `turn-ended` in both the client event
  log and service event log.
- `src/client-cli.mjs event-stream` returns current status plus recent service
  events.
- `event-stream --follow` continues emitting heartbeat events for manual
  diagnostics.
- The Dev Manager app exposes an Event Stream diagnostic button.
- `scripts/probe-m32-event-stream-turn-ended.mjs` verifies the service/client
  event path.

## Verification

Accepted local command:

```bash
npm run verify:m32:event-stream
```

Accepted result:

```text
M32 event stream and turn-ended probe passed: events=9
M31 permission onboarding probe passed.
```

The probe verifies:

- service startup is recorded;
- bridge connection is recorded;
- MCP session open/close is recorded;
- turn-ended is recorded;
- event-stream returns recent events including turn-ended.

## Boundaries

M32 keeps event payloads privacy-safe by default. It does not record AX trees,
screenshots, tool arguments, or user-visible text.

This is still a local file-backed event stream, not a full native event bus.
Native consolidation remains M33 work.
