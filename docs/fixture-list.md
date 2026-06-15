# Initial Computer Use Fixture List

Date: 2026-06-12

This file defines the first fixture set for MCP protocol discovery, state model
discovery, and later action-tool regression tests.

## Fixture Selection Principles

- Prefer stable built-in macOS apps before user-profile-dependent apps.
- Start with read-only state capture before action execution.
- Keep setup and cleanup deterministic.
- Include both accessibility-rich and browser-like surfaces.
- Avoid sensitive apps, terminal apps, Codex, and security/privacy prompts.

## Phase 1: Read-Only State Fixtures

### Calculator: Basic Window

Purpose: Validate app resolution, screenshot capture, button accessibility
labels, element indexing, and simple coordinate mapping.

Setup:

- Open Calculator.
- Reset to the standard calculator view.

Capture:

- `get_app_state` result.
- Screenshot.
- Accessibility tree.
- Element indexes for numeric and operator buttons.

Expected observations:

- Window metadata is present.
- Numeric buttons are visible in state.
- Screenshot is nonblank and corresponds to Calculator.

Current artifact directory:

```text
fixtures/Calculator/basic/
```

Current local reimplementation status:

- `LOCAL_CUA_PROBE_APP=Calculator npm run probe:local` verifies local app
  resolution, AX tree capture, and screenshot file capture.
- Native-hosted fixture comparison remains open.

### TextEdit: Plain Text Document

Purpose: Validate editable text areas, focus state, typing targets, and AX value
behavior.

Setup:

- Open TextEdit.
- Open `fixtures/TextEdit/plain-text/source.txt`.

Capture:

- `get_app_state` result before typing.
- Accessibility tree for the document text area.
- Element index for the editable region.

Expected observations:

- Editable text area is discoverable.
- Focus or action metadata is available for text insertion.

Current artifact directory:

```text
fixtures/TextEdit/plain-text/
```

Current local reimplementation status:

- Local AX reader support is implemented through `get_app_state`.
- Local M7 screenshot and bounds overlay artifacts are captured in this fixture
  directory.
- Fixture-specific hosted/native diffing remains open.

### Safari or Chrome: Static Page

Purpose: Validate browser window state, address/search field visibility, page
content exposure, and scrollable areas.

Setup:

- Open Safari or Chrome.
- Navigate to a local static page or a simple known page.

Capture:

- `get_app_state` result.
- Address bar or page content elements where available.
- Scrollable region metadata.

Expected observations:

- Browser app/window is resolved.
- Screenshot and accessibility content describe the same page.

Current artifact directory:

```text
fixtures/Chrome/static-page/
```

Current local reimplementation status:

- Local AX reader support is implemented through `get_app_state`.
- Browser AX trees can be noisy because tabs and page content are both exposed.
- Local M7 screenshot and bounds overlay artifacts are captured in this fixture
  directory against the deterministic static page.
- Fixture-specific hosted/native diffing remains open.

### Finder: Simple Folder Window

Purpose: Validate list/grid controls, selection state, file item labels, and
non-text app controls.

Setup:

- Open Finder to a small folder with known files.

Capture:

- `get_app_state` result.
- Accessibility tree for the file list.
- Element indexes for at least one file item and toolbar control.

Expected observations:

- File names appear in the state payload.
- Selection and toolbar controls are represented clearly enough for navigation.

Current artifact directory:

```text
fixtures/Finder/project-list/
```

Current local reimplementation status:

- Local AX reader support is implemented through `get_app_state`.
- Local M7 screenshot and bounds overlay artifacts are captured in this fixture
  directory.
- Fixture-specific hosted/native diffing remains open.

## Phase 2: Safe Action Fixtures

### Calculator: Arithmetic Smoke Test

Purpose: Validate `click`, element indexes, coordinate mapping, and state
refresh after actions.

Sequence:

- Capture initial state.
- Click `1`, `+`, `2`, `=`.
- Capture final state.

Expected result:

- Calculator displays `3`.

### TextEdit: Type and Select Text

Purpose: Validate `type_text`, `press_key`, `select_text`, and `set_value`
where supported.

Sequence:

- Capture empty document state.
- Type a short ASCII sentence.
- Select the typed sentence.
- Replace it with another short ASCII sentence.

Expected result:

- Final document text matches the expected replacement.

### Browser: Form Input and Scroll

Purpose: Validate click, typing, key press, scrolling, and visual-state refresh
in a browser-like app.

Sequence:

- Open a local static test page containing a text input, button, and scrollable
  content.
- Click the input.
- Type text.
- Press Return or click the button.
- Scroll down.

Expected result:

- Input text is reflected on the page.
- Scroll position changes and state refresh captures it.

## Phase 3: Negative and Safety Fixtures

### Missing App

Purpose: Verify app-not-found error behavior.

Input:

- Call `get_app_state` for a deliberately invalid app name.

Expected result:

- A clear, machine-readable app-not-found error.

### Denied App

Purpose: Verify app policy enforcement.

Input:

- Attempt state or action calls against an app configured as denied.

Expected result:

- A clear denied-app error.
- No GUI action is executed.

### Missing Permissions

Purpose: Verify Accessibility and Screen Recording error behavior.

Input:

- Run probes in an environment where the relevant permission is unavailable or
  revoked, if safe to do so.

Expected result:

- A clear permission-pending or permission-denied error.
- No attempt to bypass macOS prompts.

## Fixture Artifact Layout

Captured fixtures should use this layout:

```text
fixtures/<app>/<case>/native-state.json
fixtures/<app>/<case>/screenshot.png
fixtures/<app>/<case>/notes.md
```

When the hosted Computer Use transcript exposes screenshots only as rendered UI
image content, local `screencapture` screenshots may be stored as visual
evidence, but notes should say they are not native Computer Use image payloads.

Protocol-level probe artifacts should use this layout:

```text
protocol/tools-list.json
protocol/schemas/*.json
protocol/request-response-samples.jsonl
protocol/error-catalog.md
```
