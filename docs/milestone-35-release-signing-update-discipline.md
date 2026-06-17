# Milestone 35 Release, Signing, and Update Discipline

Date: 2026-06-17

Status: Complete for the first native-shaped release discipline pass. M35 adds
version metadata and a single verification command for the local native-shaped
runtime.

## Purpose

Make the M27-M34 native-shaped runtime easy to rebuild, verify, and update.

## Implementation

- `VERSION.json` records app, client, service, plugin, helper, and milestone
  version metadata.
- `scripts/probe-m35-release-package.mjs` verifies:
  - version metadata exists;
  - plugin version matches version metadata;
  - the generated app bundle exists;
  - the bundled client app exists;
  - service and client executables exist;
  - `.mcp.json` points at the bundled client;
  - app and client app are ad-hoc signed.
- `verify:m35:native-shape` runs the release package probe plus M34, M30, and
  M29 gates.

## Verification

Accepted local command:

```bash
npm run verify:m35:native-shape
```

Accepted result:

```text
M35 release package probe passed: app=0.1.0, plugin=0.1.0
M34 locked-use feasibility probe passed.
M30 installer flow probe passed.
M29 service lifecycle probe passed: sessions=...
```

## Update Discipline

When changing plugin metadata or `.mcp.json`:

1. Run `npm run verify:m35:native-shape`.
2. Run `python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .`.
3. If plugin metadata changed, run `npm run installer:m30:repair`.
4. If Codex plugin cache needs refresh, explicitly run
   `npm run installer:m30:codex-add`.
5. Open a fresh Codex thread after plugin metadata or MCP entry changes.

## Boundaries

M35 uses ad-hoc local signing only. Developer ID signing, notarization, and
release distribution remain outside this local project pass.
