# Computer Use Reimplementation Project Scope

Date: 2026-06-12

## Purpose

This project is a black-box compatible reimplementation effort for a local
Computer Use-like MCP server. The goal is to understand observable runtime
behavior and build an independent implementation with similar tool contracts,
not to recover or copy OpenAI source code.

The target implementation may be packaged as a local Codex plugin or run as a
standalone MCP server.

## Target Tool Surface

The project targets a Computer Use-like tool surface:

```text
get_app_state
list_apps
click
type_text
press_key
scroll
drag
set_value
select_text
perform_secondary_action
```

The implementation should expose documented MCP schemas, return useful app
state, execute basic macOS GUI actions through native APIs, preserve explicit
permission boundaries, and include repeatable fixtures.

## Allowed Evidence Sources

Allowed evidence sources are observable or user-controlled artifacts:

- local Codex plugin manifests;
- local `.mcp.json` configuration;
- local bundle metadata;
- command output from `file`, `otool`, `codesign`, `plutil`, `strings`, and
  similar static inspection tools;
- MCP requests and responses produced by normal runtime interaction;
- runtime behavior observed through normal app usage;
- public macOS APIs;
- self-written helper programs and probes;
- user-provided external summaries, treated as claims until locally verified.

## Out of Scope

This project must not depend on:

- source-code theft;
- disassembly aimed at recovering source;
- bypassing Screen Recording or Accessibility permissions;
- bypassing Codex app approvals;
- bypassing macOS code signing or privacy protections;
- extracting private credentials;
- automatically approving administrator, security, or privacy prompts;
- automating Codex itself or terminal apps when matching native Computer Use
  safety boundaries is a goal.

## Compatibility Levels

Compatibility is measured by observable behavior:

- Level 1: tool names and basic MCP schemas are present.
- Level 2: `get_app_state` returns useful app/window metadata, screenshots, and
  accessibility payloads.
- Level 3: basic actions work in stable fixture apps.
- Level 4: multi-app workflows are reliable.
- Level 5: error semantics and permission behavior are close to native Computer
  Use.
- Level 6: Codex agents can use the replacement with minimal prompt changes.

## Current Status

Milestone 0, scope and safety boundaries, is complete as of 2026-06-12.
Architecture discovery and native bundle profiling are recorded in
`docs/computer-use-architecture-report.md`. Native MCP protocol discovery is
recorded under `protocol/`.

The next project phase is state model discovery.
