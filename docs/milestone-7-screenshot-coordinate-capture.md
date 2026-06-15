# Milestone 7 Screenshot and Coordinate Capture

Date: 2026-06-15

Status: Initial implementation complete; initial overlay tooling complete;
click-coordinate validation remains open.

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
      "y": 2
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

Calculator fixture artifacts:

```text
fixtures/Calculator/basic/local-m7-state.json
fixtures/Calculator/basic/local-m7-screenshot.png
fixtures/Calculator/basic/local-m7-bounds-overlay.svg
```

## Current Limits

- Screenshot files are returned by path, not inline base64 or MCP image content.
- The implementation captures only on-screen windows.
- Minimized windows, occluded windows, or windows without a CoreGraphics match
  may return `screenshot.status = "unavailable"`.
- Screen Recording permission is required by macOS for successful capture.
- Element bounds and screenshot pixels are mapped into an SVG overlay, but
  manual visual review and broader app fixtures are still needed.
- Click-by-coordinate behavior is still Milestone 8 work.
- Multi-display and mixed-scale behavior still needs dedicated fixtures.

## Next Work

- Add fixture snapshots for TextEdit, Chrome, and Finder using the local
  screenshot path and overlay tool.
- Validate the display-scale calculation on multi-display setups.
- Use the screenshot metadata when implementing click-by-coordinate in
  Milestone 8.
