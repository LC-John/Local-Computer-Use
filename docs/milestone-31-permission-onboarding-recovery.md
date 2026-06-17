# Milestone 31 Permission Onboarding and Recovery

Date: 2026-06-17

Status: Complete for the first permission onboarding and recovery pass. M31
adds visible permission guidance without bypassing macOS privacy controls.

## Purpose

Make Accessibility and Screen Recording state obvious and recoverable from both
the command line and Dev Manager app.

## Implementation

- `src/permission-cli.mjs` implements:
  - `status`;
  - `open-accessibility`;
  - `open-screen-recording`.
- `permission:m31:status` reports current permission state and recovery URLs.
- `permission:m31:open-accessibility` opens the Accessibility privacy pane.
- `permission:m31:open-screen-recording` opens the Screen Recording privacy
  pane.
- `LOCAL_CUA_PERMISSION_OPEN=0` gives probes a dry-run mode that does not open
  System Settings.
- The Dev Manager app exposes Permission Check, Accessibility, and Screen
  Recording buttons.
- `scripts/probe-m31-permission-onboarding.mjs` verifies JSON shape and dry-run
  recovery URLs without changing TCC permissions.

## Verification

Accepted local command:

```bash
npm run verify:m31:permission-onboarding
```

Accepted result:

```text
M31 permission onboarding probe passed.
M29 service lifecycle probe passed: sessions=5
```

The probe verifies:

- Accessibility status and recovery URL are present;
- Screen Recording status and recovery URL are present;
- Accessibility settings open command supports dry-run;
- Screen Recording settings open command supports dry-run.

## Boundaries

M31 does not automate macOS permission approval prompts and does not bypass TCC.
The user still grants permissions in System Settings.
