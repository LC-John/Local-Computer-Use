# Milestone 21 Dev Manager App Scope

Date: 2026-06-17

Status: Complete for scope and architecture. M21 starts the Dev Manager App
track. The app should productize the current developer tooling and diagnostics
without replacing the existing Codex plugin transport.

## Decision

Build a lightweight macOS developer manager app for Local Computer Use.

The app is a control panel for the existing implementation:

```text
Local Computer Use Dev Manager.app
  -> checks repo/plugin status
  -> validates macOS permissions
  -> runs probes and fixture tests
  -> opens reports, logs, and docs
  -> helps reinstall or validate the local plugin
```

It does not become a new multi-client Computer Use daemon in the first track.
The current runtime remains:

```text
Codex plugin
  -> stdio MCP server: node src/server.mjs
      -> persistent Swift AX helper: .build/ax-state serve
```

## Official Shape Alignment

The bundled OpenAI Computer Use plugin is app-shaped. The local installation
observed on 2026-06-17 contains:

```text
Codex Computer Use.app
  Contents/MacOS/SkyComputerUseService
  Contents/SharedSupport/SkyComputerUseClient.app
  Contents/SharedSupport/Codex Computer Use Installer.app
  Contents/SharedSupport/CUALockScreenGuardian.app
```

Its MCP entry invokes the bundled client app:

```text
SkyComputerUseClient mcp
```

This confirms that app packaging is a reasonable direction. The local project
will not copy the full service/locked-use architecture in this phase. M21-M25
only app-ize the development and diagnostics surface around the current MCP
server.

## Goals

- Give developers a visible place to see whether Local Computer Use is healthy.
- Make permission status obvious: Accessibility and Screen Recording.
- Make routine validation one click away: smoke tests, M11, M13, follow-ups,
  M18/M20 probes.
- Make reports and milestone docs discoverable from a UI.
- Make plugin validation/reinstall safer and more repeatable.
- Keep Codex plugin behavior unchanged unless a later milestone explicitly
  changes it.

## Non-Goals

- Do not replace stdio MCP transport.
- Do not introduce socket, HTTP, or multi-client MCP hosting.
- Do not create a launchd/system daemon.
- Do not implement locked computer use.
- Do not automate security/privacy permission prompts.
- Do not rename or replace the bundled OpenAI `computer-use` plugin.
- Do not change `get_app_state` default behavior.

## M22 Technical Direction

M22 should build the minimal app shell:

- SwiftUI macOS app.
- A status screen with repo path, plugin path, and current git commit.
- Permission indicators for Accessibility and Screen Recording.
- Buttons that run read-only diagnostics:
  - `npm run probe:local`
  - `npm run probe:m20:state-policy`
  - plugin manifest validation
- Links to open `reports/` and `docs/`.

The first app can shell out to existing scripts. It should not host the MCP
server itself unless a later milestone proves that is necessary.

## Proposed App Track

```text
M21: Dev Manager App scope and architecture
M22: Minimal SwiftUI app shell
M23: Diagnostics and test runner UI
M24: Plugin install, validate, and smoke flow
M25: Packaging polish and handoff docs
```

## Acceptance

M21 is complete because:

- this document defines goals and non-goals;
- the total milestone document lists the Dev Manager App track;
- M22 has a narrow implementation target;
- existing M0-M20 core MCP milestones remain intact.
