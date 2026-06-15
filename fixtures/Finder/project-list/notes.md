# Finder Project List Fixture

Date: 2026-06-12

Purpose: capture hosted `get_app_state` behavior for a Finder list-view window.

## Setup

Finder opened the project directory:

```text
/Users/lczhang/Documents/computer-use
```

## Hosted Computer Use Result

`mcp__computer_use.get_app_state({"app":"Finder"})` returned successfully.

Observed app/window metadata:

```text
App=/System/Library/CoreServices/Finder.app/
bundleID com.apple.finder
Window: "computer-use", App: 访达.
```

Observed state-model details:

- The Finder window root has ID `FinderWindow`.
- The sidebar is exposed as an outline with selectable rows and expandable
  groups.
- The file list is exposed as `外框 Description: 列表视图, ID: ListView`.
- File and directory names appear as settable text fields with `file://` URLs.
- Folder rows expose `collapsed` state and an `Expand` secondary action.
- Toolbar controls and column sort buttons are represented as ordinary button
  nodes.
- The focused UI element was the list view outline.

Representative list excerpt:

```text
38 外框 Description: 列表视图, ID: ListView
  43 文本栏 (settable, string) URL: file:///Users/lczhang/Documents/computer-use/DECISIONS.md, Value: DECISIONS.md
  53 文本栏 (settable, string) URL: file:///Users/lczhang/Documents/computer-use/docs/, Value: docs
  64 文本栏 (settable, string) URL: file:///Users/lczhang/Documents/computer-use/fixtures/, Value: fixtures
  107 文本栏 (settable, string) URL: file:///Users/lczhang/Documents/computer-use/STATE_MODEL.md, Value: STATE_MODEL.md
```

## Screenshot

`screenshot.png` was captured with local `screencapture`, not extracted from the
hosted Computer Use image payload. It is a full-display PNG used only as visual
evidence for the fixture window.

## Local M7 Reimplementation Capture

`LOCAL_CUA_PROBE_APP=Finder npm run probe:local` passed on 2026-06-15 and was
saved with:

```bash
node scripts/save-m7-fixture.mjs reports/local-mcp-skeleton-probe.json fixtures/Finder/project-list
```

Artifacts:

```text
local-m7-state.json
local-m7-screenshot.png
local-m7-bounds-overlay.svg
```

The local resolver accepted the English app request and resolved the localized
app name `访达`. Manual visual review confirmed that
`local-m7-screenshot.png` is nonblank and shows a Finder list-view window.
