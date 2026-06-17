# Native-Shaped Computer Use Follow-Up Milestones

Date: 2026-06-17

Status: Planning document. M27 is complete; M28-M35 remain proposed. This
roadmap starts after M26 and describes what is
still missing if Local Computer Use should more closely match the native Codex
Computer Use app shape observed on this machine.

## Target Shape

The bundled Codex Computer Use runtime is app-shaped:

```text
Codex Computer Use.app
  Contents/MacOS/SkyComputerUseService
  Contents/SharedSupport/SkyComputerUseClient.app
    Contents/MacOS/SkyComputerUseClient
  Contents/SharedSupport/Codex Computer Use Installer.app
  Contents/SharedSupport/CUALockScreenGuardian.app
```

Its plugin entry runs:

```text
SkyComputerUseClient mcp
```

The local M26 shape is lighter:

```text
Local Computer Use Dev Manager.app
  -> node src/app-host.mjs
    -> node src/app-bridge.mjs
      -> node src/server.mjs
        -> .build/ax-state serve
```

M26 gives us a resident app-host path, but it is not yet a native-style service,
client app, installer, notification handler, or locked-use architecture.

M27 adds the first native-shaped bundle layout:

```text
Local Computer Use Dev Manager.app
  Contents/MacOS/LocalComputerUseDevManager
  Contents/MacOS/LocalComputerUseService
  Contents/SharedSupport/LocalComputerUseClient.app
    Contents/MacOS/LocalComputerUseClient
```

## Milestone 27: Native-Shaped Bundle Layout

Status: Complete for the first native-shaped bundle layout as of 2026-06-17.

Purpose: Make the local app bundle look structurally like a Computer Use
runtime bundle, while keeping the implementation black-box and local.

Work items:

- Done: add a generated app layout with `Contents/MacOS/LocalComputerUseService`.
- Done: add `Contents/SharedSupport/LocalComputerUseClient.app`.
- Done: move or wrap the current `app-host` and `app-bridge` entrypoints into those
  bundle locations.
- Done: keep the Dev Manager UI as the main app UI.
- Done: update `.mcp.json` so the plugin invokes the bundled client path,
  equivalent to `LocalComputerUseClient mcp`.

Deferred:

- A compiled native client binary remains M28/M33 work; M27 uses generated
  executable wrappers around the existing Node implementation.

Verification:

- `npm run verify:m27:native-bundle` passes.
- The app bundle contains the service executable and client app.
- MCP `tools/list` works through `LocalComputerUseClient mcp`.
- The M24 plugin flow passes through the bundled client path.

## Milestone 28: Client Subcommands

Status: Proposed.

Purpose: Replace the generic Node bridge command with an explicit client CLI
surface like the native `SkyComputerUseClient`.

Work items:

- Add `LocalComputerUseClient mcp`.
- Add `LocalComputerUseClient turn-ended`.
- Add `LocalComputerUseClient event-stream` as a diagnostic/read-only stream.
- Add `LocalComputerUseClient status` for local health checks.
- Preserve stdio MCP behavior for Codex.

Verification:

- `LocalComputerUseClient mcp` returns the same 10 MCP tools.
- `turn-ended` exits successfully and records a small notification event.
- `event-stream` can connect to the service and receive health/session events.
- Unknown subcommands return stable structured errors.

## Milestone 29: Service Lifecycle and Single-Instance Runtime

Status: Proposed.

Purpose: Make the resident service robust enough to behave like an app service,
not just a manually started Node process.

Work items:

- Enforce one active service instance per user.
- Add service readiness, heartbeat, restart, and shutdown semantics.
- Persist service status under `reports/` or `.build/runtime/`.
- Make the Dev Manager app show live service PID, socket path, uptime, session
  count, and last error.
- Add bridge behavior for missing service: clear error, no silent hang.

Verification:

- Starting the app twice does not create two competing hosts.
- Bridge reports a helpful error when service is unavailable.
- Service survives multiple sequential MCP sessions.
- Stale socket cleanup is covered by tests.

## Milestone 30: Installer and Plugin Refresh Flow

Status: Proposed.

Purpose: Add the local equivalent of `Codex Computer Use Installer.app` for
repeatable install, reinstall, and cache-refresh operations.

Work items:

- Add `Local Computer Use Installer.app` or an installer mode inside the app.
- Validate plugin manifest and `.mcp.json`.
- Create or repair `~/plugins/local-computer-use`.
- Run `codex plugin add local-computer-use@personal` when explicitly invoked.
- Explain when a fresh Codex thread is required.
- Record installer results in a report.

Verification:

- Installer validates a clean checkout.
- Installer repairs a missing symlink.
- Installer refuses to overwrite unrelated paths.
- Plugin flow passes after installer run.

## Milestone 31: Permission Onboarding and Recovery

Status: Proposed.

Purpose: Match the native app's permission-aware feel without bypassing macOS
privacy boundaries.

Work items:

- Add guided Accessibility and Screen Recording status panels.
- Add buttons to open the relevant System Settings panes.
- Detect permission changes after app restart or refresh.
- Surface permission errors from MCP sessions in the Dev Manager UI.
- Keep automatic approval of macOS prompts out of scope.

Verification:

- Missing permissions are shown in the app and MCP error metadata.
- Granted permissions update after refresh.
- Coordinate actions still require Screen Recording.
- No code path attempts to bypass macOS permissions.

## Milestone 32: Event Stream and Turn-Ended Integration

Status: Proposed.

Purpose: Bring the local runtime closer to the observed native client surface,
where the client also handles event-stream and turn-ended commands.

Work items:

- Emit local service events: service started, bridge connected, session opened,
  tool call started/finished, permission blocked, service stopped.
- Add `turn-ended` handling for cleanup, metrics flush, or cache trimming.
- Add a Dev Manager event viewer.
- Keep event payloads privacy-safe by default.

Verification:

- `event-stream` receives service and MCP session events.
- `turn-ended` can be called repeatedly without disrupting active service.
- Event logs avoid full AX trees, screenshots, and user text by default.

## Milestone 33: Native Capture and Automation Consolidation

Status: Proposed.

Purpose: Reduce the number of Node/Swift process boundaries and move closer to
a native service implementation.

Work items:

- Decide whether `src/server.mjs` remains the protocol layer or moves behind a
  Swift service facade.
- Move screenshot capture toward ScreenCaptureKit where practical.
- Keep AX traversal in a long-lived native process.
- Avoid spawning extra helper processes for hot paths.
- Preserve the existing MCP tool schema and fixture gates.

Verification:

- M11/M13/follow-up fixture gates still pass.
- M15-M20 performance benchmarks do not regress.
- Screenshot and coordinate metadata remain compatible.
- The service can handle repeated action/state cycles without helper restart.

## Milestone 34: Locked-Use Guardian Feasibility

Status: Optional and high risk.

Purpose: Evaluate whether a local `CUALockScreenGuardian`-like helper is needed
or appropriate for this project.

Work items:

- Define what "locked computer use" means for the local project.
- Document security, privacy, and UX risks.
- Prototype only harmless state reporting first.
- Do not implement lock-screen bypasses or hidden automation.

Verification:

- Feasibility document is explicit about what will not be built.
- Any prototype stays opt-in and visible.
- Normal app-host MCP use does not depend on this milestone.

## Milestone 35: Release, Signing, and Update Discipline

Status: Proposed.

Purpose: Make the native-shaped local runtime maintainable across Codex/plugin
updates.

Work items:

- Add repeatable app build output under `.build/`.
- Add ad-hoc signing for local development.
- Add version metadata for app, client, service, plugin, and helper.
- Add upgrade notes when `.mcp.json` or plugin metadata changes.
- Add a single verification command covering bundle layout, plugin flow, service
  lifecycle, and fixture smoke.

Verification:

- Fresh checkout can build and verify the app.
- Plugin manifest validation passes.
- `verify:m35:native-shape` passes.
- Docs explain reinstall and fresh-thread requirements.

## Recommended Order

```text
M27: native-shaped bundle layout
M28: client subcommands
M29: service lifecycle and single-instance runtime
M30: installer and plugin refresh flow
M31: permission onboarding and recovery
M32: event stream and turn-ended integration
M33: native capture and automation consolidation
M34: locked-use guardian feasibility
M35: release, signing, and update discipline
```

The practical next target is M28-M29. Those add the client subcommand surface
and service lifecycle robustness without taking on the riskier installer,
locked-use, or native rewrite work too early.
