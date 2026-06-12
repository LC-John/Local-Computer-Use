# Codex Computer Use Architecture Report

Date: 2026-06-12

This report summarizes the observed architecture of Codex Computer Use on this
machine. It is based on local filesystem inspection, plugin manifests, macOS
bundle metadata, dynamic library inspection, and static string evidence from the
installed binaries. It also compares those findings with an external reverse
engineering summary provided by the user.

## Executive Summary

Codex Computer Use is implemented as a Codex plugin that exposes a local MCP
server. The MCP entrypoint is a native macOS binary named
`SkyComputerUseClient`. That client is not the full system by itself; it works
with the installed `Codex Computer Use.app` bundle and the local service binary
`SkyComputerUseService`.

The effective runtime chain is:

```text
Codex thread
-> computer-use plugin enabled in Codex config
-> MCP server: SkyComputerUseClient mcp
-> local app/service: Codex Computer Use.app / SkyComputerUseService
-> macOS native APIs and permissions
-> target desktop app UI
```

In practical terms, the model decides which action to take, but the actual
screen reading and UI operation are performed locally on macOS by the Computer
Use app/service through native screen capture and accessibility capabilities.

## Installed Locations

### Plugin Cache

The bundled plugin is cached at:

```text
/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809
```

Important files:

```text
/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809/.codex-plugin/plugin.json
/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809/.mcp.json
/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809/skills/computer-use/SKILL.md
/Users/lczhang/.codex/plugins/cache/openai-bundled/computer-use/1.0.809/Codex Computer Use.app
```

### Installed Runtime App

The active installed app bundle is:

```text
/Users/lczhang/.codex/computer-use/Codex Computer Use.app
```

Important binaries and helper apps:

```text
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/Codex Computer Use Installer.app
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/CUALockScreenGuardian.app
```

## Codex Configuration

The plugin is enabled in:

```text
/Users/lczhang/.codex/config.toml
```

Relevant configuration:

```toml
[plugins."computer-use@openai-bundled"]
enabled = true
```

The same config also contains a notification hook that points at the installed
Computer Use client:

```toml
notify = ["/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient", "turn-ended"]
```

## MCP Entrypoint

The plugin's `.mcp.json` registers the MCP server:

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
      "args": ["mcp"],
      "cwd": "."
    }
  }
}
```

The effective command is:

```bash
"/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient" mcp
```

`SkyComputerUseClient` is a native executable:

```text
Mach-O 64-bit executable arm64
```

It is not a Node.js MCP server. It is also separate from the `node_repl` MCP
server, which exposes JavaScript execution tools and is not the Computer Use
implementation.

## Native Components

### SkyComputerUseClient

Path:

```text
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient
```

Role:

- Acts as the MCP-facing entrypoint for Codex.
- Accepts subcommands including `mcp`, `event-stream`, `skysight`, and
  `turn-ended`.
- Communicates with the local Computer Use service rather than implementing the
  entire feature as a standalone binary.

Observed help output:

```text
USAGE: cua <subcommand>

SUBCOMMANDS:
  mcp                     Runs the Computer Use client as an MCP server
  event-stream
  skysight
  turn-ended              Handles a Codex turn-ended notification
