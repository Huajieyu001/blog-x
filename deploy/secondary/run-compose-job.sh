#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly ENV_FILE=/etc/blog-x/secondary.env
readonly COMPOSE_FILE=/opt/blog-x/deploy/secondary/compose.yaml
readonly PROJECT=blog-x-secondary
readonly TRUSTED_PEER_RESOLVER=/opt/blog-x/deploy/secondary/trusted-peer.sh

[[ $# -eq 1 && ( $1 == retention || $1 == publish-due ) ]] || exit 1
[[ -f $ENV_FILE && -f $COMPOSE_FILE && -f $TRUSTED_PEER_RESOLVER && ! -L $TRUSTED_PEER_RESOLVER ]] || exit 1
. "$TRUSTED_PEER_RESOLVER"
blog_x_export_trusted_proxy_cidr "$PROJECT" || exit 1
if [[ $1 == retention ]]; then
  exec docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE" exec -T api corepack pnpm --filter @blog-x/api retention --views-limit=100 --sessions-limit=100
fi
exec docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE" exec -T api corepack pnpm --filter @blog-x/api publish:due --limit=100
