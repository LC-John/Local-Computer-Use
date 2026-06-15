# Computer Use Hosted Context Investigation

Date: 2026-06-12

Purpose: investigate whether Codex app process context, local logs, caches, or
diagnostic reports can explain why direct stdio `get_app_state` probes still
timeout after app approval.

## Summary

The investigation found useful host-context evidence, but did not recover raw
`get_app_state` payloads, screenshot bytes, element bounds, or a reusable direct
stdio success path.

Most important findings:

- Codex-hosted `SkyComputerUseClient mcp` processes are children of
  `/Applications/Codex.app/Contents/Resources/codex app-server`.
- Hosted `SkyComputerUseClient` processes run with cwd:
  `/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809`.
- Matching that cwd in a direct probe still timed out after
  `elicitation/create` was accepted.
- `SkyComputerUseService` is launched separately under launchd.
- Codex app and Computer Use components share the application group
  `2DC432GLL2.com.openai.sky.CUAService`.
- The shared group container only exposed an analytics database during this
  inspection; no obvious allowlist, raw state payload, or screenshot artifact
  was found.
- Diagnostic reports show multiple `SkyComputerUseService` crashes during
  fixture work, all with `EXC_BREAKPOINT` / `SIGTRAP`.

## Process Context

Observed hosted process chain:

```text
Codex.app
-> /Applications/Codex.app/Contents/Resources/codex app-server
   -> ./Codex Computer Use.app/.../SkyComputerUseClient mcp
   -> /Applications/Codex.app/Contents/Resources/cua_node/bin/node_repl
```

Hosted `SkyComputerUseClient mcp` process details:

```text
cwd = /Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809
command = ./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient mcp
```

Environment inspection did not reveal a visible session token or host token.
The environment was mostly:

```text
HOME
LOGNAME
PATH
SHELL
TMPDIR
USER
__CF_USER_TEXT_ENCODING
```

The parent `codex app-server` process did expose ordinary app/runtime
environment values such as `CODEX_INTERNAL_ORIGINATOR_OVERRIDE=Codex`, but no
obvious Computer Use session key was visible in `ps eww` output.

## Direct Probe Recheck

A direct probe was rerun with the hosted cwd and relative executable path:

```text
cwd = /Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809
command = ./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient mcp
```

The probe still timed out after accepting app approval:

```text
initialize: success
notifications/initialized: sent
tools/call get_app_state(Calculator): sent
elicitation/create: Allow Codex to use Calculator?
elicitation reply: accept
final response for id 2: timeout
```

This rules out "wrong cwd" as the sole cause of the direct stdio timeout.

## Local State Files

Inspected paths:

```text
/Users/lczhang/.codex/computer-use/config.json
/Users/lczhang/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService
/Users/lczhang/Library/Caches/com.openai.sky.CUAService
/Users/lczhang/Library/Caches/com.openai.sky.CUAService.cli
/Users/lczhang/Library/HTTPStorages/com.openai.sky.CUAService
/Users/lczhang/Library/HTTPStorages/com.openai.sky.CUAService.cli
```

`~/.codex/computer-use/config.json` only contained UI configuration:

```json
{
  "accentColor": "#339cff",
  "direction": "ltr",
  "locale": "zh-CN",
  "strings": {
    "usingComputer": "Codex is using your computer",
    "escToCancel": "Esc to cancel"
  }
}
```

The group container contained:

```text
Library/Application Support/Software/Analytics.db
```

The analytics database schema was:

```sql
CREATE TABLE distinct_id (...);
CREATE TABLE distinct_id_alias (...);
CREATE TABLE analytics_event (...);
```

No obvious raw state payload, app approval allowlist, screenshot file, or
session JSON was found in the inspected local state paths.

## Open Files and IPC Hints

`SkyComputerUseClient` processes opened:

```text
Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/.../Analytics.db
Library/Caches/com.openai.sky.CUAService.cli/Cache.db
Library/HTTPStorages/com.openai.sky.CUAService.cli/httpstorages.sqlite
```

`SkyComputerUseService` opened:

```text
Library/Caches/com.openai.sky.CUAService/Cache.db
Library/HTTPStorages/com.openai.sky.CUAService/httpstorages.sqlite
Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/.../Analytics.db
/tmp/com.openai.sky.CUAService/LockScreenLoginAuthorization.sock
```

No direct Unix socket between the MCP client and the service was visible through
the focused `lsof` checks. This does not rule out XPC or Mach service IPC.

