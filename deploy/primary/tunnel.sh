#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly CONFIG=/etc/blog-x/primary.env
[[ -f $CONFIG ]] || { printf '%s\n' 'primary environment is missing' >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONFIG"
[[ ${TUNNEL_PORT:-} == 3001 ]] || { printf '%s\n' 'tunnel must bind local port 3001' >&2; exit 1; }
[[ $(stat -c '%a' "$SSH_KEY_PATH") == 600 && $(stat -c '%a' "$KNOWN_HOSTS_PATH") == 600 ]] || { printf '%s\n' 'SSH key and known_hosts must be mode 0600' >&2; exit 1; }
exec /usr/bin/ssh -NT \
  -i "$SSH_KEY_PATH" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS_PATH" \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -p "$SECONDARY_SSH_PORT" \
  -L "127.0.0.1:3001:127.0.0.1:3001" \
  "$SECONDARY_SSH_USER@$SECONDARY_SSH_HOST"
