# Milestone 18 Incremental State and Screenshot Cache

Date: 2026-06-16

Status: Complete for the first M18 slice and state-mode follow-up. The
implementation adds a same-window screenshot cache plus opt-in lighter
`get_app_state` reads.

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

`get_app_state` also accepts two optional local extension arguments:

```text
includeScreenshot = true | false
stateMode = full | visible | focused
```

The default remains `includeScreenshot=true` and `stateMode=full`, preserving the
native-compatible behavior. `includeScreenshot=false` returns
`screenshot.status=skipped` and avoids Screen Recording permission checks for
AX-only state reads. `visible` and `focused` use shallower AX traversal limits to
reduce payload and latency.

AX tree traversal still runs fresh on every state read. M18 reduces capture and
payload cost without reusing stale AX tree objects as state.

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
cache-on full screenshot p50=197.51ms, hits=5/6
cache-off full screenshot p50=333.39ms, hits=0/6
full no screenshot p50=180.76ms
focused no screenshot p50=20.71ms
```

The cache-on run had one noisy p95 outlier at 1960.2ms, so the accepted
screenshot-cache result is a p50 warm-read improvement rather than a
tail-latency claim.

Run:

```bash
npm run probe:m18:state-modes
```

Latest local result:

```text
full=68 nodes
visible=12 nodes
focused=8 nodes
```

## Validation

Run:

```bash
npm run probe:m18:cache-invalidation
npm run probe:m18:state-modes
npm run probe:local
npm run test:m11:fixtures
npm run test:m13:negative
npm run test:followups
```

Accepted local results on 2026-06-16:

- `benchmark:m18:state`: passed with screenshot hits enabled and disabled runs.
- `probe:m18:cache-invalidation`: passed, proving a moved Calculator window
  invalidates the cached screenshot.
- `probe:m18:state-modes`: passed, proving schema exposure, screenshot skipping,
  and reduced tree sizes for `visible` and `focused`.
- `probe:local`: passed.
- `test:m11:fixtures`: passed.
- `test:m13:negative`: passed.
- `test:followups`: passed.

## Remaining Future Work

This M18 slice intentionally avoids deeper incremental AX-tree caching. Later
state work can still add:

- cached AX trees with event or freshness invalidation;
- changed-only reads with a stable tree hash or revision marker;
- payload pruning for very large app trees;
- overlay validation that explicitly checks cached and freshly captured images.
