# Milestone 34 Locked-Use Guardian Feasibility

Date: 2026-06-17

Status: Complete for feasibility and safety boundary documentation. M34 does
not implement locked computer use.

## Purpose

The native Codex Computer Use bundle includes a `CUALockScreenGuardian.app`.
For Local Computer Use, this milestone evaluates whether an equivalent helper is
needed and records strict safety boundaries.

## Feasibility Result

Do not implement locked-use automation in the current local project.

Reasons:

- Current project goals are local fixture testing, app-host packaging, and MCP
  compatibility.
- Locked-use behavior has higher privacy and security risk than ordinary
  visible desktop automation.
- The current app-host path already requires an active user session and visible
  macOS permissions.
- No current fixture gate requires lock-screen interaction.

## Allowed Future Scope

If revisited, the only acceptable first prototype is visible, opt-in state
reporting:

- show whether the app host believes the session is active;
- show whether permissions are missing;
- show whether the app host is reachable;
- never interact with the lock screen;
- never hide automation from the user.

## Explicit Non-Goals

- No lock-screen bypass.
- No hidden automation.
- No credential, password, keychain, or secure-input automation.
- No background daemon that acts while the user is unaware.
- No attempt to replace OpenAI's bundled guardian component.

## Verification

Accepted local command:

```bash
npm run verify:m34:locked-use-feasibility
```

The probe verifies that the repository contains the safety document and no local
source path introduces lock-screen bypass terminology or a guardian executable.
