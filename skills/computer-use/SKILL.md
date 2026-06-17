---
name: computer-use
description: Use the local Computer Use reimplementation backed by its resident macOS app host for agent desktop automation, fixture testing, and compatibility checks. Prefer it when intentionally exercising this local replacement rather than any bundled/native Computer Use provider.
---

# Local Computer Use

This skill describes how to use the repository's local Computer Use-like MCP
path as a macOS desktop automation backend. It is intended for
agent integration, black-box compatibility testing, fixture validation, and
maintenance work.

Use this implementation when the user explicitly wants to exercise the local
reimplementation. Do not treat it as a bundled or native Computer Use provider.

## Resident App Host Entry

Start the resident app host from the repository root, or open the Dev Manager
app:

```bash
npm run start:app-host
```

The plugin-facing stdio bridge is:

```bash
node src/app-bridge.mjs
```

For MCP clients that accept a stdio server configuration, use:

```json
{
  "command": "node",
  "args": ["src/app-bridge.mjs"],
  "cwd": "/Users/lczhang/Documents/computer-use"
}
```

The bridge requires the resident app host socket to be running. For direct
low-level server debugging only, `npm start` still runs `src/server.mjs`
without the app host.

The repo also includes `.mcp.json` for clients that can load MCP server config
files directly.

## Tool Surface

The server exposes a Computer Use-like tool set:

```text
list_apps
get_app_state
click
drag
perform_secondary_action
press_key
scroll
select_text
set_value
type_text
```

Use `list_apps` to find a target app name or bundle identifier, then call
`get_app_state` before actions so element indexes and screenshot coordinates are
fresh.

## Safety Boundaries

- Keep fixture work scoped to deterministic local apps and files.
- Avoid sensitive apps such as terminals, the agent host itself, password
  managers, system settings, and editors containing private work.
- Do not bypass macOS Accessibility or Screen Recording permissions.
- Do not automate third-party accounts, messages, payments, or destructive UI
  actions through this server.

## Permissions and Policy

This server depends on normal macOS privacy permissions:

- Accessibility is required for app state and actions.
- Screen Recording is required for screenshots and screenshot-coordinate
  actions.

The local app policy may require approval before action tools run. If a tool
returns `approval_required`, run the repository approval flow or update the
policy intentionally for the test app:

```bash
npm run approve:app -- <app-name-or-bundle-id>
```

Never bypass macOS permissions or automate approval prompts.

## Local Verification

From the repository root, the local automated fixture gate is:

```bash
npm run test:m11:fixtures
```

The supplemental environment-sensitive follow-up gate is:

```bash
npm run test:followups
```

The negative error semantics gate is:

```bash
npm run test:m13:negative
```

Fixture reports are written to:

```text
reports/m11-fixture-test-suite.json
reports/follow-up-fixtures.json
reports/m13-negative-tests.json
```

Raw JSONL MCP transcripts may contain local app names, AX trees, and UI text.
Keep them as local debug output rather than long-term evidence unless reviewed.

## Known Gaps

- Raw native/proxy `get_app_state` capture remains blocked in this environment;
  hosted/native parity should be treated as partial.
- Display sleep and lock-screen scenarios are manual maintenance checks because
  they disturb the active desktop session.
