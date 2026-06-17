# Milestone 12 Codex Plugin Packaging

Date: 2026-06-15

Status: Complete. The repo-local plugin bundle is validated, listed in the
personal marketplace, installed through Codex, enabled, and verified from a fresh
Codex thread with read and action smoke tests.

## Purpose

Package the local Computer Use reimplementation so Codex can load it as a
distinct plugin without replacing or colliding with the bundled OpenAI Computer
Use plugin.

## Plugin Identity

The plugin name is:

```text
local-computer-use
```

It intentionally differs from the bundled `computer-use` plugin. This keeps
testing explicit and avoids ambiguity when both plugins are available.

## Implemented Bundle

The repo root is now a plugin bundle:

```text
.codex-plugin/plugin.json
.mcp.json
skills/computer-use/SKILL.md
src/app-bridge.mjs
src/server.mjs
```

The manifest points at:

```json
{
  "mcpServers": "./.mcp.json",
  "skills": "./skills/"
}
```

The MCP server entry is portable within the plugin root:

```json
{
  "command": "node",
  "args": ["src/app-bridge.mjs"],
  "cwd": "."
}
```

M12 originally pointed directly at `src/server.mjs`. M26 changed the packaged
entry to the resident-app stdio bridge while preserving the same tool surface.

## Verification

Validation command:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

Local MCP and fixture command:

```bash
npm run test:m11:fixtures
```

The fixture gate should report:

```text
Local MCP M11 fixture test suite passed.
```

Installed plugin checks:

```bash
codex plugin list
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  ~/.codex/plugins/cache/personal/local-computer-use/0.1.0
```

Accepted installed status:

```text
local-computer-use@personal  installed, enabled  0.1.0
```

The installed cache bundle also starts successfully through its `.mcp.json` and
returns MCP initialize metadata:

```json
{
  "serverInfo": {
    "name": "Local Computer Use",
    "version": "0.1.0"
  },
  "protocolVersion": "2025-06-18"
}
```

Fresh-thread Codex smoke test:

```text
list_apps: passed
get_app_state(Calculator): passed
Calculator action sequence: AllClear -> 1 -> Add -> 2 -> Equals
Final Calculator state: expression 1+2, result 3
```

## Install Notes

This milestone creates a repo-local plugin bundle and installs it through the
default personal marketplace. The source path is:

```text
~/plugins/local-computer-use -> /Users/lczhang/Documents/computer-use
```

The personal marketplace entry is:

```json
{
  "name": "local-computer-use",
  "source": {
    "source": "local",
    "path": "./plugins/local-computer-use"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Developer Tools"
}
```

Installation command:

```bash
codex plugin add local-computer-use@personal
```

Do not overwrite the bundled OpenAI `computer-use` plugin.

If a marketplace-backed personal plugin is desired later, create a separate
marketplace entry for `local-computer-use` rather than renaming this plugin to
`computer-use`.

## Post-M12 Notes

- Running threads do not pick up newly installed MCP tools; use a fresh Codex
  thread after reinstalling or changing plugin metadata.
- Future plugin updates should use the cachebuster/reinstall flow before
  retesting in a fresh thread.
