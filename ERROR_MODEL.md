# Local Computer Use Error Model

Date: 2026-06-15

Status: Milestone 13 baseline complete for the local reimplementation.

## Shape

Tool-call failures return MCP tool results with `isError: true`, a readable
`content[0].text` message, and stable local metadata:

```json
{
  "local-computer-use/status": "error",
  "tool": "click",
  "local-computer-use/errorCode": "element_not_found",
  "local-computer-use/errorSeverity": "recoverable",
  "local-computer-use/retryable": true,
  "local-computer-use/recoveryHint": "Refresh app state and retry with an element index from the latest tree."
}
```

JSON-RPC protocol failures that occur before a tool result can be returned use
the same local metadata inside `error.data`.

## Severity

`blocked` means the caller should not retry until the user or environment
changes something, such as granting permission or changing app policy.

`recoverable` means the caller may be able to refresh app state, approve the
app, bring the app window back, or retry after a transient condition changes.

`fatal` means the request itself is malformed or unsupported, so the caller
should change the arguments or tool choice before retrying.

## Baseline Error Codes

| Code                                  | Severity      | Retryable | Recovery                                                                 |
| ------------------------------------- | ------------- | --------- | ------------------------------------------------------------------------ |
| `server_not_initialized`              | `recoverable` | yes       | Call `initialize`, then send `notifications/initialized`.                |
| `unknown_tool`                        | `fatal`       | no        | Call `tools/list` and use an advertised tool.                            |
| `missing_required_argument`           | `fatal`       | no        | Add the missing required schema argument.                                |
| `invalid_arguments`                   | `fatal`       | no        | Send a JSON object matching the tool schema.                             |
| `invalid_argument_type`               | `fatal`       | no        | Match the argument type declared in the schema.                          |
| `invalid_argument_value`              | `fatal`       | no        | Use one of the schema-supported enum values.                             |
| `unexpected_argument`                 | `fatal`       | no        | Remove arguments that are not declared in the schema.                    |
| `invalid_app`                         | `recoverable` | yes       | Use `list_apps` to choose a running app name or bundle identifier.       |
| `app_denied`                          | `blocked`     | no        | Choose a different app or intentionally update local policy.             |
| `app_not_allowed`                     | `fatal`       | no        | Add the app to the allowlist or relax strict allowlist mode.             |
| `approval_required`                   | `recoverable` | yes       | Approve the app or use an approved target before action tools.           |
| `approval_denied`                     | `blocked`     | no        | Re-run approval only if the user expects automation.                     |
| `accessibility_permission_missing`    | `blocked`     | yes       | Grant Accessibility permission and retry.                                |
| `screen_recording_permission_missing` | `blocked`     | yes       | Grant Screen Recording permission and retry state or coordinate actions. |
| `element_not_found`                   | `recoverable` | yes       | Refresh app state and use an index from the latest tree.                 |
| `coordinate_mapping_failed`           | `recoverable` | yes       | Refresh app state and use coordinates from the latest screenshot.        |
| `unsupported_action`                  | `fatal`       | no        | Choose one of the element's advertised AX actions.                       |
| `unsupported_direction`               | `fatal`       | no        | Use `up`, `down`, `left`, or `right`.                                    |
| `unsupported_key`                     | `fatal`       | no        | Use a supported key name or key combination.                             |
| `text_not_found`                      | `recoverable` | yes       | Refresh app state and select text present in the current element value.  |
| `window_not_found`                    | `recoverable` | yes       | Bring the target app window on screen and refresh app state.             |
| `screenshot_capture_failed`           | `recoverable` | yes       | Check Screen Recording permission and refresh the target window.         |
| `helper_timeout`                      | `recoverable` | yes       | Close modal dialogs or reduce app state complexity, then retry.          |

## Coordinate Safety

Screenshot-coordinate click and drag now reject coordinates outside the current
screenshot pixel bounds before mapping them into global screen coordinates. This
keeps stale or obviously invalid screenshot coordinates from posting CG events
to unrelated desktop locations.

## Verification

Run:

```bash
npm run test:m13:negative
```

Accepted output:

```text
Local MCP M13 negative error suite passed.
```

The current report is `reports/m13-negative-tests.json`. It covers protocol and
schema errors, approval-required behavior, synthetic permission classification,
real action edge errors, coordinate mapping rejection, and one app-close
recovery path.