## Logs

Codex desktop logs under:

```text
/Users/lczhang/Library/Logs/com.openai.codex/2026/06/12/
```

showed feature flags including:

```text
enable_mcp_apps
apps
plugins
tool_call_mcp_elicitation
```

They also showed `mcpServerStatus/list` routing, but did not expose raw Computer
Use tool payloads or screenshots.

Realtime unified log streaming mainly surfaced code-signing and runningboard
signals. Notable observed signal:

```text
Codex.app entitlement includes application group:
2DC432GLL2.com.openai.sky.CUAService
```

During direct probing, runningboard listed multiple `SkyComputerUseClient`
processes and `SkyComputerUseService` as `uielement` processes, and Calculator
as foreground app. No clear service-side error string was emitted in the visible
log stream.

## Diagnostic Reports

Found multiple reports:

```text
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-172728.ips
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-172742.ips
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-172801.ips
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-172823.ips
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-172853.ips
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-174355.ips
~/Library/Logs/DiagnosticReports/SkyComputerUseService-2026-06-12-174640.ips
```

Shared crash shape:

```text
process: SkyComputerUseService
build: 809
exception: EXC_BREAKPOINT
signal: SIGTRAP
termination: Trace/BPT trap: 5
faultingThread: 0
```

Relevant thread names included:

```text
AXNotificationObserver for pid 12866  # Calculator
AXNotificationObserver for pid 22068  # TextEdit
AXNotificationObserver for pid 826    # Chrome
AXNotificationObserver for pid 861    # Finder
CodexAppServerThreadEventObserver.connection
EventTap process(...)
```

Interpretation: Computer Use service was actively observing target apps through
Accessibility/event mechanisms during fixture work, and the service crashed
several times. The crash reports do not expose raw state payloads, but they are
strong evidence that hosted Computer Use uses a service-side AX observer and
event-tap architecture.

## Current Interpretation

The direct timeout is not caused only by using the wrong cwd. It is more likely
related to Codex-hosted runtime context that a raw stdio client does not fully
reproduce:

- app-server parent/host lifecycle;
- app-group or XPC/Mach service pairing;
- app approval/session state not represented by the bare elicitation reply;
- service-side lifecycle or crash/restart behavior;
- possibly a hidden host callback path used after app approval.

The local logs and crash reports help explain the architecture, but still do not
provide:

- raw `get_app_state` MCP payload;
- screenshot encoding;
- element bounds;
- coordinate-system metadata;
- a reusable direct stdio invocation that returns successful state.

## M10.2 Hosted-Context Replay Result

Updated: 2026-06-15

`npm run probe:m10:host` now automates the hosted-context replay check. It reads
the latest usable `computer-use-proxy` capture, extracts Codex-hosted
`initialize`, `tools/list`, and resource request shapes, then starts native
`SkyComputerUseClient mcp` with the hosted plugin cwd.

Current result:

```text
M10.2 native host-context probe reproduced the native state gap.
```

The replay confirms:

- hosted `initialize` with protocol `2025-06-18` and elicitation capabilities
  succeeds;
- hosted-style `tools/list` succeeds;
- hosted resource requests return the same unsupported-method JSON-RPC errors;
- invalid-app `get_app_state` returns a native tool error;
- `get_app_state(Calculator)` triggers `elicitation/create`, the probe accepts
  it, and the real-app state call still times out.

This narrows the missing context: the blocker is not only protocol version,
client info, elicitation capability advertisement, hosted cwd, tools/list
metadata, or the basic elicitation accept response.

Follow-up proxy testing showed that a fresh Codex app thread can load the
`computer-use-proxy` plugin and call `get_app_state(Calculator)`, but the proxied
official client still timed out after app approval. The captured hosted request
contains Codex turn metadata and `plugin_id: computer-use-proxy@personal`, so
the proxy was updated to forward `plugin_id: computer-use@openai-bundled` as an
experiment.

## Next Investigation Ideas

- Compare hosted and manual process trees while triggering a fresh hosted
  `get_app_state` from a newly created Codex thread.
- Use a narrower unified-log predicate around `SkyComputerUseService` plus
  launchd/runningboard immediately after a known service crash.
- Inspect app-group preferences with `defaults` and `plutil`, if new files
  appear after app approvals.
- Build a small MCP proxy/wrapper around the plugin command only if Codex can be
  configured to use that wrapper, so raw stdio traffic can be captured in the
  real hosted context.
