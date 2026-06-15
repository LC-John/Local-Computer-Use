---
name: computer-use
description: Use the local Computer Use reimplementation MCP server for macOS fixture testing and compatibility checks. Prefer this only when intentionally testing the local replacement rather than the bundled OpenAI Computer Use plugin.
---

# Local Computer Use

This skill exposes the repository's local Computer Use-like MCP server as a
distinct plugin named `local-computer-use`. It is intended for black-box
reimplementation testing, fixture validation, and compatibility work.

Use this plugin when the user explicitly wants to exercise the local
reimplementation. Do not treat it as the bundled OpenAI Computer Use plugin.

## Safety Boundaries

- Keep fixture work scoped to deterministic local apps and files.
- Avoid sensitive apps such as terminals, Codex itself, password managers,
  system settings, and editors containing private work.
- Do not bypass macOS Accessibility or Screen Recording permissions.
- Do not automate third-party accounts, messages, payments, or destructive UI
  actions through this plugin.

## Local Verification

From the repository root, the local automated fixture gate is:

```bash
npm run test:m11:fixtures
```

The fixture report is written to:

```text
reports/m11-fixture-test-suite.json
```

The raw JSONL MCP transcript may contain local app names and AX trees, so keep it
as local debug output rather than long-term evidence unless it has been reviewed.
