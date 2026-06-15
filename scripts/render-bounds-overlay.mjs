#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const reportPath = path.resolve(
  process.argv[2] || "reports/local-mcp-skeleton-probe.json",
);
const outputPath = path.resolve(
  process.argv[3] || "reports/latest-bounds-overlay.svg",
);

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function walkTree(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.children || []) {
    walkTree(child, visit);
  }
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function collectOverlayRects(state) {
  const screenshot = state.screenshot;
  const frame = screenshot.windowFrame;
  const scale = screenshot.displayScale;
  const contentOrigin = screenshot.imageContentOrigin || {};
  const frameX = toFiniteNumber(frame?.x);
  const frameY = toFiniteNumber(frame?.y);
  const scaleX = toFiniteNumber(scale?.x);
  const scaleY = toFiniteNumber(scale?.y);
  const originX = toFiniteNumber(contentOrigin.x) ?? 0;
  const originY = toFiniteNumber(contentOrigin.y) ?? 0;

  if (
    frameX === null ||
    frameY === null ||
    scaleX === null ||
    scaleY === null
  ) {
    throw new Error(
      "Screenshot metadata is missing windowFrame or displayScale",
    );
  }

  const rects = [];
  walkTree(state.tree, (node) => {
    const x = toFiniteNumber(node.position?.x);
    const y = toFiniteNumber(node.position?.y);
    const width = toFiniteNumber(node.size?.width);
    const height = toFiniteNumber(node.size?.height);
    if (x === null || y === null || width === null || height === null) return;
    if (width <= 0 || height <= 0) return;

    const mapped = {
      index: node.index,
      role: node.role || "",
      label:
        node.identifier || node.description || node.title || node.value || "",
      x: (x - frameX) * scaleX + originX,
      y: (y - frameY) * scaleY + originY,
      width: width * scaleX,
      height: height * scaleY,
    };

    if (
      mapped.x + mapped.width < 0 ||
      mapped.y + mapped.height < 0 ||
      mapped.x > screenshot.width ||
      mapped.y > screenshot.height
    ) {
      return;
    }

    rects.push(mapped);
  });

  return rects;
}

async function main() {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const rawState = report.appState?.result?.content?.[0]?.text;
  if (!rawState) {
    throw new Error(`No get_app_state payload found in ${reportPath}`);
  }

  const state = JSON.parse(rawState);
  if (state.screenshot?.status !== "captured") {
    throw new Error(
      `Screenshot was not captured: ${JSON.stringify(state.screenshot)}`,
    );
  }
  await stat(state.screenshot.path);

  const rects = collectOverlayRects(state);
  if (rects.length === 0) {
    throw new Error("No overlayable AX element bounds were found");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const title = `${state.app?.name || "App"} bounds overlay`;
  const imageHref = state.screenshot.path;
  const rectMarkup = rects
    .map((rect, offset) => {
      const stroke = offset === 0 ? "#ff3b30" : "#0a84ff";
      const label = `${rect.index}: ${rect.role} ${rect.label}`.trim();
      return [
        `<rect x="${rect.x.toFixed(2)}" y="${rect.y.toFixed(2)}" width="${rect.width.toFixed(2)}" height="${rect.height.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="2" opacity="0.85">`,
        `<title>${escapeXml(label)}</title>`,
        "</rect>",
      ].join("");
    })
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${state.screenshot.width}" height="${state.screenshot.height}" viewBox="0 0 ${state.screenshot.width} ${state.screenshot.height}">
  <title>${escapeXml(title)}</title>
  <image href="${escapeXml(imageHref)}" x="0" y="0" width="${state.screenshot.width}" height="${state.screenshot.height}" preserveAspectRatio="none"/>
  <g id="ax-bounds">
${rectMarkup}
  </g>
</svg>
`;

  await writeFile(outputPath, svg);
  const summary = {
    outputPath,
    screenshotPath: state.screenshot.path,
    screenshotWidth: state.screenshot.width,
    screenshotHeight: state.screenshot.height,
    rectCount: rects.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
