# Milestone 20 State Policy Helper

Date: 2026-06-17

Status: Complete for the first local state-policy helper. M20 converts the M19
state budget guidance into a reusable JavaScript policy module without changing
the public `get_app_state` default.

## Purpose

M19 measured when lighter state reads are useful. M20 makes those choices
consistent by mapping workflow scenarios to `get_app_state` arguments:

```text
observe           -> focused + no screenshot
inspect           -> visible + no screenshot
plan_action       -> full + no screenshot
coordinate_action -> full + screenshot
after stale state -> full + screenshot
after window move -> full + screenshot
```

## Implementation

The helper lives at:

```text
src/state-policy.mjs
```

Primary exports:

- `chooseStateReadPolicy(options)`: returns the state mode, screenshot setting,
  budget, and reason for a scenario.
- `applyStateReadPolicy(app, decision)`: converts a decision into
  `get_app_state` arguments.
- `knownStateScenarios()`: lists supported scenario names.
- `statePolicyBudgets`: records current p50 budget targets from M19.

The helper is intentionally separate from `src/server.mjs`. The MCP tool default
remains native-compatible:

```text
get_app_state({ app }) => full + screenshot
```

Callers and future agent loops can opt into M20 policy explicitly.

## Scenario Policy

| Scenario | State args | Reason |
| --- | --- | --- |
| `observe` | `stateMode=focused`, `includeScreenshot=false` | Fast repeated observation after app/window identity is known. |
| `inspect` | `stateMode=visible`, `includeScreenshot=false` | Nearby UI context without the full tree or screenshot. |
| `plan_action` | `stateMode=full`, `includeScreenshot=false` | Complete AX structure without current pixels. |
| `coordinate_action` | `stateMode=full`, `includeScreenshot=true` | Current pixels and coordinate metadata are required. |
| stale/window-changed | `stateMode=full`, `includeScreenshot=true` | Refresh after a state freshness boundary. |

## Verification

Run:

```bash
npm run probe:m20:state-policy
```

Accepted local result on 2026-06-17:

```text
M20 state policy probe passed: observe=focused/skipped, coordinate=full/captured
```

The probe also verifies that unknown scenarios fail loudly and that policy
outputs can be passed directly to `get_app_state`.

## Future Work

- Wire the helper into a higher-level agent loop.
- Use recent error context to choose `after_stale_error` automatically.
- Add per-app overrides if future large-app budgets show a better observation
  mode than `focused`.
