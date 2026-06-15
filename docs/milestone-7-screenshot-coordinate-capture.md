# Milestone 7 Screenshot and Coordinate Capture

Date: 2026-06-15

Status: Complete for the current single-display environment. Local fixture
coverage exists for Calculator, TextEdit, Chrome, and Finder, including the
deterministic Chrome static page. Click-coordinate validation remains Milestone
8 work. Multi-display validation requires hardware that is not present in the
current environment.

Milestone 7 adds visual window state to the local Computer Use
reimplementation. `get_app_state` now returns a captured target-window PNG plus
coordinate metadata next to the Accessibility tree.

## Implemented Path

Screenshot capture is implemented in `src/ax-state.swift` and returned through
the existing local MCP `get_app_state` path.

The helper:

- resolves the target app and focused window through the Milestone 6 AX reader;
- finds the corresponding on-screen CoreGraphics window by owner PID and window
  title where possible;
- captures the window with `/usr/sbin/screencapture -x -l <windowID>`;
- writes PNG files under `.build/screenshots/`;
- reads PNG dimensions with ImageIO;
- reports display scale from the matched `NSScreen.backingScaleFactor`;
- reports a separate `captureScaleEstimate` because `screencapture -l` can
  include window shadows or padding;
- reports `imageContentOrigin` so AX bounds can be mapped into the screenshot
  image when that padding exists;
- returns screenshot metadata in the `get_app_state` JSON payload.

The local implementation uses `screencapture` rather than
`CGWindowListCreateImage` because the current macOS SDK marks
`CGWindowListCreateImage` unavailable on macOS 15.

## Bounds Overlay Tool

`scripts/render-bounds-overlay.mjs` reads a local probe report, maps AX
`position` and `size` values from global screen points into screenshot pixels,
and writes an SVG overlay containing the screenshot plus AX element rectangles.

Default command:

```bash
npm run overlay:latest
```

Explicit command:

```bash
node scripts/render-bounds-overlay.mjs \
  reports/local-mcp-skeleton-probe.json \
  reports/latest-bounds-overlay.svg
```

The overlay is a debugging artifact. It verifies that screenshot metadata,
window-frame coordinates, display-scale estimates, and AX element bounds are
coherent enough to map into one visual plane.

## Returned Screenshot Shape

`get_app_state` now includes:

```json
{
  "screenshot": {
    "status": "captured",
    "path": "/absolute/path/to/.build/screenshots/App-windowID-time.png",
    "encoding": "png_file",
    "windowID": 123,
    "width": 1000,
    "height": 800,
    "windowFrame": {
      "x": 0,
      "y": 0,
      "width": 500,
      "height": 400
    },
    "displayScale": {
      "x": 2,
      "y": 2,
      "source": "ns_screen_backing_scale_factor"
    },
    "imageContentOrigin": {
      "x": 68,
      "y": 68,
      "source": "centered_window_frame_within_screencapture_image"
    },
    "captureScaleEstimate": {
      "x": 2.13,
      "y": 2.19,
      "source": "screenshot_pixels_divided_by_window_frame"
    },
    "coordinateSystem": {
      "windowFrame": "global_screen_points",
      "screenshot": "image_pixels",
      "origin": "top_left"
    }
  }
}
```

If capture fails, `screenshot.status` is `unavailable` and the field contains a
structured `error` object. The AX state still returns when screenshot capture
fails.

## Verification

Run:

```bash
npm run probe:local
LOCAL_CUA_PROBE_APP=Calculator npm run probe:local
```

The probe now verifies:

- MCP initialization succeeds;
- all 10 native tool names are still exposed;
- `list_apps` returns through the local helper;
- `get_app_state` returns app metadata and an AX tree;
- `get_app_state.screenshot.status` is `captured`;
- the screenshot path exists;
- the screenshot has positive dimensions;
- the screenshot file has a PNG header.
- a bounds overlay SVG can be generated;
- the overlay contains AX rectangle elements.

Expected output:

```text
Local MCP AX screenshot overlay probe passed.
```

Fixture artifacts:

```text
fixtures/Calculator/basic/local-m7-state.json
fixtures/Calculator/basic/local-m7-screenshot.png
fixtures/Calculator/basic/local-m7-bounds-overlay.svg
fixtures/TextEdit/plain-text/local-m7-state.json
fixtures/TextEdit/plain-text/local-m7-screenshot.png
fixtures/TextEdit/plain-text/local-m7-bounds-overlay.svg
fixtures/Chrome/static-page/local-m7-state.json
fixtures/Chrome/static-page/local-m7-screenshot.png
fixtures/Chrome/static-page/local-m7-bounds-overlay.svg
fixtures/Finder/project-list/local-m7-state.json
fixtures/Finder/project-list/local-m7-screenshot.png
fixtures/Finder/project-list/local-m7-bounds-overlay.svg
```

`scripts/save-m7-fixture.mjs` saves the latest local probe report into a fixture
directory by writing `local-m7-state.json`, copying the captured screenshot to
`local-m7-screenshot.png`, and generating `local-m7-bounds-overlay.svg`.

Local fixture capture results from 2026-06-15:

| Fixture             | App requested   | Resolved app    | Screenshot      | Overlay   |
| ------------------- | --------------- | --------------- | --------------- | --------- |
| Calculator basic    | `Calculator`    | `计算器`        | 532 x 836 PNG   | generated |
| TextEdit plain text | `TextEdit`      | `文本编辑`      | 1458 x 1002 PNG | generated |
| Chrome window       | `Google Chrome` | `Google Chrome` | 3662 x 2520 PNG | generated |
| Finder project list | `Finder`        | `访达`          | 1976 x 1008 PNG | generated |

Manual visual review confirmed that these screenshots are nonblank and match the
target application windows. The Chrome local M7 capture was refreshed against
`fixtures/Chrome/static-page/index.html`, so local and hosted Chrome fixture
notes now refer to the same deterministic page.

Single-display Retina validation:

- `system_profiler SPDisplaysDataType -json` reported one online display,
  `BenQ RD280UA`, with logical resolution `1920 x 1280 @ 60.00Hz` and pixel
  resolution `3840 x 2560`.
- The local state payloads for Calculator, TextEdit, Chrome, and Finder report
  `displayScale.x = 2` and `displayScale.y = 2` from
  `ns_screen_backing_scale_factor`.
- `captureScaleEstimate` remains intentionally separate because the PNG size
  from `screencapture -l` includes capture padding or shadow pixels.

## Current Limits

- Screenshot files are returned by path, not inline base64 or MCP image content.
- The implementation captures only on-screen windows.
- Minimized windows, occluded windows, or windows without a CoreGraphics match
  may return `screenshot.status = "unavailable"`.
- Screen Recording permission is required by macOS for successful capture.
- Element bounds and screenshot pixels are mapped into SVG overlays for the
  initial Calculator, TextEdit, Chrome, and Finder fixtures.
- Click-by-coordinate behavior is still Milestone 8 work.
- Multi-display and mixed-scale behavior still needs dedicated fixtures on a
  machine with more than one online display.

## Next Work

- Validate display matching on multi-display or mixed-scale hardware when such
  hardware is available.
- Use the screenshot metadata when implementing click-by-coordinate in
  Milestone 8.
