# Milestone 15-18 Performance Roadmap

Date: 2026-06-16

Status: M15 initial baseline implemented and verified as of 2026-06-16. The
local implementation is functionally useful, but it is not yet tuned for
interactive smoothness. This roadmap turns the observed slowness into a sequence
of measurable milestones.

## Why Local Feels Slower

The current local path is intentionally simple and inspectable:

- the MCP server dispatches through Node;
- policy checks may call the Swift helper before the actual tool call;
- the Swift helper is executed as a child process for each command;
- `get_app_state` can traverse a large macOS AX tree;
- screenshot capture shells out to `screencapture`;
- every result is serialized back through JSON.

Codex-hosted Computer Use uses a productized host/service path with app approval
and session context that the local reimplementation does not yet reproduce. The
performance milestones below optimize the independent local path without
claiming private native parity.

## M15: Performance Baseline and Latency Budget

Goal: measure before changing architecture.

Scope:

- add per-phase timing around MCP dispatch, policy, helper startup, AX traversal,
  screenshot capture, JSON serialization, and response size;
- run repeated cold and warm fixture measurements for Calculator, TextEdit,
  Chrome, and Finder;
- report p50 and p95 timings, AX node counts, payload sizes, and screenshot
  timing;
- keep the timing report in `reports/` so later milestones can compare against
  it.

Initial command:

```bash
npm run baseline:m15:performance
```

The command writes generated verification output to:

```text
reports/m15-performance-baseline.json
reports/m15-performance-baseline.jsonl
```

`reports/` is local generated output and is intentionally ignored by git after
the workspace cleanup.

Acceptance:

- one command produces a stable performance report;
- the report identifies the top two latency sources for state reads and actions;
- baseline data is referenced from the milestone doc before M16 begins.

Accepted initial run:

```text
npm run baseline:m15:performance
```

Current local output on 2026-06-16:

```text
initialize: p50=51.45ms p95=51.45ms success=1/1
cold-list-apps: p50=15.5ms p95=15.5ms success=1/1
cold-get-app-state Calculator: p50=797.54ms p95=797.54ms success=1/1
warm-list-apps: p50=15.15ms p95=15.61ms success=3/3
warm-get-app-state Calculator: p50=444.04ms p95=497.72ms success=3/3
warm-get-app-state TextEdit: p50=2487.82ms p95=4470.52ms success=3/3
warm-get-app-state Google Chrome: p50=430.61ms p95=448.05ms success=3/3
warm-get-app-state Finder: p50=1811.59ms p95=1985.14ms success=3/3
```

The same run reported these useful payload and tree sizes:

```text
Calculator: 68 AX nodes, about 41 KB response
TextEdit: 350 AX nodes, about 168 KB response
Google Chrome: 98 AX nodes, about 105 KB response
Finder: 989 AX nodes, about 423 KB response
```

This run reflects the live desktop state at capture time; TextEdit was showing
an Open dialog, and Chrome was showing the active browser window. Treat these as
the first local baseline for relative improvement, not as universal app
benchmarks.

## M16: Long-Lived Helper Service

Status: Initial implementation complete; see
`docs/milestone-16-long-lived-helper.md`.

Goal: remove per-command Swift process startup from the hot path.

Scope:

- add a persistent Node-to-Swift helper protocol;
- keep one-shot helper execution as a fallback;
- cache stable app identity, display metadata, and recent window identity;
- add helper restart, request IDs, structured errors, and timeout handling;
- prove the fixture suites pass through the persistent helper path.

Acceptance:

- warm tool calls do not spawn a new Swift process;
- repeated Calculator and TextEdit action timings improve against M15;
- helper crash or protocol failure is observable and recoverable.

## M17: Fast Action Path and Policy Cache

Status: Initial implementation complete; see
`docs/milestone-17-fast-action-policy-cache.md`.

Goal: make common actions feel interactive.

Scope:

- cache app identity and approval decisions with explicit invalidation;
- avoid duplicate `app-identity` calls when policy is already satisfied;
- add action commands that resolve only the needed app/window/element;
- reuse recent element-index context when it is still valid;
- return clear stale-state errors instead of acting on an unsafe target.

Acceptance:

- click, `type_text`, `press_key`, and TextEdit replacement latency improve
  against M15;
- deny/approval behavior remains covered by M13 tests;
- stale element index tests prove the fast path does not click unintended UI.

## M18: Incremental State and Screenshot Cache

Goal: reduce expensive full state reads.

