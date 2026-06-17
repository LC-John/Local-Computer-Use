# Milestone 26 Resident App Host

Date: 2026-06-17

Status: Complete for the first resident app-host MCP path. M26 changed the
local plugin entry from a direct `src/server.mjs` process to a stdio bridge that
connects to a long-running app host socket. M27 later wrapped that bridge in a
native-shaped bundled client app.

## Purpose

Make Local Computer Use app-shaped in the way this project now needs:

```text
Agent / Codex
  -> local-computer-use plugin
    -> node src/app-bridge.mjs
      -> Local Computer Use Dev Manager.app host socket
        -> per-session node src/server.mjs
          -> .build/ax-state serve
            -> macOS Accessibility / screenshot / action APIs
```

The agent still speaks MCP over stdio. The bridge preserves that contract while
moving the durable runtime boundary into the resident app host.

## Implementation

- `src/app-host.mjs` listens on a per-user Unix socket under the system temp
  directory.
- `src/app-bridge.mjs` is the plugin-facing stdio process and forwards JSON-RPC
  traffic to the app host socket.
- M26 pointed `local-computer-use` at `src/app-bridge.mjs`; M27 updates that
  entry to the bundled `LocalComputerUseClient mcp` wrapper.
- The Dev Manager app starts `node src/app-host.mjs` on launch and shows the
  host socket in status.
- `probe:m24:plugin-flow` now validates the bridge-backed plugin smoke path.
- `probe:m26:app-host` starts a test host, connects through the bridge, and
  verifies MCP `tools/list`.
- `verify:m26:resident-app` builds the app and runs the M26/M24 smoke checks.

## Verification

Accepted local results:

```text
npm run probe:m26:app-host
M26 app host probe passed: socket=..., tools=10

npm run probe:m24:plugin-flow
M24 plugin flow probe passed: local-computer-use@0.1.0, tools=10
```

## Boundaries

M26 is a resident app host, not a launchd daemon. The app must be running, or
`npm run start:app-host` must be running, before the plugin bridge can connect.

Each bridge connection gets an isolated `src/server.mjs` session behind the app
host. This keeps existing MCP initialization semantics and policy caches scoped
to the agent session while making the app the durable process boundary.
