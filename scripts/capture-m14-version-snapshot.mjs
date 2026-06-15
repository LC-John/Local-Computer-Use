#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();
const nativePluginRoot =
  process.env.CUA_NATIVE_PLUGIN_ROOT ||
  path.join(
    process.env.HOME,
    ".codex/plugins/cache/openai-bundled/computer-use/1.0.809",
  );
const nativeRuntimeRoot =
  process.env.CUA_NATIVE_RUNTIME_ROOT ||
  path.join(process.env.HOME, ".codex/computer-use");
const snapshotRoot = path.join(repoRoot, "snapshots", "native");
const protocolDir = path.join(repoRoot, "protocol");

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function sha256(filePath) {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function copyIfExists(source, destination) {
  if (!(await exists(source))) return false;
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  return true;
}

async function commandResult(command, args) {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
      error: error.message,
    };
  }
}

async function plistAsJson(plistPath) {
  const result = await commandResult("/usr/bin/plutil", [
    "-convert",
    "json",
    "-o",
    "-",
    plistPath,
  ]);
  if (!result.ok || !result.stdout) return result;
  try {
    return {
      ok: true,
      value: JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: result.stdout,
      error: error.message,
    };
  }
}

async function fileMetadata(filePath) {
  const fileStat = await stat(filePath);
  const [fileInfo, codeSignature] = await Promise.all([
    commandResult("/usr/bin/file", [filePath]),
    commandResult("/usr/bin/codesign", ["-dv", "--verbose=2", filePath]),
  ]);
  return {
    path: filePath,
    size: fileStat.size,
    mtime: fileStat.mtime.toISOString(),
    sha256: await sha256(filePath),
    file: fileInfo.stdout,
    codesign: codeSignature.stderr || codeSignature.stdout,
  };
}

async function snapshotFileIndex(dir) {
  const entries = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const fileStat = await stat(fullPath);
      entries.push({
        path: path.relative(dir, fullPath),
        size: fileStat.size,
        sha256: await sha256(fullPath),
      });
    }
  }
  await walk(dir);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

async function versionFromNativePlugin() {
  const pluginJson = await readJson(
    path.join(nativePluginRoot, ".codex-plugin", "plugin.json"),
  );
  const infoPlist = await plistAsJson(
    path.join(
      nativeRuntimeRoot,
      "Codex Computer Use.app",
      "Contents",
      "Info.plist",
    ),
  );
  const runtimeVersion =
    infoPlist.value?.CFBundleVersion ||
    infoPlist.value?.CFBundleShortVersionString ||
    path.basename(nativePluginRoot);
  return {
    pluginName: pluginJson.name || "computer-use",
    pluginVersion: pluginJson.version || path.basename(nativePluginRoot),
    runtimeVersion: String(runtimeVersion),
    pluginJson,
    runtimeInfo: infoPlist.value || null,
  };
}

async function captureProtocolArtifacts(snapshotDir) {
  const artifacts = [
    "initialize-response.json",
    "tools-list.json",
    "tool-coverage.md",
    "error-catalog.md",
    "error-catalog.raw.json",
    "stderr.log",
  ];
  const copied = [];
  for (const artifact of artifacts) {
    const source = path.join(protocolDir, artifact);
    const destination = path.join(snapshotDir, "protocol", artifact);
    if (await copyIfExists(source, destination)) copied.push(artifact);
  }
  if (await exists(path.join(protocolDir, "schemas"))) {
    await copyIfExists(
      path.join(protocolDir, "schemas"),
      path.join(snapshotDir, "protocol", "schemas"),
    );
    copied.push("schemas/");
  }
  return copied;
}

async function captureStateSnapshotIndex(snapshotDir) {
  const stateFiles = [
    "fixtures/Calculator/basic/codex-hosted-state.md",
    "fixtures/Calculator/basic/local-m7-state.json",
    "fixtures/Calculator/basic/native-state-timeout.json",
    "fixtures/TextEdit/plain-text/local-m7-state.json",
    "fixtures/Chrome/static-page/local-m7-state.json",
    "fixtures/Finder/project-list/local-m7-state.json",
    "fixtures/__definitely_missing_app_for_probe__/invalid-app/native-state.raw.json",
  ];
  const entries = [];
  for (const relativePath of stateFiles) {
    const source = path.join(repoRoot, relativePath);
    if (!(await exists(source))) continue;
    const destination = path.join(snapshotDir, "state", relativePath);
    await copyIfExists(source, destination);
    entries.push({
      path: relativePath,
      sha256: await sha256(source),
      size: (await stat(source)).size,
    });
  }
  await writeJson(
    path.join(snapshotDir, "state", "state-snapshot-index.json"),
    {
      note: "Native get_app_state capture remains partially blocked; this index preserves current raw timeout/hosted/local fixture state evidence.",
      entries,
    },
  );
  return entries;
}

