# TextEdit Plain Text Fixture

Date: 2026-06-12

Purpose: capture hosted `get_app_state` behavior for an editable macOS text
surface.

## Setup

TextEdit opened this fixture file:

```text
/Users/lczhang/Documents/computer-use/fixtures/TextEdit/plain-text/source.txt
```

## Hosted Computer Use Result

`mcp__computer_use.get_app_state({"app":"TextEdit"})` returned successfully.

Observed app/window metadata:

```text
App=/System/Applications/TextEdit.app/
bundleID com.apple.TextEdit
Window: "source.txt", App: 文本编辑.
URL: file:///Users/lczhang/Documents/computer-use/fixtures/TextEdit/plain-text/source.txt
```

Observed state-model details:

- The document body is exposed as `文本输入区`.
- The editable region is marked `(settable, string)`.
- The editable region has semantic ID `First Text View`.
- The text content appears inline as `Value`.
- The enclosing scroll area exposes secondary actions:
  `Scroll Left`, `Scroll Right`, `Scroll Up`, and `Scroll Down`.
- Vertical and horizontal scroll bars appear as disabled/settable float nodes.
- The focused UI element was the text input region.

Representative tree excerpt:

```text
0 标准窗口 source.txt, URL: file:///Users/lczhang/Documents/computer-use/fixtures/TextEdit/plain-text/source.txt, Secondary Actions: Raise
  1 滚动区 Secondary Actions: Scroll Left, Scroll Right, Scroll Up, Scroll Down
    2 文本输入区 (settable, string) ID: First Text View, Value: Computer Use TextEdit fixture
    3 滚动条 (disabled, settable, float) 0.1851851791143417
    4 滚动条 (disabled, settable, float) 0
```

## Screenshot

`screenshot.png` was captured with local `screencapture`, not extracted from the
hosted Computer Use image payload. It is a full-display PNG used only as visual
evidence for the fixture window.
