# Milestone 14 Version Tracking and Maintenance

Date: 2026-06-15

Status: Complete for the first native-version tracking baseline. The repository
now has a repeatable native snapshot command, generated local snapshots for
native Computer Use `1.0.809`, a generated changelog, and a compatibility
matrix. Snapshot output is local generated evidence and is no longer tracked in
git after the workspace cleanup.

## Purpose

Milestone 14 keeps the local reimplementation useful as Codex, the bundled
Computer Use plugin, macOS permissions, or display conditions change. It creates
a durable baseline so future updates can be compared rather than rediscovered.

## Snapshot Command

Run:

```bash
npm run snapshot:m14:native
```

Current accepted output:

```text
Captured native Computer Use 1.0.809 snapshot into snapshots/native/1.0.809
```

The command reads the native plugin cache and installed runtime from:

```text
~/.codex/plugins/cache/openai-bundled/computer-use/1.0.809
~/.codex/computer-use
```

These can be overridden with:

```text
CUA_NATIVE_PLUGIN_ROOT
CUA_NATIVE_RUNTIME_ROOT
```

## Baseline Snapshot

The first M14 snapshot can be regenerated at:

```text
snapshots/native/1.0.809
```

`snapshots/` is ignored by git. Keep the command and docs tracked; regenerate
the snapshot when local evidence is needed.

It contains:

- manifest files: `.codex-plugin/plugin.json`, `.mcp.json`, runtime
  `config.json`;
- protocol artifacts: initialize response, `tools/list`, schemas, tool
  coverage, error catalog, stderr log;
- binary metadata: file type, code-signing details, size, mtime, sha256 for the
  service, client, lock-screen guardian, and installer binaries;
- state evidence index: existing hosted/local/native-timeout fixture state
  artifacts;
- `diff-from-previous.json` and `diff-from-previous.md`.

Since this is the first snapshot, the diff status is `baseline` and there is no
previous native version to compare.

## Maintenance Docs

The snapshot command updates:

```text
docs/native-version-changelog.md
docs/compatibility-matrix.md
```

The compatibility target is currently:

```text
local-computer-use 0.1.0
native computer-use 1.0.809 / runtime 809
```

The matrix records the current fixture gates as M11 passed and M13 passed.
The supplemental follow-up gate is:

```bash
npm run test:followups
```

Current accepted output:

```text
Local MCP follow-up fixture suite passed.
```

## Deferred Gaps

Raw native `get_app_state` payload capture remains partially blocked in this
environment. The snapshot preserves current timeout/hosted/local fixture
evidence instead of claiming full native state parity.

Modal-dialog, multi-window target-window-changed, and synthetic permission-loss
fixtures are now covered by `reports/follow-up-fixtures.json`. Display sleep or
lock remains a manual maintenance check because it disturbs the active desktop
session.

## Recommended Update Flow

After a Codex app update, Computer Use plugin update, macOS update, display
change, or permission reset:

1. Run `npm run snapshot:m14:native`.
2. Inspect `snapshots/native/<version>/diff-from-previous.md`.
3. Run `npm run test:m11:fixtures`.
4. Run `npm run test:m13:negative`.
5. Run `npm run test:followups`.
6. Update compatibility notes if the native tool catalog, error behavior, or
   local fixture gates changed.
