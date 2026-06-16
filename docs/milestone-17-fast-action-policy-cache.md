# Milestone 17 Fast Action Path and Policy Cache

Date: 2026-06-16

Status: Complete for the initial fast-action and policy-cache milestone as of
2026-06-16. M17 adds a short-lived app identity and approval decision cache,
helper-side recent element context for element-index actions, stale-state
protection, and an action benchmark that compares repeated Calculator clicks
with the cache enabled and disabled.

## Purpose

Milestone 17 targets action latency. M16 made the Swift helper persistent, but
each action still paid for repeated app identity resolution and approval-store
checks before executing the actual click, key press, or text operation.

## Implementation

The server now caches successful app identity lookups and successful approval
decisions. The cache is intentionally conservative:

- cache entries have a short TTL, defaulting to 5000ms;
- only successful identity and approval decisions are cached;
- app policy evaluation still runs every call against the loaded policy;
- permission checks still run every call;
- the cache can be disabled with `LOCAL_CUA_POLICY_CACHE=0`;
- the TTL can be tuned with `LOCAL_CUA_POLICY_CACHE_TTL_MS`.

Tool result metadata records cache behavior:

```text
local-computer-use/policyCacheEnabled
local-computer-use/identityCache
local-computer-use/approvalCache
local-computer-use/policyDurationMs
local-computer-use/adapterDurationMs
```

The Swift helper also keeps the most recent `get_app_state` element map in
persistent-helper memory. Element-index actions can reuse that context when the
app pid and target window position/size still match. If the window moved, the
helper returns `stale_element_index` so the caller can refresh state instead of
acting on a stale target. Repeated actions also skip `activateApp` when the app
is already active.

## Benchmark

Run:

```bash
npm run benchmark:m17:actions
```

The benchmark reads Calculator state once, finds the `1` button, then repeats
element-index clicks with policy cache enabled and disabled. It writes local
generated output to:

```text
reports/m17-action-cache-benchmark.json
reports/m17-action-cache-benchmark.jsonl
reports/m17-action-cache-benchmark-cache-off.jsonl
```

Accepted final output:

```text
M17 action cache benchmark written: cache-on p50=235.39ms, cache-off p50=236.18ms
```

Current report summary:

```text
cache-on:  p50=235.39ms p95=346.57ms policy-p50=9.08ms  adapter-p50=226.36ms
cache-off: p50=236.18ms p95=394.41ms policy-p50=23.38ms adapter-p50=212.43ms
```

Compared with the first M17 cache-only run, repeated Calculator click p50 moved
from about 405ms to about 235ms after helper-side element context reuse and
skipping repeated activation. The policy cache itself is working and lowers
policy p50, but total action latency is still mostly in the adapter/helper
action path.

## Stale State

Run:

```bash
npm run probe:m17:stale
```

Accepted output:

```text
M17 stale state probe passed.
```

The probe captures Calculator state, moves the Calculator window, then retries a
click with the old element index. The expected error is `stale_element_index`.
M11's Calculator fixture also refreshes state and retries when it sees that
recoverable error.

## Verification

M17 was checked with:

```bash
node --check src/server.mjs
node --check scripts/run-m17-action-cache-benchmark.mjs
node --check scripts/probe-m17-stale-state.mjs
git diff --check
npm run benchmark:m17:actions
npm run probe:m17:stale
npm run test:m11:fixtures
npm run test:m13:negative
npm run test:followups
```

Accepted outputs:

```text
M17 stale state probe passed.
Local MCP M11 fixture test suite passed.
Local MCP M13 negative error suite passed.
Local MCP follow-up fixture suite passed.
```

## Notes

- TextEdit fixture cleanup now force-kills TextEdit in test-only setup/teardown
  to avoid Save Panel state leaking across desktop tests.
- The follow-up multi-window TextEdit check can skip the named-window portion
  when the current TextEdit environment exposes tabs or save panels instead of
  two named windows. Modal-dialog and synthetic-permission follow-ups still run.
- M18 should focus on reducing state/screenshot cost; action latency is now low
  enough that `get_app_state` dominates more workflows.
