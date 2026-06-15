# Milestone 11 Fixture Test Suite

Date: 2026-06-15

Status: Complete for the local reimplementation's automated fixture gate across
Calculator, TextEdit, Chrome, Finder, and core policy errors. A supplemental
follow-up gate now covers modal-dialog handling, TextEdit multi-window target
changes, and synthetic missing-permission classification.

## Purpose

Milestone 11 turns exploratory M7-M10 probes into repeatable fixture tests. The
suite is meant to answer whether the local MCP server can still read state,
perform actions, and return stable errors after implementation, macOS, or Codex
environment changes.

## Automated Command

Run:

```bash
npm run test:m11:fixtures
```

The command starts the local MCP server, runs deterministic local fixtures, and
writes:

```text
reports/m11-fixture-test-suite.json
reports/m11-fixture-test-suite.jsonl
```

The JSON report contains fixture setup notes, tool-call coverage, expected
state, normalized actual state, cleanup notes, and semantic diffs. The JSONL
file records the MCP request/response transcript for debugging.

## Automated Coverage

The M11 suite covers every exposed local Computer Use tool at least once:

```text
click
drag
get_app_state
list_apps
perform_secondary_action
press_key
scroll
select_text
set_value
type_text
```

Implemented fixtures:

- `tool-catalog-and-policy-errors`: verifies `tools/list`, `list_apps`,
  missing app errors, denied app policy errors, and malformed click errors.
- `calculator-arithmetic-click`: clears Calculator, clicks `1 + 2 =`, and
  verifies the displayed value and state shape.
- `textedit-keyboard-editing`: opens a local TextEdit fixture file, clicks the
  text area, types text, uses keyboard shortcuts, and verifies replacement text.
- `textedit-rich-actions`: uses TextEdit to verify `set_value`, `select_text`,
  replacement typing, scrolling, `AXRaise`, and coordinate drag.
- `chrome-browser-page-actions`: opens the deterministic local browser fixture
  page, verifies browser state text, types into the autofocus form input,
  submits it with Return, clicks Chrome's new-tab button, and runs a browser
  scroll action.
- `finder-project-list-actions`: opens the local Finder fixture directory,
  clicks `notes.md`, performs a short coordinate drag, and verifies bad-element
  error behavior.

## Deferred Follow-Up Coverage

These items are intentionally tracked outside the core M11 gate because they
require more environment-sensitive setup or better fixture isolation:

- richer browser form assertions beyond the current Chrome autofocus input
  fixture;
- Finder multi-window or multi-selection behavior beyond the current project
  list fixture;
- CI-compatible subset definition for a GUI-capable runner.

The follow-up command now covers the previously deferred modal dialog,
multi-window target-window-change, and synthetic missing-permission cases:

```bash
npm run test:followups
```

It writes:

```text
reports/follow-up-fixtures.json
reports/follow-up-fixtures.jsonl
```

The existing M8 Chrome/Finder probes and M10 hosted-oracle semantic checks remain
useful inputs for extending those follow-ups.

## Expected M11 Outcome

M11 now provides one command that can be run after local implementation changes,
macOS updates, or Codex plugin upgrades to verify that the local replacement
still behaves usefully across fixture apps. The suite gives a local regression
gate for all tool names, all action tools, state capture, screenshot presence,
browser and Finder fixtures, and core policy errors.

## Verification

Current accepted output:

```text
Local MCP M11 fixture test suite passed.
Local MCP follow-up fixture suite passed.
```
