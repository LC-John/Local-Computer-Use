# Milestone 19 Large App State Budget

Date: 2026-06-17

Status: Complete for the first large-app state budget pass. M19 measures the M18
state modes on deterministic Chrome, Finder, and TextEdit fixtures, then records
the default state-read policy that should guide callers.

## Purpose

M18 proved screenshot caching and lighter state modes on Calculator. M19 checks
whether those modes still matter on larger or more realistic apps, where full AX
trees can dominate latency and payload size.

## Benchmark

Run:

```bash
npm run benchmark:m19:large-state
```

The benchmark opens local fixture windows for:

- Google Chrome: `fixtures/Chrome/static-page/index.html`
- Finder: `fixtures/Finder/project-list`
- TextEdit: `.build/m19-textedit-state-fixture.txt`

The script writes metric-only output to:

```text
reports/m19-large-state-benchmark.json
```

It intentionally does not write full MCP JSONL traffic because browser and file
manager AX trees can contain user-visible titles or text.

## Local Results

Accepted local result on 2026-06-17:

```text
Chrome full+screenshot p50=33.37ms, nodes=44
Chrome focused no-screenshot p50=10.95ms, nodes=7

Finder full+screenshot p50=305.44ms, nodes=276
Finder focused no-screenshot p50=15.01ms, nodes=18

TextEdit full+screenshot p50=16.87ms, nodes=13
TextEdit focused no-screenshot p50=14.06ms, nodes=12
```

Payload comparison:

```text
Chrome full+screenshot p50 payload=37366 bytes
Chrome focused no-screenshot p50 payload=4570 bytes

Finder full+screenshot p50 payload=102421 bytes
Finder focused no-screenshot p50 payload=8221 bytes

TextEdit full+screenshot p50 payload=7310 bytes
TextEdit focused no-screenshot p50 payload=6257 bytes
```

## State Policy

The public default remains native-compatible:

```text
get_app_state({ app }) => stateMode=full, includeScreenshot=true
```

Callers should opt into lighter reads:

- Use `focused` + `includeScreenshot=false` for repeated observation loops after
  an app/window has already been identified.
- Use `visible` + `includeScreenshot=false` when a workflow needs surrounding UI
  context but not the complete tree.
- Use `full` + `includeScreenshot=false` when text/AX completeness matters but
  screenshot coordinates are not needed.
- Use `full` + `includeScreenshot=true` before screenshot-coordinate actions,
  overlay validation, or any step that needs current image pixels.
- Force `full` after app/window changes, stale element errors, or when a lighter
  tree does not expose the intended target.

## Interpretation

Finder is the clearest win: focused no-screenshot reads reduced p50 latency from
305.44ms to 15.01ms and node count from 276 to 18. Chrome also benefits in
payload size even though the local fixture page is small. TextEdit is already
small enough that state modes do not materially change latency.

M19 does not enable automatic server-side downgrading. The server continues to
return full screenshot state by default so existing fixtures and native-shaped
callers stay compatible.

## Verification

Accepted validation:

```bash
npm run benchmark:m19:large-state
node --check scripts/run-m19-large-state-benchmark.mjs
git diff --check
```

M11/M13/follow-up regression gates remain the broader compatibility check before
changing default state behavior.
