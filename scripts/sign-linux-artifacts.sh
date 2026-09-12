#!/usr/bin/env bash
set -euo pipefail

release_dir=${1:-dist/release}
public_key=${2:-build/linux/kokorobox-linux-signing-key.asc}
: "${LINUX_GPG_PRIVATE_KEY:?LINUX_GPG_PRIVATE_KEY is required}"
: "${LINUX_GPG_PASSPHRASE:?LINUX_GPG_PASSPHRASE is required}"
if [[ ! -d $release_dir || ! -f $public_key ]]; then
  echo 'Linux signing input is missing' >&2
  exit 1
fi

work_dir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/kokorobox-linux-signing.XXXXXX")
export GNUPGHOME="$work_dir/gnupg"
private_key_file="$work_dir/private-key.asc"
passphrase_file="$work_dir/passphrase"

cleanup() {
  gpgconf --homedir "$GNUPGHOME" --kill all >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

install -d -m 700 "$GNUPGHOME"
printf 'default-cache-ttl 7200\nmax-cache-ttl 7200\nallow-loopback-pinentry\n' > "$GNUPGHOME/gpg-agent.conf"
printf '%s\n' "$LINUX_GPG_PRIVATE_KEY" > "$private_key_file"
printf '%s' "$LINUX_GPG_PASSPHRASE" > "$passphrase_file"
chmod 600 "$private_key_file" "$passphrase_file"
unset LINUX_GPG_PRIVATE_KEY LINUX_GPG_PASSPHRASE

fingerprint=$(gpg --batch --show-keys --with-colons "$public_key" | awk -F: '$1 == "fpr" { print toupper($10); exit }')
if [[ ! $fingerprint =~ ^[0-9A-F]{40}$ ]]; then
  echo 'The committed Linux signing key has no complete primary fingerprint' >&2
  exit 1
fi

gpg --batch --import "$private_key_file"
gpg --batch --list-secret-keys "$fingerprint" >/dev/null

shopt -s nullglob
rpm_packages=("$release_dir"/*.rpm)
deb_packages=("$release_dir"/*.deb)
arch_packages=("$release_dir"/*.pkg.tar.zst)
if (( ${#rpm_packages[@]} == 0 || ${#deb_packages[@]} == 0 || ${#arch_packages[@]} == 0 )); then
  echo 'Expected RPM, DEB, and Arch Linux release packages' >&2
  exit 1
fi

sign_file() {
  local input=$1
  local output=$2
  shift 2
  if [[ -e $output ]]; then
    echo "Refusing to replace existing signature: $output" >&2
    exit 1
  fi
  gpg \
    --batch \
    --yes \
    --pinentry-mode loopback \
    --passphrase-file "$passphrase_file" \
    --local-user "$fingerprint" \
    "$@" \
    --detach-sign \
    --output "$output" \
    "$input"
}

# Prime gpg-agent so rpmsign can use the passphrase-protected signing subkey
# without an interactive pinentry prompt.
printf 'KokoroBox Linux signing session\n' > "$work_dir/session"
sign_file "$work_dir/session" "$work_dir/session.sig"

for package in "${rpm_packages[@]}"; do
  rpmsign \
    --define "_gpg_name $fingerprint" \
    --define "_openpgp_sign_id $fingerprint" \
    --addsign "$package"
done
for package in "${deb_packages[@]}"; do
  sign_file "$package" "${package}.asc" --armor
done
for package in "${arch_packages[@]}"; do
  sign_file "$package" "${package}.sig"
done

install -m 0644 "$public_key" "$release_dir/kokorobox-linux-signing-key.asc"

mapfile -t checksum_files < <(
  find "$release_dir" -maxdepth 1 -type f \
    \( -name 'kokorobox-desktop-*' -o -name 'appcast-macos-*.xml' \) \
    -printf '%f\n' | LC_ALL=C sort
)
if (( ${#checksum_files[@]} == 0 )); then
  echo 'No release files found for SHA256SUMS' >&2
  exit 1
fi
(
  cd "$release_dir"
  sha256sum "${checksum_files[@]}" > SHA256SUMS
)
sign_file "$release_dir/SHA256SUMS" "$release_dir/SHA256SUMS.asc" --armor

rpm_db="$work_dir/rpmdb"
mkdir -p "$rpm_db"
rpm --dbpath "$rpm_db" --initdb
rpmkeys --dbpath "$rpm_db" --import "$release_dir/kokorobox-linux-signing-key.asc"
for package in "${rpm_packages[@]}"; do
  rpmkeys --dbpath "$rpm_db" --checksig --verbose "$package"
done
for package in "${deb_packages[@]}"; do
  gpg --batch --verify "${package}.asc" "$package"
done
for package in "${arch_packages[@]}"; do
  gpg --batch --verify "${package}.sig" "$package"
done
gpg --batch --verify "$release_dir/SHA256SUMS.asc" "$release_dir/SHA256SUMS"
