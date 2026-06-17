# Milestone 23 Diagnostics and Test Runner UI

Date: 2026-06-17

Status: Complete for the first diagnostics and test runner UI pass. M23 expands
the Dev Manager app shell with grouped commands and command history.

## Purpose

M22 proved a minimal app shell. M23 makes the app useful as a developer
diagnostic surface by grouping routine checks and showing command outcomes.

## Implementation

The SwiftUI app now models diagnostics as structured commands:

```text
Smoke:
  npm run probe:local
  npm run probe:m20:state-policy

App:
  npm run probe:m22:app

Fixture Gates:
  npm run test:m13:negative
  npm run test:followups
  npm run test:m11:fixtures
```

The UI now includes:

- grouped diagnostic buttons;
- command output panel;
- command history;
- status per command: running, passed, failed;
- elapsed duration for completed commands.

## Verification

Run:

```bash
npm run build:m22:app
npm run probe:m23:diagnostics-ui
npm run probe:m22:app
node --check scripts/probe-m23-diagnostics-ui.mjs
git diff --check
```

Accepted local results:

```text
M23 diagnostics UI probe passed.
M22 Dev Manager app probe passed.
```

GUI launch smoke also passed after the M23 UI update.

## Boundaries

M23 still shells out to existing scripts. It does not host MCP, schedule tests,
or implement background execution outside the app process.

## Next Step

M24 should focus on plugin install, validate, and smoke-test flow:

- expose installed plugin status;
- run plugin manifest validation;
- guide reinstall/cache refresh steps;
- run a post-install smoke test from the app.
