#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly APP_ROOT=/opt/blog-x
readonly CONFIG_DIR=/etc/blog-x
readonly MEDIA_DIR=/var/lib/blog-x/media
readonly BACKUP_DIR=/var/backups/blog-x
readonly DEPLOYMENTS_DIR=/var/lib/blog-x/deployments
readonly ENV_FILE="$CONFIG_DIR/secondary.env"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf '%s\n' 'install must run as root' >&2
  exit 1
fi

. /etc/os-release
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != 24.04 ]]; then
  printf '%s\n' 'install requires Ubuntu 24.04' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends docker.io docker-compose-v2 ca-certificates curl openssl
systemctl enable --now docker

install -d -m 0750 "$APP_ROOT" "$CONFIG_DIR" "$MEDIA_DIR" "$BACKUP_DIR"
install -d -m 0700 -o root -g root "$DEPLOYMENTS_DIR"
if [[ ! -f $ENV_FILE ]]; then
  db_password=$(openssl rand -hex 32)
  ingress_secret=$(openssl rand -hex 32)
  {
    printf '%s\n' 'BLOG_X_POSTGRES_DB=blog_x'
    printf '%s\n' 'BLOG_X_POSTGRES_USER=blog_x'
    printf 'BLOG_X_POSTGRES_PASSWORD=%s\n' "$db_password"
    printf 'BLOG_X_INGRESS_AUTH_SECRET=%s\n' "$ingress_secret"
    printf '%s\n' 'KEEP_LOCAL_BACKUPS=7'
  } > "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"
chown root:root "$ENV_FILE"

install -m 0644 "$(dirname "$0")/systemd/blog-x-secondary-backup.service" /etc/systemd/system/blog-x-secondary-backup.service
install -m 0644 "$(dirname "$0")/systemd/blog-x-secondary-backup.timer" /etc/systemd/system/blog-x-secondary-backup.timer
install -m 0644 "$(dirname "$0")/systemd/blog-x-secondary-publish-due.service" /etc/systemd/system/blog-x-secondary-publish-due.service
install -m 0644 "$(dirname "$0")/systemd/blog-x-secondary-publish-due.timer" /etc/systemd/system/blog-x-secondary-publish-due.timer
install -m 0644 "$(dirname "$0")/systemd/blog-x-secondary-retention.service" /etc/systemd/system/blog-x-secondary-retention.service
install -m 0644 "$(dirname "$0")/systemd/blog-x-secondary-retention.timer" /etc/systemd/system/blog-x-secondary-retention.timer
systemctl daemon-reload
printf '%s\n' 'Blog X secondary prerequisites ready; deploy after the runtime health check to enable timers.'
