#!/usr/bin/env node

import { checkPermissions } from "./mac-adapter.mjs";

const accessibilityUrl =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const screenRecordingUrl =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

function usage() {
  return [
    "Usage: Local Computer Use permission <command>",
    "",
    "Commands:",
    "  status                 Print permission status and recovery guidance",
    "  open-accessibility     Open Accessibility privacy settings",
    "  open-screen-recording  Open Screen Recording privacy settings",
  ].join("\n");
}

async function status() {
  const result = await checkPermissions();
  const permissions = result.permissions || {};
  return {
    ok: result.ok === true,
    generatedAt: new Date().toISOString(),
    source: result.source || "local-macos-permission-check",
    permissions,
    recovery: {
      accessibility: {
        url: accessibilityUrl,
        requiredFor: ["get_app_state", "action tools"],
        granted: permissions.accessibility?.granted === true,
      },
      screenRecording: {
        url: screenRecordingUrl,
        requiredFor: ["screenshots", "screenshot-coordinate actions"],
        granted: permissions.screenRecording?.granted === true,
      },
    },
  };
}

async function openUrl(url) {
  if (process.env.LOCAL_CUA_PERMISSION_OPEN === "0") {
    return {
      ok: true,
      dryRun: true,
      url,
    };
  }
  const { execFile } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    execFile("open", [url], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return {
    ok: true,
    dryRun: false,
    url,
  };
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "status") {
    console.log(JSON.stringify(await status()));
    process.exit(0);
    return;
  }
  if (command === "open-accessibility") {
    console.log(JSON.stringify(await openUrl(accessibilityUrl)));
    process.exit(0);
    return;
  }
  if (command === "open-screen-recording") {
    console.log(JSON.stringify(await openUrl(screenRecordingUrl)));
    process.exit(0);
    return;
  }
  console.error(usage());
  process.exitCode = 64;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
