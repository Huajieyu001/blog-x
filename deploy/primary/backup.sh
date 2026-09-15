#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly BACKUP_ROOT=/var/backups/blog-x/primary
readonly CURRENT=/opt/blog-x/current

[[ ${EUID:-$(id -u)} -eq 0 ]] || { printf '%s\n' 'backup must run as root' >&2; exit 1; }
for command in tar sha256sum nginx; do command -v "$command" >/dev/null || { printf 'missing backup command: %s\n' "$command" >&2; exit 1; }; done

backup_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
stage="$BACKUP_ROOT/.${backup_id}.incomplete-$$"
final="$BACKUP_ROOT/$backup_id"
install -d -m 0700 "$BACKUP_ROOT"
[[ ! -e $final ]] || { printf '%s\n' 'backup collision' >&2; exit 1; }
mkdir -m 0700 "$stage"
trap 'rm -rf -- "$stage"' EXIT

paths=(/etc/nginx /etc/letsencrypt /usr/share/nginx/html/blog)
[[ -e /etc/blog-x ]] && paths+=(/etc/blog-x)
[[ -e /opt/blog-x ]] && paths+=(/opt/blog-x)
[[ -e /etc/systemd/system/blog-x-primary-web.service ]] && paths+=(/etc/systemd/system/blog-x-primary-web.service)
[[ -e /etc/systemd/system/blog-x-primary-tunnel.service ]] && paths+=(/etc/systemd/system/blog-x-primary-tunnel.service)
tar --xattrs --acls -czf "$stage/primary-state.tar.gz" "${paths[@]}"
if [[ -L $CURRENT ]]; then readlink -f "$CURRENT" > "$stage/current-release"; else : > "$stage/current-release"; fi
nginx -T > "$stage/nginx-effective.txt" 2>&1
checksum_files=(primary-state.tar.gz current-release nginx-effective.txt metadata.json)
if command -v docker >/dev/null && docker inspect blog-x-web >/dev/null 2>&1; then
  docker inspect --format '{{.Config.Image}} {{.Image}}' blog-x-web > "$stage/web-image"
  checksum_files+=(web-image)
fi
printf '{"format":"blog-x-primary-backup","version":2,"createdAt":"%s","scope":"primary-state-before-cutover"}\n' "$(date -u +%FT%TZ)" > "$stage/metadata.json"
(cd "$stage" && sha256sum "${checksum_files[@]}" > SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null)
touch "$stage/COMPLETE"
chmod -R go-rwx "$stage"
mv -- "$stage" "$final"
trap - EXIT
printf '%s\n' "$backup_id"
