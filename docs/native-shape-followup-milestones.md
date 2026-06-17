# Native-Shaped Computer Use Follow-Up Milestones

Date: 2026-06-17

Status: Complete for the M27-M35 native-shaped follow-up track as of
2026-06-17. This
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

Status: Complete for the first client subcommand surface as of 2026-06-17.

Purpose: Replace the generic Node bridge command with an explicit client CLI
surface like the native `SkyComputerUseClient`.

Work items:

- Done: add `LocalComputerUseClient mcp`.
- Done: add `LocalComputerUseClient turn-ended`.
- Done: add `LocalComputerUseClient event-stream` as a diagnostic/read-only
  stream.
- Done: add `LocalComputerUseClient status` for local health checks.
- Done: preserve stdio MCP behavior for Codex.

Deferred:

- A compiled native client remains M33 work.
- A richer long-running event bus remains M32 work.

Verification:

- `npm run verify:m28:client-subcommands` passes.
- `LocalComputerUseClient mcp` returns the same 10 MCP tools.
- `turn-ended` exits successfully and records a small notification event.
- `event-stream` can connect to the service and receive a health event.
- Unknown subcommands return stable usage errors.

## Milestone 29: Service Lifecycle and Single-Instance Runtime

Status: Complete for the first service lifecycle pass as of 2026-06-17.

Purpose: Make the resident service robust enough to behave like an app service,
not just a manually started Node process.

Work items:

- Done: enforce one active service instance per socket.
- Done: add service readiness, heartbeat, and shutdown status.
- Done: persist service status under `.build/runtime/` by default.
- Done: make the Dev Manager app show live service PID, socket path, uptime, session
  count, and last error.
- Done: add bridge behavior for missing service: clear error, no silent hang.

Deferred:

- Login item or launchd behavior remains out of scope.
- Rich restart supervision remains future work.

Verification:

- `npm run verify:m29:service-lifecycle` passes.
- Starting the app twice does not create two competing hosts.
- Bridge reports a helpful error when service is unavailable.
- Service survives multiple sequential MCP sessions.
- Stale socket cleanup is covered by tests.

## Milestone 30: Installer and Plugin Refresh Flow

Status: Complete for the first installer and plugin refresh flow as of
2026-06-17.

Purpose: Add the local equivalent of `Codex Computer Use Installer.app` for
repeatable install, reinstall, and cache-refresh operations.

Work items:

- Done: add an installer mode through `src/installer-cli.mjs`.
- Done: validate plugin manifest and `.mcp.json`.
- Done: create or repair `~/plugins/local-computer-use`.
- Done: expose `codex plugin add local-computer-use@personal` when explicitly
  invoked.
- Done: explain when a fresh Codex thread is required.
- Done: record installer results in a report.
- Done: expose an Installer Check button in the Dev Manager app.

Deferred:

- A separately signed installer app remains release packaging work.

Verification:

- `npm run verify:m30:installer-flow` passes.
- Installer validates a clean checkout.
- Installer repairs a missing symlink.
- Installer refuses to overwrite unrelated paths.
- Plugin flow passes after installer run.

## Milestone 31: Permission Onboarding and Recovery

Status: Complete for the first permission onboarding and recovery pass as of
2026-06-17.

Purpose: Match the native app's permission-aware feel without bypassing macOS
privacy boundaries.

Work items:

- Done: add guided Accessibility and Screen Recording status and recovery
  commands.
- Done: add buttons to open the relevant System Settings panes.
- Done: detect permission changes through status refresh.
- Done: surface permission state in the Dev Manager UI and CLI.
- Done: keep automatic approval of macOS prompts out of scope.

Deferred:

- Correlating live MCP permission errors into a richer app event viewer remains
  M32 work.

Verification:

- `npm run verify:m31:permission-onboarding` passes.
- Missing permissions are shown in the app and CLI status.
- Granted permissions update after refresh.
- Coordinate actions still require Screen Recording.
- No code path attempts to bypass macOS permissions.

## Milestone 32: Event Stream and Turn-Ended Integration

Status: Complete for the first event-stream and turn-ended integration pass as
of 2026-06-17.

Purpose: Bring the local runtime closer to the observed native client surface,
where the client also handles event-stream and turn-ended commands.

Work items:

- Done: emit local service events: service started, bridge connected, session
  opened, session closed, service stopping.
- Done: add `turn-ended` handling and event recording.
- Done: add a Dev Manager Event Stream diagnostic entry.
- Done: keep event payloads privacy-safe by default.

Deferred:

- Per-tool call started/finished events require protocol-layer instrumentation
  and remain future work.
- A full native event bus remains M33/M35 work.

Verification:

- `npm run verify:m32:event-stream` passes.
- `event-stream` receives service and MCP session events.
- `turn-ended` can be called without disrupting active service.
- Event logs avoid full AX trees, screenshots, and user text by default.

## Milestone 33: Native Capture and Automation Consolidation

Status: Complete for the first native-boundary consolidation guardrail pass as
of 2026-06-17.

Purpose: Reduce the number of Node/Swift process boundaries and move closer to
a native service implementation.

Work items:

- Done: decide whether `src/server.mjs` remains the protocol layer or moves behind a
  Swift service facade.
- Deferred: move screenshot capture toward ScreenCaptureKit where practical.
- Done: keep AX traversal in a long-lived native process.
- Done: avoid spawning extra helper processes for hot paths by preserving the
  persistent helper default.
- Done: preserve the existing MCP tool schema and fixture gates.

Verification:

- `npm run verify:m33:native-consolidation` passes.
- M32 event-stream regression still passes.
- Screenshot and coordinate metadata remain on the current verified path.
- The architecture guardrails prevent reverting to direct source-level plugin
  entrypoints or one-shot helper defaults.

## Milestone 34: Locked-Use Guardian Feasibility

Status: Complete for feasibility and safety boundary documentation as of
2026-06-17.

Purpose: Evaluate whether a local `CUALockScreenGuardian`-like helper is needed
or appropriate for this project.

Work items:

- Done: define what "locked computer use" means for the local project.
- Done: document security, privacy, and UX risks.
- Done: record that only harmless state reporting would be acceptable as a
  future first prototype.
- Done: do not implement lock-screen bypasses or hidden automation.

Verification:

- `npm run verify:m34:locked-use-feasibility` passes.
- Feasibility document is explicit about what will not be built.
- Normal app-host MCP use does not depend on this milestone.

## Milestone 35: Release, Signing, and Update Discipline

Status: Complete for the first native-shaped release discipline pass as of
2026-06-17.

Purpose: Make the native-shaped local runtime maintainable across Codex/plugin
updates.

Work items:

- Done: add repeatable app build output under `.build/`.
- Done: add ad-hoc signing for local development.
- Done: add version metadata for app, client, service, plugin, and helper.
- Done: add upgrade notes when `.mcp.json` or plugin metadata changes.
- Done: add a single verification command covering bundle layout, plugin flow, service
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

The practical next target is M34. It should stay feasibility-focused because
locked-use behavior is high risk.
