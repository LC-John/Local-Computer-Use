# Computer Use Proxy Plugin

Date: 2026-06-12

Purpose: local Codex plugin used to capture hosted MCP JSON-RPC traffic for
Computer Use fixture discovery.

## Plugin Location

Source plugin:

```text
/Users/lczhang/plugins/computer-use-proxy
```

Installed cache:

```text
/Users/lczhang/.codex/plugins/cache/personal/computer-use-proxy/0.1.0+codex.20260612125355
```

Marketplace:

```text
/Users/lczhang/.agents/plugins/marketplace.json
```

Install command used:

```bash
codex plugin add computer-use-proxy@personal --json
```

`codex plugin list` reports:

```text
computer-use-proxy@personal  installed, enabled  0.1.0+codex.20260612125355
```

## MCP Wrapper

The plugin registers one MCP server:

```json
{
  "mcpServers": {
    "computer-use-proxy": {
      "command": "node",
      "args": ["./scripts/computer-use-proxy.mjs"],
      "cwd": "."
    }
  }
}
```

The wrapper starts the official bundled Computer Use client:

```text
/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809
./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient mcp
```

It forwards stdin/stdout unchanged and records JSON-RPC traffic to:

```text
/Users/lczhang/Documents/computer-use/captures/computer-use-proxy/
```

Large string fields such as image/base64/blob-like data are redacted in the
capture file as:

```text
<redacted string length=...>
```

As of `0.1.0+codex.20260612125355`, the proxy also rewrites outbound
`params._meta.plugin_id` before forwarding to the official bundled Computer Use
client:

```text
computer-use-proxy@personal -> computer-use@openai-bundled
```

The original plugin id is preserved in the forwarded message under:

```text
params._meta.x-computer-use-proxy-original-plugin-id
```

This is an experiment to test whether the official Computer Use client hangs
because hosted calls arrive with the proxy plugin identity instead of the
bundled plugin identity.

## Validation

Plugin validation passed:

```bash
python3 /Users/lczhang/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py /Users/lczhang/plugins/computer-use-proxy
```

Manual wrapper smoke test passed for:

```text
initialize
notifications/initialized
tools/list
```

The proxy returned the official 10 Computer Use tools:

```text
list_apps
get_app_state
click
perform_secondary_action
set_value
select_text
scroll
drag
press_key
type_text
```

Smoke-test capture:

```text
captures/computer-use-proxy/2026-06-12T11-32-13.116Z-73962.jsonl
```

## Fresh-Thread Result

A fresh Codex app thread loaded `computer-use-proxy` successfully. It called
`get_app_state(Calculator)`, but the call timed out after 120 seconds.

Capture evidence:

```text
captures/computer-use-proxy/2026-06-12T12-43-07.333Z-85477.jsonl
```

Important captured difference from manual probes:

```text
protocolVersion: 2025-06-18
clientInfo.name: codex-mcp-client
clientInfo.version: 0.140.0-alpha.2
capabilities.elicitation: { form: {}, url: {} }
params._meta.plugin_id: computer-use-proxy@personal
params._meta.x-codex-turn-metadata: present
```

After installing `0.1.0+codex.20260612125355`, a later fresh thread confirmed
the proxy-id rewrite was active:

```text
captures/computer-use-proxy/2026-06-12T12-57-58.380Z-92707.jsonl
```

The forwarded call contained:

```text
params._meta.plugin_id: computer-use@openai-bundled
params._meta.x-computer-use-proxy-original-plugin-id: computer-use-proxy@personal
```

The call still stopped after:

```text
tools/call get_app_state(Calculator)
elicitation/create: Allow Codex to use Calculator?
elicitation reply: accept
no final response before timeout
```

## Current Limitation

The proxy can capture hosted MCP traffic and can rewrite the forwarded plugin
identity, but the official Computer Use client still hangs after accepted app
approval when launched as the proxy child process. This suggests the successful
first-party path likely depends on Codex app host context, service binding, or
approval/session state beyond ordinary stdio MCP messages. This investigation is
on hold while the independent reimplementation skeleton proceeds.
