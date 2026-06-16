# Milestone 16 Long-Lived Helper Service

Date: 2026-06-16

Status: Initial implementation complete. The Node adapter now starts the Swift
Accessibility helper in a persistent `serve` mode by default, sends helper
requests over JSONL, and falls back to the previous one-shot execution path if
the persistent helper fails.

## Purpose

Milestone 16 removes per-command Swift process startup from the hot path. Before
M16, every local Computer Use tool call executed `.build/ax-state` as a fresh
child process. That made simple repeated calls pay unnecessary process startup
cost even when the helper binary was already compiled.

## Implementation

The Swift helper now supports:

```bash
.build/ax-state serve
```

In serve mode, each stdin line is a compact JSON request:

```json
{"id":1,"command":"permissions","arguments":[]}
```

Each stdout line is a compact JSON response:

```json
{"id":1,"result":{"ok":true}}
```

The existing one-shot commands still work:

```bash
.build/ax-state list-apps
.build/ax-state state Calculator
```

The Node adapter defaults to persistent mode. It can be forced back to the old
path with:

```bash
LOCAL_CUA_HELPER_MODE=oneshot npm run probe:local
```

If the persistent helper exits, times out, or cannot accept a request, the
adapter stops it and retries the command through the one-shot path. Tool payloads
include `helperMode` so probes can distinguish `persistent`, `oneshot`, and
`oneshot-fallback`.

## Initial Verification

Syntax and compile checks:

```bash
node --check src/mac-adapter.mjs
node --check src/server.mjs
/usr/bin/swiftc src/ax-state.swift -o .build/ax-state
```

Serve protocol smoke:

```bash
printf '{"id":1,"command":"permissions","arguments":[]}\n{"id":2,"command":"shutdown","arguments":[]}\n' | .build/ax-state serve
```

Accepted output shape:

```text
{"id":1,"result":{"ok":true,...}}
{"id":2,"result":{"ok":true}}
```

Initial Calculator performance check:

```bash
LOCAL_CUA_M15_APPS=Calculator LOCAL_CUA_M15_REPETITIONS=2 npm run baseline:m15:performance
```

Current accepted output:

```text
cold-list-apps: p50=977.3ms p95=977.3ms success=1/1
cold-get-app-state Calculator: p50=940.04ms p95=940.04ms success=1/1
warm-list-apps: p50=7.02ms p95=12.19ms success=2/2
warm-get-app-state Calculator: p50=325.08ms p95=337.78ms success=2/2
```

Compared with the M15 first baseline, warm Calculator `get_app_state` improved
from about 498ms p95 to about 338ms p95 in this run. This is an initial
same-machine signal, not a final benchmark.

Persistent and one-shot smoke checks both pass:

```bash
npm run probe:local
npm run probe:m16:oneshot
```

Both commands reported:

```text
Local MCP AX screenshot overlay probe passed.
```

## Remaining M16 Work

- Run the full M11, M13, and follow-up suites under persistent mode.
- Run a targeted one-shot fallback verification after the persistent path is
  stable.
- Add explicit crash-restart coverage for the helper connection manager.
- Decide whether M17 should absorb app identity caching or whether a small
  identity cache belongs in the end of M16.
