#!/usr/bin/env bash

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-~/.config}
KOKOROBOX_FLAGS_FILE="${XDG_CONFIG_HOME}/kokorobox-flags.conf"
LEGACY_FLAGS_FILE="${XDG_CONFIG_HOME}/sparkle-flags.conf"

# Preserve user launch flags across an upgrade, but never create or advertise
# a new Sparkle-named configuration file.
if [[ -f "$KOKOROBOX_FLAGS_FILE" ]]; then
    mapfile -t KOKOROBOX_USER_FLAGS <<<"$(grep -v '^#' "$KOKOROBOX_FLAGS_FILE")"
elif [[ -f "$LEGACY_FLAGS_FILE" ]]; then
    mapfile -t KOKOROBOX_USER_FLAGS <<<"$(grep -v '^#' "$LEGACY_FLAGS_FILE")"
fi

if [[ ${#KOKOROBOX_USER_FLAGS[@]} -gt 0 ]]; then
    echo "User flags:" "${KOKOROBOX_USER_FLAGS[@]}"
fi

exec /opt/kokorobox/kokorobox "${KOKOROBOX_USER_FLAGS[@]}" "$@"
