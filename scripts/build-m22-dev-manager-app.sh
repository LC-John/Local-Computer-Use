#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/apps/LocalComputerUseDevManager"
app_name="Local Computer Use Dev Manager.app"
app_dir="$repo_root/.build/$app_name"
contents_dir="$app_dir/Contents"
macos_dir="$contents_dir/MacOS"
shared_support_dir="$contents_dir/SharedSupport"
client_app_dir="$shared_support_dir/LocalComputerUseClient.app"
client_contents_dir="$client_app_dir/Contents"
client_macos_dir="$client_contents_dir/MacOS"

rm -rf "$app_dir"
mkdir -p "$macos_dir" "$client_macos_dir"

cp "$source_dir/Info.plist" "$contents_dir/Info.plist"
cp "$source_dir/LocalComputerUseClient.Info.plist" "$client_contents_dir/Info.plist"

/usr/bin/swiftc \
  -O \
  -parse-as-library \
  -framework SwiftUI \
  -framework AppKit \
  -framework ApplicationServices \
  "$source_dir/LocalComputerUseDevManager.swift" \
  -o "$macos_dir/LocalComputerUseDevManager"

cat >"$macos_dir/LocalComputerUseService" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export LOCAL_CUA_REPO_ROOT="$repo_root"
cd "$repo_root"
exec node src/app-host.mjs "\$@"
EOF
chmod +x "$macos_dir/LocalComputerUseService"

cat >"$client_macos_dir/LocalComputerUseClient" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export LOCAL_CUA_REPO_ROOT="$repo_root"
cd "$repo_root"
subcommand="\${1:-}"
if [[ "\$subcommand" == "mcp" ]]; then
  shift
  exec node src/app-bridge.mjs "\$@"
fi
echo "Usage: LocalComputerUseClient mcp" >&2
exit 64
EOF
chmod +x "$client_macos_dir/LocalComputerUseClient"

/usr/bin/codesign --force --sign - "$client_app_dir" >/dev/null 2>&1 || true
/usr/bin/codesign --force --sign - "$app_dir" >/dev/null 2>&1 || true

echo "$app_dir"
