# Milestone 27 Native-Shaped Bundle Layout

Date: 2026-06-17

Status: Complete for the first native-shaped bundle layout. M27 wraps the M26
resident app-host path in generated app-bundle entrypoints that more closely
match the observed Codex Computer Use shape.

## Purpose

Move from a source-level app host and bridge:

```text
node src/app-host.mjs
node src/app-bridge.mjs
```

to a generated bundle layout:

```text
Local Computer Use Dev Manager.app
  Contents/MacOS/LocalComputerUseService
  Contents/SharedSupport/LocalComputerUseClient.app
    Contents/MacOS/LocalComputerUseClient
```

The MCP entry now invokes:

```text
LocalComputerUseClient mcp
```

This mirrors the native pattern where Codex invokes `SkyComputerUseClient mcp`.

## Implementation

- `scripts/build-m22-dev-manager-app.sh` now generates:
  - `Contents/MacOS/LocalComputerUseService`;
  - `Contents/SharedSupport/LocalComputerUseClient.app`;
  - `Contents/SharedSupport/LocalComputerUseClient.app/Contents/MacOS/LocalComputerUseClient`.
- `apps/LocalComputerUseDevManager/LocalComputerUseClient.Info.plist` defines
  the generated client app metadata.
- `.mcp.json` now points at the generated client executable with `args: ["mcp"]`.
- The Dev Manager app starts `LocalComputerUseService` from inside its bundle
  when available, falling back to the source-level host during development.
- `scripts/probe-m27-native-bundle-layout.mjs` verifies the bundle layout and
  MCP `tools/list` through the bundled client.

## Verification

Accepted local command:

```bash
npm run verify:m27:native-bundle
```

Accepted result:

```text
M27 native bundle layout probe passed: tools=10
M24 plugin flow probe passed: local-computer-use@0.1.0, tools=10
```

## Boundaries

M27 uses generated executable wrappers around the existing Node implementation.
It does not yet replace the client or service with compiled native binaries.

Client subcommands beyond `mcp`, stronger service lifecycle semantics, installer
flow, event-stream, turn-ended, and native capture consolidation remain later
milestones.
