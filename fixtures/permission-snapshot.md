# Permission Snapshot

Date: 2026-06-12

This file records local permission signals relevant to Milestone 4 state model
discovery.

## Accessibility / UI Scripting

Command:

```bash
osascript -e 'tell application "System Events" to UI elements enabled'
```

Initial observed result:

```text
false
```

Updated observed result after enabling Accessibility in macOS System Settings:

```text
true
```

Interpretation: UI scripting / Accessibility is now enabled for the probing
context.

## Computer Use App Approval

During direct native MCP probing, `get_app_state` for Calculator triggered an
MCP server request:

```text
elicitation/create: Allow Codex to use Calculator?
```

The probe script can now auto-accept that fixture-specific elicitation when
`CUA_AUTO_ACCEPT_ELICITATION=1` is set, but the direct stdio state call still
timed out after approval, even after Accessibility was enabled and
`SkyComputerUseService` was restarted.

After restarting the Codex app, the Codex-hosted Computer Use tools recovered:

```text
list_apps: success
get_app_state(Calculator): success
```

In the original thread, action tools still reported `Computer Use is not active`
after successful state reads. The user confirmed that Calculator actions work in
a new chat, and a later hosted Calculator smoke test in this project thread
successfully computed `9 * 9 = 81`. This appears to have been stale
thread/session state rather than a global permission problem.

## Current Milestone 4 Impact

Codex-hosted native state payload capture now works. Direct stdio state payload
capture is still blocked, likely because raw direct probing does not fully
emulate the Codex-hosted app approval/session context. Hosted action tools are
usable for safe fixture work in the current thread.
