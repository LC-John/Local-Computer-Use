# Local Computer Use Dev Manager App Handoff

Date: 2026-06-17

This document is the handoff for the first Dev Manager App track release. The
app is a developer control panel around the existing `local-computer-use` plugin
and MCP server.

## What It Is

```text
Local Computer Use Dev Manager.app
```

The app helps a developer:

- inspect repo and plugin status;
- check Accessibility and Screen Recording permissions;
- run smoke tests and fixture gates;
- validate plugin manifest and local MCP startup;
- open docs and reports.

It does not replace the Codex plugin. It does not host a socket, HTTP, or
multi-client MCP server.

## Runtime Boundary

The agent-facing runtime remains:

```text
Codex plugin -> node src/server.mjs -> .build/ax-state serve
```

The app-facing runtime is:

```text
Dev Manager App -> shell out to npm scripts -> reports/docs
```

## Build

```bash
cd /Users/lczhang/Documents/computer-use
npm run build:m22:app
```

Output:

```text
.build/Local Computer Use Dev Manager.app
```

The generated `.app` is not tracked in git.

## Verify

Quick app-track verification:

```bash
npm run verify:m25:app-track
```

Equivalent expanded commands:

```bash
npm run build:m22:app
npm run probe:m22:app
npm run probe:m23:diagnostics-ui
npm run probe:m24:plugin-flow
```

Optional heavier gates:

```bash
npm run test:m13:negative
npm run test:followups
npm run test:m11:fixtures
```

## Open

```bash
open ".build/Local Computer Use Dev Manager.app"
```

## Agent Readiness

The app can confirm that the local plugin path and MCP smoke path are healthy,
but the app itself is not the MCP endpoint. Agent readiness still depends on the
`local-computer-use` plugin being installed/enabled and a fresh Codex thread
loading the plugin tools.

Manual plugin reinstall:

```bash
codex plugin add local-computer-use@personal
```

After reinstalling or changing plugin metadata, open a fresh Codex thread.

## Current Track Status

```text
M21: Dev Manager App scope and architecture complete
M22: Minimal SwiftUI app shell complete
M23: Diagnostics and test runner UI complete
M24: Plugin validate and smoke flow complete
M25: Packaging polish and handoff complete
```

## Known Non-Goals

- No multi-client MCP host.
- No socket or HTTP MCP transport.
- No launchd/system daemon.
- No locked computer use.
- No automatic macOS permission prompt approval.
- No replacement for OpenAI's bundled `computer-use` plugin.
