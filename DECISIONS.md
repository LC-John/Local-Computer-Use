# Computer Use Reimplementation Decisions

Date: 2026-06-12

This file records project-level decisions that should remain stable unless new
evidence requires a change.

## D-001: Use Black-Box Compatible Reimplementation

Status: Accepted

Decision: The project will use black-box compatible reimplementation. It will
observe public/local runtime behavior, plugin metadata, bundle structure, MCP
messages, and macOS API effects, then build an independent implementation.

Rationale: This keeps the work focused on observable contracts and avoids source
recovery or copying.

## D-002: Treat Native Computer Use as the Behavioral Oracle

Status: Accepted

Decision: Native Computer Use behavior on this machine is the reference for
tool schemas, state payloads, error behavior, and fixture outcomes.

Rationale: The goal is agent-level compatibility with the installed local
runtime, so native behavior should drive tests and diffs.

## D-003: Do Not Bypass macOS or Codex Safety Boundaries

Status: Accepted

Decision: The implementation and probes must not bypass Screen Recording,
Accessibility, app approval, code signing, security prompts, or privacy prompts.

Rationale: The replacement should be safe, predictable, and compatible with the
same permission model that native Computer Use depends on.

## D-004: Start Protocol Discovery Read-Only

Status: Accepted

Decision: Milestone 3 probes should start with MCP lifecycle messages,
`tools/list`, schema capture, invalid app names, and other non-destructive
requests before action tools are tested.

Rationale: Action tools can operate the real desktop. Read-only probes reduce
risk while establishing the protocol contract.

## D-005: Keep Protocol and macOS Adapter Layers Separate

Status: Accepted

Decision: The eventual reimplementation should separate MCP protocol handling
from native macOS app-state and action helpers.

Rationale: This makes protocol compatibility, fixture tests, and native API
experiments easier to reason about independently.

## D-006: Use Fixture-Based Compatibility Instead of Exact Internal Matching

Status: Accepted

Decision: Compatibility should be judged through fixture behavior, schema
shape, state usefulness, error semantics, and agent success, not byte-for-byte
identity with native internals.

Rationale: Exact internal matching is unnecessary and unavailable in a
black-box project.

## D-007: Preserve a Deny-by-Default Safety Posture for Sensitive Apps

Status: Accepted

Decision: The replacement should support an explicit app policy and should deny
or warn on sensitive apps by default. Terminal apps and Codex should remain
blocked if matching native safety behavior is a project goal.

Rationale: GUI automation can affect state outside the repository and browser
sessions may already be authenticated.

## D-008: Treat Local `list_apps` as User-Facing App Discovery

Status: Accepted

Decision: The local reimplementation should return user-facing applications
from `list_apps`, not every helper, daemon, agent, or XPC process visible to
`NSWorkspace`.

Rationale: Hosted Computer Use presents an app-oriented list that agents can
reason about. Raw process listings include many implementation details such as
helper apps and services that are poor interaction targets.

## D-009: Keep Screenshot Capture in Milestone 7

Status: Accepted

Decision: Milestone 6 should stop at running-app discovery and Accessibility
tree capture. Window screenshots, screenshot dimensions, display scale, and
coordinate alignment are Milestone 7 work.

Rationale: AX state and visual capture have different permission requirements
and failure modes. Keeping them separate makes verification and permission
debugging clearer.

## D-010: Return Local Screenshots by File Path First

Status: Accepted

Decision: The first local screenshot implementation returns PNG file paths under
`.build/screenshots/` instead of inline base64 or MCP image content.

Rationale: File paths are simple to verify locally, avoid large JSON-RPC text
payloads, and provide a stable bridge for fixture images and overlay tooling.
Inline image content can be added later if a Codex MCP client requires it.
