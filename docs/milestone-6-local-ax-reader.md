# Milestone 6 Local AX Reader

Date: 2026-06-15

Status: Initial implementation complete; fixture diffing against hosted native
Computer Use remains open. Screenshot capture was added later in Milestone 7.

This document summarizes the local reimplementation work completed for
Milestone 6. The goal of this milestone is to make the local MCP server return
useful read-only macOS application state through `list_apps` and
`get_app_state`, without implementing GUI actions yet.

## Implemented Components

### Swift Helper

`src/ax-state.swift` is the local macOS helper. It is compiled on demand by the
Node adapter and exposes two commands:

```bash
.build/ax-state list-apps
.build/ax-state state <app>
```

The helper uses public macOS APIs:

- `NSWorkspace` for running app discovery and app launch/lookup.
- `AXUIElementCreateApplication(pid)` for app accessibility roots.
- `AXUIElementCopyAttributeValue` for AX attributes.
- `AXUIElementCopyActionNames` for available AX actions.

### Node Adapter

`src/mac-adapter.mjs` compiles `src/ax-state.swift` into `.build/ax-state` when
needed, calls the helper, parses JSON, and converts helper failures into
structured local errors.

### MCP Server Wiring

`src/server.mjs` now routes:

- `list_apps` to the local Swift helper.
- `get_app_state` to the local Swift helper.
- action tools to deterministic `not_implemented` responses.

The MCP tool inventory still comes from `protocol/tools-list.json`, preserving
the native Computer Use tool names and input schemas captured in Milestone 3.

## `list_apps` Behavior

The local `list_apps` implementation returns user-facing running applications
instead of every process reported by `NSWorkspace`.

It filters out:

- helper applications;
- daemons and agents;
- XPC services;
- nested framework helpers;
- non-regular activation-policy apps.

Each returned app includes:

```text
name
bundleIdentifier
path
pid
isActive
isHidden
status
```

This intentionally differs from the current hosted native output in one area:
hosted `mcp__computer_use.list_apps` also includes recently used apps and usage
counts, while the local implementation currently only reports running
user-facing apps.

## `get_app_state` Behavior

The local `get_app_state` implementation resolves the requested app by:

- localized app name;
- bundle identifier;
- app bundle path;
- executable path;
- app bundle basename, such as `Calculator`;
- `frontmost` or `frontmost app` aliases.

If the app is not running, the resolver attempts to launch known app bundles
from:

```text
/Applications/<name>.app
/System/Applications/<name>.app
```

The returned state includes:

- app metadata;
- focused window or first window title;
- a bounded accessibility tree;
- deterministic per-call numeric indexes;
- role, subrole, title, description, help, identifier, and value;
- enabled, focused, and selected flags;
- position and size attributes where exposed;
- available AX actions;
- available AX attribute names;
- recursion and node-count limits.

Current limits:

```text
maxDepth = 9
maxNodes = 1200
```

## Verification

Run the local probe:

```bash
npm run probe:local
```

Run the Calculator fixture probe:

```bash
LOCAL_CUA_PROBE_APP=Calculator npm run probe:local
```

Run static checks:

```bash
node --check src/server.mjs
node --check src/mac-adapter.mjs
node --check scripts/probe-reimplementation-mcp.mjs
/usr/bin/swiftc src/ax-state.swift -o .build/ax-state-check
```

Expected probe output:

```text
Local MCP AX state probe passed.
```

## Known Gaps

- Screenshot capture is outside the Milestone 6 AX reader boundary and is
  documented separately in `docs/milestone-7-screenshot-coordinate-capture.md`.
- Native Computer Use screenshot encoding is still unknown.
- Local `list_apps` does not yet include native-style last-used dates or usage
  counts.
- Element indexes are deterministic within a single returned tree, but
  cross-call stability has not been proven.
- Fixture diffs against hosted native Computer Use state are still needed before
  claiming higher compatibility.
- GUI actions remain intentionally unimplemented until Milestone 8.

## Relationship to Earlier Milestones

Milestone 3 established the native MCP tool surface and schemas. Direct raw
stdio `list_apps` probes timed out, but later hosted `mcp__computer_use.list_apps`
calls returned successfully, so `list_apps` is treated as supported.

Milestone 4 established hosted `get_app_state` observations for Calculator,
TextEdit, Chrome, and Finder. The local AX reader is a reimplementation path
that should be compared against those observations, not a raw capture of native
Computer Use internals.
