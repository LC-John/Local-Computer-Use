# Milestone 24 Plugin Install, Validate, and Smoke Flow

Date: 2026-06-17

Status: Complete for the first plugin validation and smoke flow. M24 gives the
Dev Manager app and scripts a single check for whether the local plugin source,
manifest, symlink, and MCP smoke path are healthy.

## Purpose

M22/M23 made the Dev Manager app useful for diagnostics. M24 focuses on the
question that matters before an agent can use the local Computer Use tools:

```text
Is local-computer-use installed or installable, valid, and able to start MCP?
```

## Implementation

New script:

```bash
npm run probe:m24:plugin-flow
```

The probe checks:

- `.codex-plugin/plugin.json` identifies `local-computer-use`;
- `.mcp.json` points at the bundled `LocalComputerUseClient mcp` wrapper;
- `~/plugins/local-computer-use` exists and resolves to this repo;
- plugin manifest validation passes;
- local app host starts, the plugin bridge connects, and MCP returns expected
  tools such as `list_apps` and `get_app_state`;
- installed cache path is reported when present.

The generated report is metric/status only:

```text
reports/m24-plugin-flow.json
```

## Dev Manager App

The app now exposes a `Plugin Flow` button in the Plugin row. It runs:

```bash
npm run probe:m24:plugin-flow
```

This complements the existing manifest validation button. M24 does not perform
automatic reinstall from the app; it records the install command and fresh-thread
note in the report.

## Verification

Run:

```bash
npm run probe:m24:plugin-flow
npm run build:m22:app
npm run probe:m23:diagnostics-ui
npm run probe:m22:app
node --check scripts/probe-m24-plugin-flow.mjs
git diff --check
```

Accepted local result:

```text
M24 plugin flow probe passed: local-computer-use@0.1.0, tools=10
```

GUI launch smoke also passed after adding the Plugin Flow button.

## Boundaries

M24 does not:

- run `codex plugin add` automatically;
- modify marketplace entries;
- replace the stdio MCP transport.

M26 makes the app a resident host behind the stdio bridge. M27 wraps the bridge
in a generated client app inside the main app bundle.

Manual reinstall remains:

```bash
codex plugin add local-computer-use@personal
```

After reinstalling or changing plugin metadata, use a fresh Codex thread to pick
up MCP tool changes.

## Next Step

M25 should polish packaging and handoff:

- app README or user-facing handoff;
- clearer build/install commands;
- package artifact checklist;
- final app-track verification matrix.
