#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly APP_ROOT=/opt/blog-x
readonly ENV_FILE=/etc/blog-x/secondary.env
readonly COMPOSE_FILE="$APP_ROOT/deploy/secondary/compose.yaml"
readonly PROJECT=blog-x-secondary

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf '%s\n' 'deploy must run as root' >&2
  exit 1
fi
[[ -f $ENV_FILE ]] || { printf '%s\n' 'secondary environment is missing' >&2; exit 1; }
[[ $(stat -c '%a' "$ENV_FILE") == 600 ]] || { printf '%s\n' 'secondary environment must be mode 0600' >&2; exit 1; }
[[ -f $COMPOSE_FILE ]] || { printf '%s\n' 'secondary compose bundle is missing' >&2; exit 1; }

if [[ -d $APP_ROOT/.git ]]; then
  revision=$(git -C "$APP_ROOT" rev-parse --verify HEAD)
else
  revision=$(tr -d '\r\n' < "$APP_ROOT/.blog-x-revision")
fi
[[ $revision =~ ^[a-f0-9]{40}$ ]] || { printf '%s\n' 'deployment revision is invalid' >&2; exit 1; }

export BLOG_X_REVISION="$revision"
compose=(docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")

"${compose[@]}" config --quiet
"${compose[@]}" build api
"${compose[@]}" up -d postgres
"${compose[@]}" run --rm api corepack pnpm --filter @blog-x/api db:migrate
"${compose[@]}" run --rm api corepack pnpm --filter @blog-x/api db:schema:verify
"${compose[@]}" up -d api

for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/health >/dev/null; then break; fi
  sleep 2
done
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/health >/dev/null
[[ $("${compose[@]}" port api 3001) == 127.0.0.1:3001 ]] || { printf '%s\n' 'API listener is not loopback-only' >&2; exit 1; }
if docker ps --format '{{.Ports}}' | grep -Eq '(^|[, ])(0\.0\.0\.0|\[::\]):5432'; then
  printf '%s\n' 'PostgreSQL must not publish a host port' >&2
  exit 1
fi
systemctl enable --now blog-x-secondary-backup.timer blog-x-secondary-publish-due.timer
printf 'Blog X secondary deployment healthy at revision %s\n' "$revision"
