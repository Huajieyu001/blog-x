#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly APP_ROOT=/opt/blog-x
readonly ENV_FILE=/etc/blog-x/secondary.env
readonly COMPOSE_FILE="$APP_ROOT/deploy/secondary/compose.yaml"
readonly PROJECT=blog-x-secondary

[[ -f $ENV_FILE && -f $COMPOSE_FILE ]] || { printf '%s\n' 'secondary runtime configuration is missing' >&2; exit 1; }
revision=$(if [[ -d $APP_ROOT/.git ]]; then git -C "$APP_ROOT" rev-parse --verify HEAD; else tr -d '\r\n' < "$APP_ROOT/.blog-x-revision"; fi)
[[ $revision =~ ^[a-f0-9]{40}$ ]] || { printf '%s\n' 'deployment revision is invalid' >&2; exit 1; }
export BLOG_X_REVISION="$revision"
docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE" exec -T api corepack pnpm --filter @blog-x/api publish:due
