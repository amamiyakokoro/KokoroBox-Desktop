#!/usr/bin/env bash
# Run as root inside a disposable, native-architecture Fedora container.
set -euo pipefail

package=${1:?Usage: check-fedora-rpm.sh /path/to/package.rpm}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test "$(rpm -qp --qf '%{ARCH}' "$package")" = "$(uname -m)"
test "$(rpm -qp --qf '%{NAME}' "$package")" = kokorobox-desktop
rpm -qpR "$package"

# Resolve only the package's own dependencies first, so test tools cannot hide
# missing runtime libraries. Execute the real install scripts as part of DNF.
dnf install -y "$package"
test "$(readlink -f /usr/bin/sparkle)" = /opt/sparkle/sparkle
test -x /opt/sparkle/sparkle
test -u /opt/sparkle/chrome-sandbox
grep -qx 'Name=KokoroBox' /usr/share/applications/sparkle.desktop
grep -q 'x-scheme-handler/kokoro' /usr/share/applications/sparkle.desktop

while IFS= read -r -d '' binary; do
  # ELF magic; no additional packages are needed for this check.
  [[ $(head -c 4 "$binary") == $'\x7fELF' ]] || continue
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
done < <(find /opt/sparkle -type f -print0)

/opt/sparkle/resources/sidecar/mihomo -v
/opt/sparkle/resources/sidecar/mihomo-alpha -v

dnf install -y nodejs xorg-x11-server-Xvfb xorg-x11-xauth dbus-daemon shadow-utils
useradd --create-home smoke
runuser -u smoke -- dbus-run-session -- xvfb-run -a \
  node "$script_dir/check-fedora-renderer.mjs"

dnf remove -y kokorobox-desktop
test ! -e /opt/sparkle/sparkle
test ! -e /usr/share/applications/sparkle.desktop
test ! -e /usr/bin/sparkle
test ! -L /usr/bin/sparkle
echo 'Fedora RPM install, linkage, renderer/IPC, bundled cores, and removal checks passed.'
