# Milestone 17 Fast Action Path and Policy Cache

Date: 2026-06-16

Status: In progress. The first M17 implementation adds a short-lived app
identity and approval decision cache in the MCP server, plus an action benchmark
that compares repeated Calculator clicks with the cache enabled and disabled.

## Purpose

Milestone 17 targets action latency. M16 made the Swift helper persistent, but
each action still paid for repeated app identity resolution and approval-store
checks before executing the actual click, key press, or text operation.

## Initial Implementation

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
```

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

Initial accepted output:

```text
M17 action cache benchmark written: cache-on p50=404.97ms, cache-off p50=407.16ms
```

Current report summary:

```text
cache-on:  p50=404.97ms p95=413.72ms
cache-off: p50=407.16ms p95=418.7ms
```

The cache is working: cache-on samples reported `identity-hit` and
`approval-hit` after the first approval decision, while cache-off samples
reported `identity-miss` and `approval-miss`. The latency improvement is small
in this first run, which means repeated Calculator clicks are now dominated by
the action helper's AX element resolution and action execution, not only by
policy/app identity lookup.

## Initial Verification

The first M17 pass was checked with:

```bash
node --check src/server.mjs
node --check scripts/run-m17-action-cache-benchmark.mjs
git diff --check
npm run benchmark:m17:actions
npm run test:m13:negative
npm run probe:local
```

Accepted outputs:

```text
Local MCP M13 negative error suite passed.
Local MCP AX screenshot overlay probe passed.
```

## Acceptance Direction

M17 should be marked complete after:

- the action benchmark shows cache hits in result metadata;
- repeated action latency is compared with cache on and off;
- M11, M13, and follow-up fixture gates still pass;
- app deny, approval required, and permission errors are not weakened;
- stale element-index behavior is either unchanged and documented, or covered by
  a targeted stale-state test.

## Next M17 Work

- Add lower-level action timing to separate policy, permission check, element
  resolution, and AXPress/CGEvent execution.
- Optimize element-index action resolution, likely by reusing recent state
  context or adding a bounded helper-side element cache.
- Add a stale-state test before reusing cached element context for actions.
