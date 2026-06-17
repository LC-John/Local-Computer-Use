# Milestone 33 Native Capture and Automation Consolidation

Date: 2026-06-17

Status: Complete for the first consolidation guardrail pass. M33 records and
verifies the current native boundary rather than attempting a risky full Swift
rewrite in one step.

## Purpose

Reduce ambiguity around the native-shaped architecture after M27-M32:

```text
Codex plugin
  -> LocalComputerUseClient mcp
    -> LocalComputerUseService
      -> node src/server.mjs
        -> long-lived Swift AX helper: .build/ax-state serve
```

## Decision

For this pass:

- keep `src/server.mjs` as the MCP protocol layer;
- keep `src/ax-state.swift serve` as the long-lived native automation boundary;
- keep `screencapture -l` as the current verified screenshot path;
- defer a ScreenCaptureKit migration until it can be tested without regressing
  screenshots and coordinate mapping;
- preserve all current MCP schemas and fixture gates.

## Implementation

- `scripts/probe-m33-native-consolidation.mjs` verifies the architecture
  guardrails:
  - Node remains the MCP protocol boundary;
  - the Swift helper defaults to persistent mode;
  - the Swift helper has `serve` mode;
  - the generated bundle has service and client wrappers;
  - `.mcp.json` uses the bundled client;
  - the current screenshot path is still the verified `screencapture` path.
- `verify:m33:native-consolidation` runs the M33 probe plus M32 event-stream
  regression.

## Verification

Accepted local command:

```bash
npm run verify:m33:native-consolidation
```

Accepted result:

```text
M33 native consolidation probe passed.
M32 event stream and turn-ended probe passed: events=...
```

## Boundaries

M33 does not claim a full native rewrite. A compiled native client/service and a
ScreenCaptureKit screenshot implementation remain future work.

The value of M33 is preventing architecture drift while the app shape continues
to mature.
