#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly RELEASE_ROOT=/opt/blog-x/releases
readonly CURRENT=/opt/blog-x/current
readonly CONFIG=/etc/blog-x/primary.env
readonly NGINX_SOURCE="$(dirname "$0")/nginx/blog-x.conf.template"
readonly NGINX_TARGET=/etc/nginx/conf.d/blog-x.conf
readonly LEGACY_NGINX=/etc/nginx/conf.d/blog.conf
readonly LEGACY_DISABLED=/etc/nginx/conf.d/blog.conf.disabled-blog-x
revision="${1:-}"
source_dir="${2:-}"
image_archive="${3:-}"
[[ $revision =~ ^[a-f0-9]{40}$ ]] || { printf '%s\n' 'usage: deploy.sh <40-char-revision> <staged-source-directory> <image-archive>' >&2; exit 1; }
[[ -d $source_dir/apps/web && -f $source_dir/apps/web/Dockerfile ]] || { printf '%s\n' 'staged source is not a Blog X Web build context' >&2; exit 1; }
[[ -f $image_archive ]] || { printf '%s\n' 'prebuilt Web image archive is missing' >&2; exit 1; }
"$(dirname "$0")/preflight.sh"
# shellcheck disable=SC1090
. "$CONFIG"
systemctl is-active --quiet blog-x-primary-tunnel.service || { printf '%s\n' 'private API tunnel is not active' >&2; exit 1; }
backup_id="$("$(dirname "$0")/backup.sh")"
release="$RELEASE_ROOT/$revision"
stage="$RELEASE_ROOT/.${revision}.incomplete-$$"
candidate="blog-x-web-candidate-$revision"
cutover_started=0
cleanup() {
  status=$?
  trap - EXIT
  docker rm -f "$candidate" >/dev/null 2>&1 || true
  rm -rf -- "$stage"
  if [[ $status -ne 0 && $cutover_started -eq 1 ]]; then
    "$(dirname "$0")/restore-backup.sh" "$backup_id" || printf 'AUTOMATIC RESTORE FAILED; use backup %s\n' "$backup_id" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

[[ ! -e $release ]] || { printf '%s\n' 'release revision already exists; use rollback or a new revision' >&2; exit 1; }
install -d -m 0750 "$RELEASE_ROOT"
mkdir -m 0750 "$stage"
rsync -a --delete --exclude .git --exclude node_modules "$source_dir/" "$stage/source/"
archive_sha="$(sha256sum "$image_archive" | awk '{print $1}')"
docker load --input "$image_archive" >/dev/null
image="blog-x-web:$revision"
image_id="$(docker image inspect --format '{{.Id}}' "$image")"
docker run -d --name "$candidate" --network host --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /workspace/apps/web/.next/cache:rw,nosuid,size=64m \
  -e NODE_ENV=production -e HOST=127.0.0.1 -e PORT=3101 -e PUBLIC_ORIGIN="$PUBLIC_ORIGIN" -e INTERNAL_API_ORIGIN=http://127.0.0.1:3001 \
  -e BLOG_X_INGRESS_AUTH_SECRET="$BLOG_X_INGRESS_AUTH_SECRET" "$image" >/dev/null
for _ in $(seq 1 20); do "$(dirname "$0")/healthcheck.sh" 3101 >/dev/null && break || sleep 2; done
"$(dirname "$0")/healthcheck.sh" 3101
printf 'IMAGE=%q\nIMAGE_ID=%q\nREVISION=%q\nARCHIVE_SHA256=%q\n' "$image" "$image_id" "$revision" "$archive_sha" > "$stage/release.env"
sed "s/__BLOG_X_INGRESS_AUTH_SECRET__/$BLOG_X_INGRESS_AUTH_SECRET/g" "$NGINX_SOURCE" > "$stage/blog-x.conf"
mv -- "$stage" "$release"

cutover_started=1
ln -sfn "$release" "$CURRENT.next"
mv -Tf "$CURRENT.next" "$CURRENT"
docker rm -f "$candidate" >/dev/null
systemctl stop blog-x-primary-web.service >/dev/null 2>&1 || true
docker rm -f blog-x-web >/dev/null 2>&1 || true
docker create --name blog-x-web --network host --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /workspace/apps/web/.next/cache:rw,nosuid,size=64m \
  -e NODE_ENV=production -e HOST=127.0.0.1 -e PORT=3100 -e PUBLIC_ORIGIN="$PUBLIC_ORIGIN" -e INTERNAL_API_ORIGIN=http://127.0.0.1:3001 \
  -e BLOG_X_INGRESS_AUTH_SECRET="$BLOG_X_INGRESS_AUTH_SECRET" "$image" >/dev/null
systemctl enable --now blog-x-primary-web.service
for _ in $(seq 1 20); do "$(dirname "$0")/healthcheck.sh" 3100 >/dev/null && break || sleep 2; done
"$(dirname "$0")/healthcheck.sh" 3100

install -m 0640 "$release/blog-x.conf" "$NGINX_TARGET"
if [[ -f $LEGACY_NGINX ]]; then mv -- "$LEGACY_NGINX" "$LEGACY_DISABLED"; fi
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --max-time 10 https://huajieyu001.top/api/health >/dev/null
curl --fail --silent --show-error --max-time 10 https://huajieyu001.top/ | grep -F '黔ICP备2023015906号' >/dev/null
cutover_started=0
trap - EXIT
printf 'PRIMARY DEPLOYMENT COMPLETE %s BACKUP %s\n' "$revision" "$backup_id"
