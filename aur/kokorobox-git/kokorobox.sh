#!/usr/bin/bash

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-~/.config}

if [[ -f "${XDG_CONFIG_HOME}/kokorobox-flags.conf" ]]; then
	mapfile -t KOKOROBOX_USER_FLAGS <<<"$(grep -v '^#' "${XDG_CONFIG_HOME}/kokorobox-flags.conf")"
elif [[ -f "${XDG_CONFIG_HOME}/sparkle-flags.conf" ]]; then
	mapfile -t KOKOROBOX_USER_FLAGS <<<"$(grep -v '^#' "${XDG_CONFIG_HOME}/sparkle-flags.conf")"
fi

exec /opt/kokorobox/kokorobox "${KOKOROBOX_USER_FLAGS[@]}" "$@"
