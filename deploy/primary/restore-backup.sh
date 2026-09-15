#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly BACKUP_ROOT=/var/backups/blog-x/primary
readonly CURRENT=/opt/blog-x/current
readonly NGINX_TARGET=/etc/nginx/conf.d/blog-x.conf
readonly LEGACY_DISABLED=/etc/nginx/conf.d/blog.conf.disabled-blog-x

backup_id="${1:-}"
[[ $backup_id =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ ]] || { printf '%s\n' 'usage: restore-backup.sh <backup-id>' >&2; exit 1; }
backup="$BACKUP_ROOT/$backup_id"
[[ -f $backup/COMPLETE && -f $backup/primary-state.tar.gz && -f $backup/SHA256SUMS ]] || { printf '%s\n' 'complete primary backup is unavailable' >&2; exit 1; }
(cd "$backup" && sha256sum -c SHA256SUMS >/dev/null)

systemctl disable --now blog-x-primary-web.service >/dev/null 2>&1 || true
if command -v docker >/dev/null; then docker rm -f blog-x-web >/dev/null 2>&1 || true; fi
rm -f -- "$NGINX_TARGET" "$LEGACY_DISABLED"
tar --xattrs --acls -xzf "$backup/primary-state.tar.gz" -C /
previous="$(cat "$backup/current-release")"
if [[ -n $previous && -d $previous ]]; then
  release_id="${previous##*/}"
  if [[ $release_id =~ ^[a-f0-9]{40}$ && -f $previous/release.env ]]; then
    "$(dirname "$0")/rollback.sh" "$release_id"
    printf 'PRIMARY BACKUP RESTORED %s\n' "$backup_id"
    exit 0
  fi
elif [[ -L $CURRENT ]]; then
  rm -f -- "$CURRENT"
fi
nginx -t
systemctl reload nginx
printf 'PRIMARY BACKUP RESTORED %s\n' "$backup_id"