Status: screenshot-cache and state-mode slices complete as of 2026-06-16.
Repeated Calculator `get_app_state` improved from cache-off full screenshot p50
333.39ms to cache-on full screenshot p50 197.51ms with 5/6 screenshot cache
hits. `focused` no-screenshot reads reached p50 20.71ms with 8 returned nodes.
One cache-on p95 outlier was observed, so the screenshot-cache claim remains p50
warm-read improvement only.

Scope:

- done: cache the most recent screenshot by app/window identity and bounds;
- done: expose screenshot freshness metadata in state payloads;
- done: invalidate screenshot cache on window changes;
- done: add state modes `full`, `visible`, and `focused`;
- done: allow `includeScreenshot=false` for AX-only state reads;
- future: add changed-only reads with stable freshness metadata;
- future: cache AX trees with app/window identity and freshness metadata;
- future: keep overlay validation working for cached and fresh screenshots;
- future: cap large AX payloads with documented pruning rules.

Acceptance:

- repeated warm state reads improve at p50 with cache enabled;
- cached screenshots are not reused after target-window changes;
- state payloads expose freshness metadata;
- lighter state modes reduce payload size and latency without changing the
  default full state behavior.

## M19: Large App State Budget and Default Policy

Goal: validate M18 state modes on larger real app fixtures and turn the results
into a caller policy.

Status: first pass complete as of 2026-06-17. Chrome, Finder, and TextEdit were
measured with `fullScreenshot`, `fullNoScreenshot`, `visibleNoScreenshot`, and
`focusedNoScreenshot`. Finder showed the largest win: full+screenshot p50
305.44ms with 276 nodes versus focused no-screenshot p50 15.01ms with 18 nodes.

Scope:

- done: add `benchmark:m19:large-state`;
- done: measure Chrome, Finder, and TextEdit fixture windows;
- done: record payload byte and node count budgets;
- done: keep reports metric-only, without full browser/file-manager AX trees;
- done: document the default state-read policy for callers;
- future: use budgets for automatic state-mode selection in a higher-level agent
  loop.

Acceptance:

- large-app benchmark runs on local fixture windows;
- each app records p50 latency, p95 latency, payload bytes, node count, and
  screenshot cache status;
- default public behavior remains `full` + screenshot;
- docs state when callers should choose `focused`, `visible`, full no-screenshot,
  or full screenshot reads.

## M20: State Policy Helper

Goal: make M19's state-read policy reusable by future callers.

Status: first helper complete as of 2026-06-17. `src/state-policy.mjs` maps
workflow scenarios to `get_app_state` arguments while preserving the public
default of full+screenshot.

Scope:

- done: add `chooseStateReadPolicy`;
- done: add `applyStateReadPolicy`;
- done: cover observe, inspect, action planning, coordinate action, stale state,
  and window-change scenarios;
- done: add `probe:m20:state-policy`;
- future: integrate the helper into a higher-level agent loop.

Acceptance:

- state policy outputs can be passed directly to `get_app_state`;
- repeated observation chooses focused no-screenshot;
- coordinate workflows choose full screenshot;
- unknown scenarios fail loudly;
- MCP server default behavior is unchanged.

## M21+: Dev Manager App Track

Goal: app-ize the developer management surface without changing the current MCP
runtime.

Status: M21 scope and architecture complete as of 2026-06-17. The project should
build a lightweight macOS Dev Manager App around the existing
plugin/server/helper stack:

```text
Codex plugin -> node src/server.mjs -> .build/ax-state serve
```

Scope:

- M21: done, define app scope, architecture, goals, and non-goals;
- M22: build a minimal SwiftUI app shell;
- M23: add diagnostics and test runner UI;
- M24: add plugin install, validate, and smoke-test flow;
- M25: package polish and handoff docs.

Non-goals for this track:

- no multi-client MCP host;
- no socket or HTTP MCP transport;
- no launchd/system daemon;
- no locked computer use;
- no replacement for the bundled OpenAI `computer-use` plugin.

The official bundled macOS Computer Use plugin is app-shaped, with a bundled
`Codex Computer Use.app` and `SkyComputerUseClient mcp` entry. The local project
uses that as directional validation for app packaging, but the first app track
only productizes diagnostics and developer operations.

## Recommended Order

Do these in order:

```text
M15: measure and set budgets
M16: remove helper startup cost
M17: reduce repeated action overhead
M18: reduce repeated state and screenshot overhead
M19: validate state budgets on larger apps
M20: centralize state-mode selection policy
M21: define Dev Manager App track
```

This order keeps the optimization work honest: each later milestone must beat
the M15 baseline while preserving the fixture and safety gates from M11, M13,
and the follow-up suite.
