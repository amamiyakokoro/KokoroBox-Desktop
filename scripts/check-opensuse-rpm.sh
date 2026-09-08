#!/usr/bin/env bash
# Run as root inside a disposable, native-architecture openSUSE container.
set -euo pipefail

package=${1:?Usage: check-opensuse-rpm.sh /path/to/package.rpm}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test "$(rpm -qp --qf '%{ARCH}' "$package")" = "$(uname -m)"
test "$(rpm -qp --qf '%{NAME}' "$package")" = kokorobox-desktop
rpm -qpR "$package"

# Install only declared runtime requirements first so test tools cannot hide a
# missing dependency. This also executes the real package install scripts.
zypper --non-interactive --gpg-auto-import-keys refresh
zypper --non-interactive install --no-recommends --allow-unsigned-rpm "$package"
test "$(readlink -f /usr/bin/kokorobox)" = /opt/kokorobox/kokorobox
test -x /opt/kokorobox/kokorobox
test -u /opt/kokorobox/chrome-sandbox
grep -qx 'Name=KokoroBox' /usr/share/applications/kokorobox.desktop
grep -q 'x-scheme-handler/kokoro' /usr/share/applications/kokorobox.desktop

while IFS= read -r -d '' binary; do
  head -c 4 "$binary" | grep -q $'^\x7fELF' || continue
  linkage=$(ldd "$binary" 2>&1) || {
    if [[ $linkage == *'not a dynamic executable'* || $linkage == *'statically linked'* ]]; then
      continue
    fi
    printf '%s\n%s\n' "$binary" "$linkage" >&2
    exit 1
  }
  if [[ $linkage == *'not found'* ]]; then
    printf '%s\n%s\n' "$binary" "$linkage" >&2
    exit 1
  fi
done < <(find /opt/kokorobox -type f -print0)

/opt/kokorobox/resources/sidecar/mihomo -v
/opt/kokorobox/resources/sidecar/mihomo-alpha -v

zypper --non-interactive install --no-recommends \
  nodejs xorg-x11-server-Xvfb xauth dbus-1-daemon shadow dejavu-fonts
useradd --create-home smoke
Xvfb :99 -screen 0 1280x720x24 &
xvfb_pid=$!
trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
sleep 1
su --shell /bin/bash smoke --command \
  "DISPLAY=:99 dbus-run-session -- node '$script_dir/check-rpm-renderer.mjs'"

zypper --non-interactive remove kokorobox-desktop
test ! -e /opt/kokorobox/kokorobox
test ! -e /usr/share/applications/kokorobox.desktop
test ! -e /usr/bin/kokorobox
test ! -L /usr/bin/kokorobox
echo 'openSUSE RPM install, linkage, renderer/IPC, bundled cores, and removal checks passed.'
