# Milestone 22 Dev Manager App Shell

Date: 2026-06-17

Status: Complete for the first minimal SwiftUI app shell. M22 creates a local
macOS app bundle that productizes the current developer diagnostics surface
without changing the MCP server runtime.

## Purpose

M21 defined the Dev Manager App track. M22 makes that track concrete with a
small macOS app that can show Local Computer Use status and run existing
read-only diagnostics.

The runtime remains unchanged:

```text
Codex plugin -> node src/server.mjs -> .build/ax-state serve
```

The app is not a daemon, socket server, or replacement MCP transport.

## Implementation

Source:

```text
apps/LocalComputerUseDevManager/LocalComputerUseDevManager.swift
apps/LocalComputerUseDevManager/Info.plist
```

Build script:

```bash
npm run build:m22:app
```

Generated app bundle:

```text
.build/Local Computer Use Dev Manager.app
```

The app currently shows:

- repo path;
- plugin symlink path;
- current git commit;
- Accessibility permission status;
- Screen Recording permission status.

It provides buttons for:

- `npm run probe:local`;
- `npm run probe:m20:state-policy`;
- plugin manifest validation;
- opening `docs/`;
- opening `reports/`.

## Verification

Run:

```bash
npm run build:m22:app
npm run probe:m22:app
node --check scripts/probe-m22-dev-manager-app.mjs
git diff --check
```

Accepted local result:

```text
M22 Dev Manager app probe passed: .build/Local Computer Use Dev Manager.app
```

GUI launch smoke also passed: `open -g` started the app process and the app quit
cleanly via its bundle identifier.

## Boundaries

M22 intentionally does not:

- host the MCP server inside the app;
- change `local-computer-use` plugin behavior;
- add launchd or background daemon behavior;
- implement multi-client access;
- automate macOS security/privacy prompts.

## Next Step

M23 should turn the shell into a richer diagnostics and test runner UI:

- clearer command status and durations;
- grouped smoke, fixture, and policy probes;
- saved command history;
- report previews or quick links to generated report files.
