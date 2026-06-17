# Milestone 25 Packaging Polish and Handoff

Date: 2026-06-17

Status: Complete for the first Dev Manager App track handoff. M25 adds a single
verification command and a handoff document for building, opening, and validating
the local app.

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
```

## Boundary

The app remains a developer manager around the existing plugin. It is not a
replacement MCP host and does not change how agents connect to
`local-computer-use`.

The generated app bundle remains:

```text
.build/Local Computer Use Dev Manager.app
```

Generated build artifacts stay out of git.
