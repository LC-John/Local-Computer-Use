# Milestone 25 Packaging Polish and Handoff

Date: 2026-06-17

Status: Complete for the first Dev Manager App track handoff. M25 adds a single
verification command and a handoff document for building, opening, and validating
the local app. M26 later extends this handoff by making the app a resident MCP
host.

## Purpose

M21-M24 built the scoped Dev Manager App track. M25 makes the result easy to
handoff and re-verify without rereading every milestone document.

## Implementation

New handoff:

```text
docs/dev-manager-app-handoff.md
```

New verification command:

```bash
npm run verify:m25:app-track
```

The verification command runs:

```bash
npm run build:m22:app
npm run probe:m22:app
npm run probe:m23:diagnostics-ui
npm run probe:m24:plugin-flow
```

## Accepted Result

```text
M25 app track verification passed.
```

## Current Dev Manager App Track Status

```text
M21: scope and architecture complete
M22: minimal SwiftUI app shell complete
M23: diagnostics and test runner UI complete
M24: plugin validate and smoke flow complete
M25: packaging polish and handoff complete
M26: resident app-host MCP path complete
```

## Boundary

M25 originally kept the app as a developer manager around the existing plugin.
M26 changes that boundary: the app now starts a resident local host, and the
plugin uses a stdio bridge to forward MCP traffic to it.

The generated app bundle remains:

```text
.build/Local Computer Use Dev Manager.app
```

Generated build artifacts stay out of git.
