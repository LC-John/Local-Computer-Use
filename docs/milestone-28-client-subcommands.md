# Milestone 28 Client Subcommands

Date: 2026-06-17

Status: Complete for the first client subcommand surface. M28 turns the bundled
`LocalComputerUseClient` wrapper into a small CLI with explicit subcommands.

## Purpose

Move closer to the native `SkyComputerUseClient` shape, where Codex invokes a
client app with subcommands such as `mcp`, `event-stream`, and `turn-ended`.

The local client now supports:

```text
LocalComputerUseClient mcp
LocalComputerUseClient status
LocalComputerUseClient event-stream
LocalComputerUseClient turn-ended
```

## Implementation

- `src/client-cli.mjs` implements the client subcommand surface.
- The generated bundled client executable now delegates to `src/client-cli.mjs`.
- `mcp` preserves the existing stdio MCP bridge behavior.
- `status` prints privacy-safe JSON health data for the repo, socket path, and
  app-host reachability.
- `event-stream` prints a privacy-safe status event. `--follow` keeps emitting
  heartbeat events for manual diagnostics.
- `turn-ended` appends a small notification event to a JSONL report.
- Unknown subcommands exit with code `64` and print usage.

## Verification

Accepted local command:

```bash
npm run verify:m28:client-subcommands
```

Accepted result:

```text
M28 client subcommands probe passed: tools=10
M27 native bundle layout probe passed: tools=10
M24 plugin flow probe passed: local-computer-use@0.1.0, tools=10
```

The probe verifies:

- `LocalComputerUseClient mcp` returns the same MCP tools.
- `status` can reach the running app host.
- `event-stream` emits a status event.
- `turn-ended` records a notification event.
- an unknown subcommand fails with a stable usage error.

## Boundaries

M28 does not implement a native binary client. The generated app executable
still wraps Node code. Compiled native client/service consolidation remains M33.

M28 does not yet provide a long-running, multi-event service bus. The current
event stream is a diagnostic surface, with service lifecycle hardening deferred
to M29 and richer event integration deferred to M32.
