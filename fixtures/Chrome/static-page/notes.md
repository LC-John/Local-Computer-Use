# Chrome Static Page Fixture

Date: 2026-06-12

Purpose: capture hosted `get_app_state` behavior for a browser window showing a
deterministic local page.

## Setup

Chrome opened this local URL:

```text
file:///Users/lczhang/Documents/computer-use/fixtures/Chrome/static-page/index.html
```

The page intentionally includes a heading, paragraph text, a labeled text input,
a button, and scroll markers.

## Hosted Computer Use Result

`mcp__computer_use.get_app_state({"app":"Google Chrome"})` returned
successfully.

Observed app/window metadata:

```text
App=/Applications/Google Chrome.app/
bundleID com.google.Chrome
Window: "Computer Use Fixture Page", App: Google Chrome.
URL: file:///Users/lczhang/Documents/computer-use/fixtures/Chrome/static-page/index.html
```

Observed state-model details:

- Chrome responses include an `app_specific_instructions` block before
  `app_state`.
- The address bar appears as a `文本栏 (settable, string)` with description
  `地址和搜索栏`.
- The web document appears as `HTML 内容 Computer Use Fixture Page`.
- DOM-visible content is represented as AX text, heading, input, and button
  nodes.
- The fixture input appears as `文本栏 (settable, string) Fixture input,
  Value: ready`.
- The selected browser tab is represented as a settable boolean tab node.
- Existing Chrome profile tabs are included in the hosted state payload; notes
  intentionally omit that full tab list because it is unrelated to the fixture.

Representative page excerpt:

```text
16 HTML 内容 Computer Use Fixture Page, URL: file:///Users/lczhang/Documents/computer-use/fixtures/Chrome/static-page/index.html
  18 标题 Computer Use Static Fixture, Value: 1
  21 文本栏 (settable, string) Fixture input, Value: ready
  22 按钮 Fixture button
  23 标题 Scrollable Content Anchor, Value: 2
  28 文本 Scroll marker 01
  48 文本 Bottom anchor for scroll-state discovery.
```

## Scroll Observation

After `mcp__computer_use.scroll({"app":"Google Chrome","element_index":"16",
"direction":"down","pages":1})`, the screenshot visibly moved to the lower page
content. The AX tree still included all page text nodes from top to bottom, so
for this browser fixture the hosted text tree is document-oriented while the
image payload is viewport-oriented.

## Screenshot

`screenshot.png` and `screenshot-after-scroll.png` were captured with local
`screencapture`, not extracted from the hosted Computer Use image payload. They
are full-display PNGs used only as visual evidence for the top and scrolled
fixture window states.
