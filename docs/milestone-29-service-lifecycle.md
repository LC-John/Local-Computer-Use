# Milestone 29 Service Lifecycle and Single-Instance Runtime

Date: 2026-06-17

Status: Complete for the first service lifecycle and single-instance runtime
pass. M29 makes the resident app host observable and harder to accidentally
duplicate.

## Purpose

Make the M26-M28 resident app host behave more like a durable app service:

- one active service per socket;
- explicit readiness and heartbeat state;
- service PID, uptime, session count, and last error reporting;
- stable behavior across repeated MCP sessions;
- clear bridge error when the service is unavailable.

## Implementation

- `src/app-host.mjs` now writes service status JSON.
- The status includes PID, socket path, repo root, state, heartbeat, uptime,
  active session count, total session count, and last error.
- The host updates status on startup, readiness, session open/close, heartbeat,
  and shutdown.
- A second service for an already-live socket exits cleanly without taking over.
- `src/client-cli.mjs status` includes the service status payload.
- The Dev Manager app shows service PID, uptime, session counts, and last error.
- `scripts/probe-m29-service-lifecycle.mjs` verifies lifecycle behavior.

## Verification

Accepted local command:

```bash
npm run verify:m29:service-lifecycle
```

Accepted result:

```text
M29 service lifecycle probe passed: sessions=5
M28 client subcommands probe passed: tools=10
M24 plugin flow probe passed: local-computer-use@0.1.0, tools=10
```

The probe verifies:

- the first service is reachable;
- a duplicate service exits without taking over;
- two sequential MCP sessions succeed through the client;
- service status reports PID, uptime, active sessions, and total sessions;
- client `status` reads the service status;
- `LocalComputerUseClient mcp` reports a clear error when the host is down.

## Boundaries

M29 is still not a launchd/system daemon. The app or `npm run start:app-host`
must be running.

The service lifecycle is per-user and per-socket. A richer install-time
launcher, app login item, or background daemon remains out of scope for this
milestone.
