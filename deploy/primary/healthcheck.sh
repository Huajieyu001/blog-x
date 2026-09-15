#!/usr/bin/env bash
set -euo pipefail

readonly CONFIG=/etc/blog-x/primary.env
port="${1:-3100}"
[[ $port =~ ^[1-9][0-9]{0,4}$ ]] || { printf '%s\n' 'invalid Web health port' >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONFIG"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3001/health >/dev/null
curl --fail --silent --show-error --max-time 8 --resolve "huajieyu001.top:${port}:127.0.0.1" "http://huajieyu001.top:${port}/" >/dev/null
printf 'PRIMARY HEALTH CHECK PASSED on loopback Web port %s\n' "$port"
