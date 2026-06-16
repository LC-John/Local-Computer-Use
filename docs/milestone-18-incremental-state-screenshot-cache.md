# Milestone 18 Incremental State and Screenshot Cache

Date: 2026-06-16

Status: Complete for the first M18 slice. The implementation adds a same-window
screenshot cache for repeated `get_app_state` calls without changing the MCP
tool schema.

## Purpose

M18 reduces repeated state-read overhead. After M17, action latency is lower and
`get_app_state` dominates more workflows. The first safe optimization is to skip
re-running `/usr/sbin/screencapture` when the app pid, CoreGraphics window ID,
and window bounds are unchanged within a short TTL.

## Implementation

The Swift helper keeps the most recent screenshot payload in persistent-helper
memory. The cache key includes:

- app pid;
- CoreGraphics window ID;
- window x/y/width/height.

The default screenshot cache TTL is 1000ms. It can be configured with:

```text
LOCAL_CUA_SCREENSHOT_CACHE_TTL_MS
```

The cache can be disabled with:

```text
LOCAL_CUA_SCREENSHOT_CACHE=0
```

Every `get_app_state` screenshot payload now includes:

```text
screenshot.cache.status = hit | miss
screenshot.cache.ageMs
screenshot.cache.ttlMs
```

AX tree traversal still runs on every state read in this first M18 slice. That
keeps state freshness conservative while proving the screenshot cache boundary.

## Benchmark

Run:

```bash
npm run benchmark:m18:state
```

The benchmark repeats `get_app_state` for Calculator with screenshot cache
enabled and disabled, then writes local generated output to:

```text
reports/m18-state-cache-benchmark.json
reports/m18-state-cache-benchmark-cache-on.jsonl
reports/m18-state-cache-benchmark-cache-off.jsonl
```

Latest local result:

```text
cache-on p50=192.46ms, hits=5/6
cache-off p50=372.64ms, hits=0/6
```

The cache-on run had one noisy p95 outlier at 3153.56ms, so the accepted result
is a p50 warm-read improvement rather than a tail-latency claim.

## Validation

Run:

```bash
npm run probe:m18:cache-invalidation
npm run probe:local
npm run test:m11:fixtures
npm run test:m13:negative
npm run test:followups
```

Accepted local results on 2026-06-16:

- `benchmark:m18:state`: passed with screenshot hits enabled and disabled runs.
- `probe:m18:cache-invalidation`: passed, proving a moved Calculator window
  invalidates the cached screenshot.
- `probe:local`: passed.
- `test:m11:fixtures`: passed.
- `test:m13:negative`: passed.
- `test:followups`: passed.

## Remaining Future Work

This M18 slice intentionally avoids deeper incremental AX-tree caching. Later
state work can still add:

- state-read modes such as full, visible, focused, and changed-only;
- cached AX trees with event or freshness invalidation;
- payload pruning for very large app trees;
- overlay validation that explicitly checks cached and freshly captured images.
