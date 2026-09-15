#!/usr/bin/env bash
set -euo pipefail
umask 077

# This creates a same-host recovery copy only. It is not an off-host disaster-recovery backup.
readonly APP_ROOT=/opt/blog-x
readonly ENV_FILE=/etc/blog-x/secondary.env
readonly COMPOSE_FILE="$APP_ROOT/deploy/secondary/compose.yaml"
readonly PROJECT=blog-x-secondary
readonly BACKUP_ROOT=/var/backups/blog-x

[[ ${EUID:-$(id -u)} -eq 0 ]] || { printf '%s\n' 'backup must run as root' >&2; exit 1; }
[[ -f $ENV_FILE && -f $COMPOSE_FILE ]] || { printf '%s\n' 'secondary runtime configuration is missing' >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a
[[ ${KEEP_LOCAL_BACKUPS:-} =~ ^[1-9][0-9]?$ ]] || { printf '%s\n' 'KEEP_LOCAL_BACKUPS must be between 1 and 99' >&2; exit 1; }
revision=$(if [[ -d $APP_ROOT/.git ]]; then git -C "$APP_ROOT" rev-parse --verify HEAD; else tr -d '\r\n' < "$APP_ROOT/.blog-x-revision"; fi)
[[ $revision =~ ^[a-f0-9]{40}$ ]] || { printf '%s\n' 'deployment revision is invalid' >&2; exit 1; }

install -d -m 0700 "$BACKUP_ROOT"
set_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
final="$BACKUP_ROOT/$set_id"
stage="$BACKUP_ROOT/.$set_id.incomplete-$$"
[[ ! -e $final ]] || { printf '%s\n' 'backup final collision exists' >&2; exit 1; }
mkdir -m 0700 "$stage"
trap 'rm -rf -- "$stage"' EXIT
compose=(docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")
"${compose[@]}" exec -T postgres pg_dump -U "$BLOG_X_POSTGRES_USER" -d "$BLOG_X_POSTGRES_DB" -Fc > "$stage/database.dump"
"${compose[@]}" exec -T api tar -C /var/lib/blog-x/media -czf - . > "$stage/media.tar.gz"
printf '{"format":"blog-x-secondary-local-backup","version":1,"scope":"same-host-not-off-host-disaster-recovery","createdAt":"%s","revision":"%s","files":["database.dump","media.tar.gz"]}\n' "$(date -u +%FT%TZ)" "$revision" > "$stage/metadata.json"
(cd "$stage" && sha256sum database.dump media.tar.gz metadata.json > SHA256SUMS && sha256sum -c SHA256SUMS)
"${compose[@]}" exec -T postgres pg_restore -l < "$stage/database.dump" >/dev/null
tar -tzf "$stage/media.tar.gz" >/dev/null
mv -- "$stage" "$final"
trap - EXIT
mapfile -t old_sets < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '????????T??????Z-????????' -printf '%f\n' | sort | head -n -"$KEEP_LOCAL_BACKUPS")
for old_set in "${old_sets[@]}"; do rm -rf -- "$BACKUP_ROOT/$old_set"; done
printf 'LOCAL BACKUP COMPLETE %s (not off-host disaster recovery)\n' "$set_id"