```

Bundle metadata:

```text
CFBundleName = SkyComputerUseClient
CFBundleIdentifier = com.openai.sky.CUAService.cli
LSMinimumSystemVersion = 14.4
LSUIElement = true
```

Entitlements include:

```text
com.apple.application-identifier = 2DC432GLL2.com.openai.sky.CUAService.cli
com.apple.security.application-groups = 2DC432GLL2.com.openai.sky.CUAService
keychain-access-groups = 2DC432GLL2.*
```

These entitlements suggest the client is designed to participate in a signed
app-group based local architecture, not to be copied and run as an isolated
single-file utility.

### SkyComputerUseService

Path:

```text
/Users/lczhang/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService
```

Role:

- Serves as the main local Computer Use service binary.
- Bridges the MCP-facing client with macOS GUI automation primitives.
- Links against native macOS frameworks used for app interaction, screen
  capture, event handling, and UI automation.

### Helper Apps

Additional helper apps in the same bundle:

```text
Contents/SharedSupport/Codex Computer Use Installer.app
Contents/SharedSupport/CUALockScreenGuardian.app
Contents/SharedSupport/SkyComputerUseClient.app
```

The presence of `CUALockScreenGuardian.app` aligns with the documented locked
Computer Use behavior on macOS.

## macOS Native Dependencies

`otool -L` shows that `SkyComputerUseClient` and `SkyComputerUseService` link
primarily against system frameworks and Swift runtime libraries, including:

```text
/System/Library/Frameworks/AppKit.framework
/System/Library/Frameworks/ApplicationServices.framework
/System/Library/Frameworks/ScreenCaptureKit.framework
/System/Library/Frameworks/WebKit.framework
/System/Library/Frameworks/ScriptingBridge.framework
/System/Library/Frameworks/Network.framework
/System/Library/Frameworks/Security.framework
/usr/lib/swift/*
```

The most relevant capability areas are:

- Screen capture: Screen Recording permission and ScreenCaptureKit.
- UI operation: Accessibility permission, ApplicationServices, and event APIs.
- App/window integration: AppKit and related macOS frameworks.
- Event injection: static string evidence includes `CGEvent`,
  `CGEventSource`, and related names.

This matches the documented macOS permission model: Screen Recording allows
Codex to see target apps, and Accessibility allows it to click, type, and
navigate.

## Static Evidence from Binary Strings

Static string inspection of `SkyComputerUseClient` surfaced evidence for the
following areas:

```text
ComputerUseIPCXPCTransport
NSXPCConnection
SAIComputerUseIPCXPCProtocol
Accessibility error
AccessibilitySPI
CGEvent
CGEventSource
tools/list
initialize
notifications/initialized
computer_use_mcp_server_launched
computer_use_mcp_tool_called
```

These strings support the model that `SkyComputerUseClient` is an MCP-facing
native client that communicates over IPC/XPC with a local service, which then
uses macOS accessibility and event APIs.

## Resource Bundles

The client app includes resource bundles:

```text
Resources/SwiftProtobuf_SwiftProtobuf.bundle
Resources/Package_ComputerUseClient.bundle
Resources/SkyComputerUseClient_Parent.coderequirement
```

`Package_ComputerUseClient.bundle` contains app-specific instruction files such
as:

```text
AppInstructions/Notion.md
AppInstructions/Spotify.md
AppInstructions/iPhone Mirroring.md
AppInstructions/AppleMusic.md
AppInstructions/Numbers.md
AppInstructions/Clock.md
```

These files appear to provide app-specific behavior guidance for Computer Use.

## Relationship to Exposed Codex Tools

In this Codex session, the enabled plugin exposes Computer Use tools such as:

```text
mcp__computer_use.get_app_state
mcp__computer_use.click
mcp__computer_use.type_text
mcp__computer_use.press_key
mcp__computer_use.scroll
mcp__computer_use.drag
mcp__computer_use.set_value
mcp__computer_use.select_text
mcp__computer_use.perform_secondary_action
```

The expected interaction loop is:

```text
1. Codex calls get_app_state for an app.
2. Computer Use returns screenshot/accessibility state.
3. Codex decides the next action.
4. Codex calls click/type/scroll/drag/etc.
5. The local service applies the action through macOS.
6. Codex calls get_app_state again to verify the result.
```

## Comparison with External Reverse Engineering Summary

The external summary provided by the user claims the architecture is:

```text
SkyComputerUseClient
  -> IPC/XPC
  -> SkyComputerUseService
  -> Accessibility / ScreenCaptureKit / CGEvent
```

This is consistent with local evidence.

Locally verified matches:

- `node_repl` is not the Computer Use implementation.
- The real MCP entrypoint is `SkyComputerUseClient mcp`.
- The entrypoint is declared by the Computer Use plugin `.mcp.json`.
- `SkyComputerUseClient` is a native macOS binary.
- `SkyComputerUseService` exists in the installed `Codex Computer Use.app`
  bundle.
- The client exposes subcommands including `mcp`, `event-stream`, `skysight`,
  and `turn-ended`.
- Static strings include XPC, MCP, Accessibility, and CGEvent-related symbols.
- The implementation model is native macOS GUI control rather than a
  JavaScript/Node automation stack.

Not locally verified in this pass:

- The full MCP `initialize`, `tools/list`, and `tools/call` schemas.
- Hidden tool behavior and exact error formats.
- Behavior against Calculator, Chrome, Cursor/opencc, or other fixtures.
- The external reproduction project's implementation files, such as
  `src/ax-state.swift`, `src/ax-action.swift`, `src/window-screenshot.swift`,
  or `src/mac-adapter.js`.

The referenced external documents were not present under this machine's
`/Users/lczhang/Documents` tree:

```text
/Users/zkcpku/Documents/cua/FULL_REVERSE_ENGINEERING.md
/Users/zkcpku/Documents/cua/IMPLEMENTATION_GUIDE.md
```

## Security and Permission Boundaries

Computer Use depends on several layers of permission:

- Codex plugin enablement in `config.toml`.
- Per-app approval inside Codex.
- macOS Screen Recording permission.
- macOS Accessibility permission.
- Codex thread sandbox and approval settings for file edits and shell commands.

The GUI actions can affect state outside the project workspace. Browser use can
also act within already-authenticated browser sessions. Therefore, Computer Use
should be used with narrow task scope and explicit review of app permission
prompts.

The documented product boundary is that Computer Use cannot automate terminal
apps or Codex itself, and it cannot approve administrator/security/privacy
prompts on the user's behalf.

## Final Model

Computer Use is best understood as a local native-control bridge:

```text
Codex model reasoning
-> MCP tool request
-> SkyComputerUseClient
-> IPC/XPC transport
-> SkyComputerUseService
-> macOS ScreenCaptureKit / Accessibility / CGEvent / AppKit
-> target app GUI
```

The model does not directly control macOS. The local signed Computer Use app
does the actual screen reading and UI operations, with Codex deciding what tool
call to issue next based on returned state.
