#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/apps/LocalComputerUseDevManager"
app_name="Local Computer Use Dev Manager.app"
app_dir="$repo_root/.build/$app_name"
contents_dir="$app_dir/Contents"
macos_dir="$contents_dir/MacOS"

rm -rf "$app_dir"
mkdir -p "$macos_dir"

cp "$source_dir/Info.plist" "$contents_dir/Info.plist"

/usr/bin/swiftc \
  -O \
  -parse-as-library \
  -framework SwiftUI \
  -framework AppKit \
  -framework ApplicationServices \
  "$source_dir/LocalComputerUseDevManager.swift" \
  -o "$macos_dir/LocalComputerUseDevManager"

/usr/bin/codesign --force --sign - "$app_dir" >/dev/null 2>&1 || true

echo "$app_dir"
