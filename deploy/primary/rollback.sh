#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly RELEASE_ROOT=/opt/blog-x/releases
readonly CURRENT=/opt/blog-x/current
readonly CONFIG=/etc/blog-x/primary.env
release_id="${1:-}"
release="$RELEASE_ROOT/$release_id"
[[ $release_id =~ ^[a-f0-9]{40}$ && -f $release/release.env ]] || { printf '%s\n' 'usage: rollback.sh <retained-40-char-release-revision>' >&2; exit 1; }
[[ -f $CONFIG ]] || { printf '%s\n' 'primary environment is missing' >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONFIG"
# shellcheck disable=SC1090
. "$release/release.env"
[[ $IMAGE == "blog-x-web:$release_id" ]] || { printf '%s\n' 'release image metadata is invalid' >&2; exit 1; }
docker image inspect "$IMAGE" >/dev/null || { printf '%s\n' 'rollback image is unavailable' >&2; exit 1; }
systemctl stop blog-x-primary-web.service >/dev/null 2>&1 || true
docker rm -f blog-x-web >/dev/null 2>&1 || true
ln -sfn "$release" "$CURRENT.next"
mv -Tf "$CURRENT.next" "$CURRENT"
docker create --name blog-x-web --network host --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --tmpfs /workspace/apps/web/.next/cache:rw,nosuid,size=64m \
  -e NODE_ENV=production -e HOST=127.0.0.1 -e PORT=3100 -e PUBLIC_ORIGIN="$PUBLIC_ORIGIN" -e INTERNAL_API_ORIGIN=http://127.0.0.1:3001 \
  -e BLOG_X_INGRESS_AUTH_SECRET="$(sed -n 's/^BLOG_X_INGRESS_AUTH_SECRET=//p' "$CONFIG")" "$IMAGE"
systemctl enable --now blog-x-primary-web.service
"$(dirname "$0")/healthcheck.sh" 3100
nginx -t && nginx -s reload
printf 'PRIMARY ROLLBACK COMPLETE %s\n' "$release_id"
