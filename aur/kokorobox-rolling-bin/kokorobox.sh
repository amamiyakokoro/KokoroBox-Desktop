#!/usr/bin/bash

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-~/.config}
KOKOROBOX_FLAGS_FILE="${XDG_CONFIG_HOME}/kokorobox-flags.conf"
LEGACY_FLAGS_FILE="${XDG_CONFIG_HOME}/sparkle-flags.conf"

if [[ -f "$KOKOROBOX_FLAGS_FILE" ]]; then
    mapfile -t KOKOROBOX_USER_FLAGS <<<"$(grep -v '^#' "$KOKOROBOX_FLAGS_FILE")"
elif [[ -f "$LEGACY_FLAGS_FILE" ]]; then
    mapfile -t KOKOROBOX_USER_FLAGS <<<"$(grep -v '^#' "$LEGACY_FLAGS_FILE")"
fi

exec /opt/kokorobox/kokorobox "${KOKOROBOX_USER_FLAGS[@]}" "$@"