async function captureBinaryMetadata(snapshotDir) {
  const appRoot = path.join(nativeRuntimeRoot, "Codex Computer Use.app");
  const binaryPaths = [
    path.join(appRoot, "Contents", "MacOS", "SkyComputerUseService"),
    path.join(
      appRoot,
      "Contents",
      "SharedSupport",
      "SkyComputerUseClient.app",
      "Contents",
      "MacOS",
      "SkyComputerUseClient",
    ),
    path.join(
      appRoot,
      "Contents",
      "SharedSupport",
      "CUALockScreenGuardian.app",
      "Contents",
      "MacOS",
      "CUALockScreenGuardian",
    ),
    path.join(
      appRoot,
      "Contents",
      "SharedSupport",
      "Codex Computer Use Installer.app",
      "Contents",
      "MacOS",
      "Codex Computer Use Installer",
    ),
  ];

  const binaries = [];
  for (const binaryPath of binaryPaths) {
    if (await exists(binaryPath)) binaries.push(await fileMetadata(binaryPath));
  }

  const plists = {};
  for (const plistPath of [
    path.join(appRoot, "Contents", "Info.plist"),
    path.join(
      appRoot,
      "Contents",
      "SharedSupport",
      "SkyComputerUseClient.app",
      "Contents",
      "Info.plist",
    ),
    path.join(
      appRoot,
      "Contents",
      "SharedSupport",
      "CUALockScreenGuardian.app",
      "Contents",
      "Info.plist",
    ),
  ]) {
    if (await exists(plistPath)) {
      plists[plistPath] = await plistAsJson(plistPath);
    }
  }

  const metadata = {
    capturedAt: new Date().toISOString(),
    nativeRuntimeRoot,
    binaries,
    plists,
  };
  await writeJson(
    path.join(snapshotDir, "metadata", "binary-metadata.json"),
    metadata,
  );
  return metadata;
}

async function compareWithPrevious(currentVersion, snapshotDir) {
  const versions = (
    await readdir(snapshotRoot, { withFileTypes: true }).catch(() => [])
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== currentVersion)
    .sort((a, b) => a.localeCompare(b));
  const previousVersion = versions.at(-1) || null;
  const currentIndex = await snapshotFileIndex(snapshotDir);
  const currentByPath = new Map(
    currentIndex.map((entry) => [entry.path, entry]),
  );
  const changes = [];

  if (previousVersion) {
    const previousDir = path.join(snapshotRoot, previousVersion);
    const previousIndex = await snapshotFileIndex(previousDir);
    const previousByPath = new Map(
      previousIndex.map((entry) => [entry.path, entry]),
    );
    for (const [filePath, current] of currentByPath) {
      const previous = previousByPath.get(filePath);
      if (!previous) {
        changes.push({ path: filePath, change: "added" });
      } else if (previous.sha256 !== current.sha256) {
        changes.push({
          path: filePath,
          change: "modified",
          previousSha256: previous.sha256,
          currentSha256: current.sha256,
        });
      }
    }
    for (const filePath of previousByPath.keys()) {
      if (!currentByPath.has(filePath))
        changes.push({ path: filePath, change: "removed" });
    }
  }

  const diff = {
    currentVersion,
    previousVersion,
    status: previousVersion ? "compared" : "baseline",
    changeCount: changes.length,
    changes,
  };
  await writeJson(path.join(snapshotDir, "diff-from-previous.json"), diff);

  const markdown = [
    "# Native Version Diff",
    "",
    `Current version: ${currentVersion}`,
    `Previous version: ${previousVersion || "none"}`,
    `Status: ${diff.status}`,
    "",
    changes.length
      ? "| Path | Change |\n| --- | --- |\n" +
        changes
          .map((change) => `| \`${change.path}\` | ${change.change} |`)
          .join("\n")
      : "No previous snapshot is available, or no tracked file changed.",
    "",
  ].join("\n");
  await writeFile(path.join(snapshotDir, "diff-from-previous.md"), markdown);
  return diff;
}

