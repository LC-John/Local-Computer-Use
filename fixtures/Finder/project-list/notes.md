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
