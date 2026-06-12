# Invalid App Fixture

Date: 2026-06-12

Purpose: document `get_app_state` behavior when the app name cannot be resolved.

## Request

```json
{
  "name": "get_app_state",
  "arguments": {
    "app": "__definitely_missing_app_for_probe__"
  }
}
```

## Native Computer Use Result

The native MCP server returned a normal tool result error:

```text
Invalid app: __definitely_missing_app_for_probe__
```

The full response is stored in `native-state.raw.json`.

## State Model Relevance

This confirms that `get_app_state` can validate app identity and return a
machine-readable MCP tool error before entering the real app state capture path.