async function updateMaintenanceDocs(snapshot) {
  const changelogPath = path.join(
    repoRoot,
    "docs",
    "native-version-changelog.md",
  );
  const matrixPath = path.join(repoRoot, "docs", "compatibility-matrix.md");
  const snapshotEntries = [];
  const versionDirs = (
    await readdir(snapshotRoot, { withFileTypes: true }).catch(() => [])
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const version of versionDirs) {
    const summaryPath = path.join(
      snapshotRoot,
      version,
      "snapshot-summary.json",
    );
    if (await exists(summaryPath)) {
      snapshotEntries.push(await readJson(summaryPath));
    }
  }

  if (
    !snapshotEntries.some(
      (entry) => entry.snapshotPath === snapshot.snapshotPath,
    )
  ) {
    snapshotEntries.push(snapshot);
  }

  snapshotEntries.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  const changelog = [
    "# Native Computer Use Version Changelog",
    "",
    "This file is maintained by `npm run snapshot:m14:native`.",
    "",
    "| Captured | Native plugin | Runtime bundle | Snapshot | Diff status | Changes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...snapshotEntries.map(
      (entry) =>
        `| ${entry.capturedAt} | ${entry.native.pluginVersion} | ${entry.native.runtimeVersion} | \`${entry.snapshotPath}\` | ${entry.diff.status} | ${entry.diff.changeCount} |`,
    ),
    "",
    "Current notes:",
    "",
    "- The first M14 snapshot is a baseline for future Codex or Computer Use updates.",
    "- Raw native state capture is still tracked as a deferred gap; existing timeout and hosted/local fixture evidence is copied into each snapshot.",
    "",
  ].join("\n");

  const matrix = [
    "# Compatibility Matrix",
    "",
    "This matrix records the local replacement's current compatibility target.",
    "",
    "| Local replacement | Native target | Snapshot | Tool catalog | Fixture gate | Error gate | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...snapshotEntries.map(
      (entry) =>
        `| 0.1.0 | computer-use ${entry.native.pluginVersion} / runtime ${entry.native.runtimeVersion} | \`${entry.snapshotPath}\` | ${entry.toolCount} tools | M11 passed | M13 passed | Raw native state remains deferred; local M7-M13 behavior is covered by fixture reports. |`,
    ),
    "",
  ].join("\n");

  await writeFile(changelogPath, changelog);
  await writeFile(matrixPath, matrix);
}

async function main() {
  const native = await versionFromNativePlugin();
  const snapshotVersion = native.pluginVersion;
  const snapshotDir = path.join(snapshotRoot, snapshotVersion);

  await mkdir(snapshotDir, { recursive: true });
  await copyIfExists(
    path.join(nativePluginRoot, ".codex-plugin", "plugin.json"),
    path.join(snapshotDir, "manifest", "plugin.json"),
  );
  await copyIfExists(
    path.join(nativePluginRoot, ".mcp.json"),
    path.join(snapshotDir, "manifest", "mcp.json"),
  );
  await copyIfExists(
    path.join(nativeRuntimeRoot, "config.json"),
    path.join(snapshotDir, "manifest", "runtime-config.json"),
  );

  const protocolArtifacts = await captureProtocolArtifacts(snapshotDir);
  const stateSnapshots = await captureStateSnapshotIndex(snapshotDir);
  const binaryMetadata = await captureBinaryMetadata(snapshotDir);
  const diff = await compareWithPrevious(snapshotVersion, snapshotDir);
  const toolCatalog = await readJson(path.join(protocolDir, "tools-list.json"));
  const toolCount = toolCatalog.result?.tools?.length || 0;

  const summary = {
    capturedAt: new Date().toISOString(),
    snapshotPath: rel(snapshotDir),
    native: {
      pluginRoot: nativePluginRoot,
      runtimeRoot: nativeRuntimeRoot,
      pluginName: native.pluginName,
      pluginVersion: native.pluginVersion,
      runtimeVersion: native.runtimeVersion,
    },
    protocolArtifacts,
    toolCount,
    stateSnapshotCount: stateSnapshots.length,
    binaryCount: binaryMetadata.binaries.length,
    diff,
    deferred: [
      "Raw native get_app_state payload capture remains partially blocked in this environment.",
      "Modal, display sleep, and target-window-changed fixtures remain future compatibility checks.",
    ],
  };

  await writeJson(path.join(snapshotDir, "snapshot-summary.json"), summary);
  await updateMaintenanceDocs(summary);
  console.log(
    `Captured native Computer Use ${native.pluginVersion} snapshot into ${rel(snapshotDir)}`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
