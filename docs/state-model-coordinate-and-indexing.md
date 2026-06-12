# State Model Coordinate and Element Indexing Notes

Date: 2026-06-12

Status: Partial Milestone 4 reference.

## Evidence Sources

- Hosted Computer Use state responses in this Codex thread.
- Fixture notes under `fixtures/`.
- Local full-display screenshots captured with `screencapture`.

The hosted Computer Use transcript renders screenshot image content in the UI,
but the current tool result available to the agent does not expose a reusable
image file path, base64 payload, or screenshot metadata. Local screenshots in
the fixture directories are visual evidence only; they are not proof of native
Computer Use screenshot encoding.

## Element Indexing Observations

- Element indexes are decimal numeric identifiers rendered as the first token on
  each state line.
- Indexes are assigned to both container nodes and leaf nodes.
- Text nodes receive indexes, not only interactive controls.
- Disabled controls remain indexed.
- The observed ordering is consistent with a depth-first traversal of the
  rendered accessibility tree for Calculator, TextEdit, Chrome, and Finder.
- The same semantic Calculator buttons kept stable-looking IDs (`One`, `Add`,
  `Equals`) across captures, but the numeric indexes are currently treated as
  per-state handles until repeated same-layout captures prove cross-call
  stability.
- Browser profile tab nodes can make Chrome numeric indexes noisy because the
  tab strip contains many unrelated existing tabs.

## Coordinate Observations

- Hosted screenshots are viewport-oriented: after scrolling Chrome, the image
  content changed to show the lower page region.
- Chrome's AX text tree remained document-oriented after scrolling and still
  listed top-to-bottom page text nodes.
- The hosted state text available in this thread did not include explicit
  element bounds, screenshot dimensions, display scale, screen coordinates, or
  window-relative coordinates.
- Local fixture screenshots are 3840 x 2560 full-display PNGs from
  `screencapture`, so they cannot currently be used as native Computer Use
  screenshot-coordinate references.

## Current Gaps

- Native Computer Use screenshot encoding is still unknown.
- Element bounds are still unavailable from the hosted transcript.
- The mapping among screenshot pixels, screen coordinates, window coordinates,
  and element bounds is not yet documented.
- Stale numeric element-index behavior still needs a controlled repeated-capture
  test.
