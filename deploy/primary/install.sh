#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly ROOT=/opt/blog-x
readonly CONFIG_DIR=/etc/blog-x
[[ ${EUID:-$(id -u)} -eq 0 ]] || { printf '%s\n' 'install must run as root' >&2; exit 1; }
"$(dirname "$0")/preflight.sh"
install -d -m 0750 "$ROOT/releases" "$CONFIG_DIR/ssh"
rsync -a --delete "$(dirname "$0")/" "$ROOT/control/"
install -m 0644 "$ROOT/control/systemd/blog-x-primary-tunnel.service" /etc/systemd/system/blog-x-primary-tunnel.service
install -m 0644 "$ROOT/control/systemd/blog-x-primary-web.service" /etc/systemd/system/blog-x-primary-web.service
systemctl daemon-reload
systemctl enable --now blog-x-primary-tunnel.service
printf '%s\n' 'Primary prerequisites installed; deployment remains unchanged until deploy.sh succeeds.'
