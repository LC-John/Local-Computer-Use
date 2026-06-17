# Milestone 30 Installer and Plugin Refresh Flow

Date: 2026-06-17

Status: Complete for the first installer and plugin refresh flow. M30 adds an
explicit local installer command surface and Dev Manager app entrypoint.

## Purpose

Add the local equivalent of a safe installer/checker flow without silently
modifying unrelated user paths.

M30 answers:

- is the plugin manifest valid?
- does `.mcp.json` point at the bundled client?
- does `~/plugins/local-computer-use` point to this repo?
- can the link be repaired safely?
- what command should refresh Codex plugin metadata?

## Implementation

- `src/installer-cli.mjs` implements:
  - `check`;
  - `repair-link`;
  - `codex-add`.
- `installer:m30:check` validates manifests and plugin link status.
- `installer:m30:repair` creates or repairs the personal plugin symlink.
- `installer:m30:codex-add` runs `codex plugin add local-computer-use@personal`
  only when explicitly invoked.
- The installer refuses to overwrite an existing unrelated plugin path.
- The Dev Manager app exposes an `Installer Check` button.
- `scripts/probe-m30-installer-flow.mjs` verifies the flow in a temporary
  plugin root rather than mutating the user's real plugin directory.

## Verification

Accepted local command:

```bash
npm run verify:m30:installer-flow
```

Accepted result:

```text
M30 installer flow probe passed.
M24 plugin flow probe passed: local-computer-use@0.1.0, tools=10
```

The probe verifies:

- check fails cleanly when the plugin link is missing;
- repair creates the symlink;
- check passes after repair;
- repair refuses to overwrite an unrelated existing plugin path;
- plugin flow still passes through the bundled client.

## Boundaries

M30 does not run `codex plugin add` automatically. That command is exposed as an
explicit installer action because changing Codex plugin metadata should be a
deliberate operation.

M30 does not add a signed installer app bundle. It adds an installer mode and
Dev Manager app command surface; release packaging remains M35 work.
