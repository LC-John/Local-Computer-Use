# Milestone 4 Closure Attempt

Date: 2026-06-15

Status: Not closed. The latest closure attempt reconfirmed that hosted Computer
Use can return state, but raw native and proxied `get_app_state` capture still
time out after app approval.

## What Was Rechecked

The direct native probe was rerun with automatic elicitation acceptance:

```bash
CUA_AUTO_ACCEPT_ELICITATION=1 CUA_STATE_TIMEOUT_MS=90000 \
  node scripts/probe-native-state.mjs Calculator m4-recheck
```

It still timed out waiting for the final `tools/call` response after
`elicitation/create` was accepted.

Stale orphan proxy and `SkyComputerUseClient mcp` processes from older probe
runs were cleaned up, then the direct native probe was retried:

```bash
CUA_AUTO_ACCEPT_ELICITATION=1 CUA_STATE_TIMEOUT_MS=45000 \
  node scripts/probe-native-state.mjs Calculator m4-after-cleanup
```

The timeout persisted.

The same direct native probe was tried with app identity variants:

```bash
CUA_AUTO_ACCEPT_ELICITATION=1 CUA_STATE_TIMEOUT_MS=30000 \
  node scripts/probe-native-state.mjs com.apple.calculator m4-bundle-id

CUA_AUTO_ACCEPT_ELICITATION=1 CUA_STATE_TIMEOUT_MS=30000 \
  node scripts/probe-native-state.mjs /System/Applications/Calculator.app m4-app-path
```

Both timed out, so the blocker is not simple app-name resolution.

The hosted-context replay was rerun:

```bash
CUA_HOST_CONTEXT_STATE_TIMEOUT_MS=45000 npm run probe:m10:host
```

It again reproduced the native state gap.

## Hosted Oracle Check

The official hosted Computer Use tool in the current Codex context returned
Calculator state and screenshot successfully:

```text
mcp__computer_use.get_app_state({ app: "Calculator" }): success
```

The proxy-hosted tool did not return a state payload:

```text
mcp__computer_use_proxy.get_app_state({ app: "Calculator" }): timeout
```

The latest proxy capture only showed initialize, `tools/list`, and resource
probes. It did not contain a successful raw `tools/call get_app_state` response.

## Artifacts

The attempt summary is recorded in:

```text
reports/m4-closure-attempt.json
```

Timeout evidence is recorded under:

```text
fixtures/Calculator/m4-recheck/
fixtures/Calculator/m4-after-cleanup/
fixtures/com.apple.calculator/m4-bundle-id/
fixtures/_System_Applications_Calculator.app/m4-app-path/
```

## Conclusion

M4 should remain open. The usable state oracle is the hosted Computer Use tool,
but raw native/proxy state capture is still blocked after app approval. This
same gap continues to gate raw native-vs-local state diffing in M10.2/M10.3.
