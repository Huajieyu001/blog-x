#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly CONFIG=/etc/blog-x/primary.env
readonly CERT_DIR=/etc/letsencrypt/live/huajieyu001.top

fail() { printf 'PRIMARY PREFLIGHT FAILED: %s\n' "$1" >&2; exit 1; }
[[ ${EUID:-$(id -u)} -eq 0 ]] || fail "must run as root"
[[ -f $CONFIG ]] || fail "missing $CONFIG"
[[ $(stat -c '%a' "$CONFIG") == 600 ]] || fail "$CONFIG must be mode 0600"
# shellcheck disable=SC1090
. "$CONFIG"
for command in docker systemctl nginx ssh curl sha256sum tar rsync; do command -v "$command" >/dev/null || fail "required runtime is unavailable: $command"; done
[[ -x $SSH_KEY_PATH ]] || [[ -f $SSH_KEY_PATH ]] || fail "dedicated SSH key is missing"
[[ $(stat -c '%a' "$SSH_KEY_PATH") == 600 ]] || fail "dedicated SSH key must be mode 0600"
[[ -f $KNOWN_HOSTS_PATH ]] || fail "pinned known_hosts is missing"
[[ $(stat -c '%a' "$KNOWN_HOSTS_PATH") == 600 ]] || fail "pinned known_hosts must be mode 0600"
[[ ${PUBLIC_ORIGIN:-} == https://huajieyu001.top ]] || fail "PUBLIC_ORIGIN must be the canonical HTTPS domain"
[[ ${SECONDARY_SSH_HOST:-} && ${SECONDARY_SSH_USER:-} ]] || fail "secondary SSH host and user are required"
[[ ${SECONDARY_SSH_PORT:-} =~ ^[1-9][0-9]{0,4}$ ]] || fail "secondary SSH port is invalid"
[[ ${TUNNEL_PORT:-} == 3001 && ${WEB_PORT:-} == 3100 ]] || fail "only loopback tunnel 3001 and Web 3100 are supported"
[[ ${BLOG_X_INGRESS_AUTH_SECRET:-} =~ ^[A-Za-z0-9_-]{32,}$ ]] || fail "ingress secret must be at least 32 safe characters"
[[ -s $CERT_DIR/fullchain.pem && -s $CERT_DIR/privkey.pem ]] || fail "canonical TLS certificate is missing"
nginx -t >/dev/null || fail "current nginx configuration is invalid"
docker info >/dev/null || fail "Docker daemon is unavailable"
printf 'PRIMARY PREFLIGHT PASSED (no mutation performed)\n'
