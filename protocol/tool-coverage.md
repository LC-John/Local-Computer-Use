# MCP Tool Coverage

Generated: 2026-06-12T08:50:27.843Z

Coverage is based on the native `tools/list` response. Valid action calls
are intentionally deferred to fixture milestones because they operate the
real desktop.

| Tool | Schema captured | Missing required | Invalid params | Minimal read-only call | Valid action call | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `list_apps` | yes | n/a | raw stdio timeout | raw stdio timeout; hosted success later observed | n/a | Supported read-only tool. Raw direct probing timed out, but Codex-hosted `mcp__computer_use.list_apps` later returned successfully after restart. |
| `get_app_state` | yes | yes | yes | not run | n/a | Read-only tool; valid minimal call may be safe in Milestone 3. |
| `click` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `perform_secondary_action` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `set_value` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `select_text` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `scroll` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `drag` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `press_key` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
| `type_text` | yes | yes | yes | not run | deferred | Valid action behavior deferred to fixture/action milestones. |
