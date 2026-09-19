#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly APP_ROOT=/opt/blog-x
readonly ENV_FILE=/etc/blog-x/secondary.env
readonly COMPOSE_FILE="$APP_ROOT/deploy/secondary/compose.yaml"
readonly PROJECT=blog-x-secondary
readonly DEPLOYMENTS_DIR=/var/lib/blog-x/deployments
readonly ROLLBACK_RECORD="$DEPLOYMENTS_DIR/rollback.env"
readonly CURRENT_RECORD="$DEPLOYMENTS_DIR/current.env"

is_revision() { [[ $1 =~ ^[a-f0-9]{40}$ ]]; }
is_image_id() { [[ $1 =~ ^sha256:[a-f0-9]{64}$ ]]; }

single_running_api() {
  local -a api_containers=()
  mapfile -t api_containers < <(docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.service=api' --format '{{.ID}}')
  [[ ${#api_containers[@]} -le 1 ]] || { printf '%s\n' 'multiple running secondary API containers are ambiguous' >&2; exit 1; }
  [[ ${#api_containers[@]} -eq 1 ]] && printf '%s\n' "${api_containers[0]}"
}

load_current_record() {
  current_record_present=0
  current_revision=''
  current_image_id=''
  [[ ! -e $CURRENT_RECORD && ! -L $CURRENT_RECORD ]] && return
  [[ -d $DEPLOYMENTS_DIR && ! -L $DEPLOYMENTS_DIR ]] || { printf '%s\n' 'deployment state directory is invalid' >&2; exit 1; }
  [[ $(stat -c '%a' "$DEPLOYMENTS_DIR") == 700 ]] || { printf '%s\n' 'deployment state directory must be mode 0700' >&2; exit 1; }
  [[ $(stat -c '%U:%G' "$DEPLOYMENTS_DIR") == root:root ]] || { printf '%s\n' 'deployment state directory must be owned by root:root' >&2; exit 1; }
  [[ ! -L $CURRENT_RECORD && -f $CURRENT_RECORD ]] || { printf '%s\n' 'current deployment state is missing or unsafe' >&2; exit 1; }
  [[ $(stat -c '%a' "$CURRENT_RECORD") == 600 ]] || { printf '%s\n' 'current deployment state must be mode 0600' >&2; exit 1; }
  [[ $(stat -c '%U:%G' "$CURRENT_RECORD") == root:root ]] || { printf '%s\n' 'current deployment state must be owned by root:root' >&2; exit 1; }

  declare -A current_state=()
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^([A-Z_]+)=(.*)$ ]] || { printf '%s\n' 'current deployment state format is invalid' >&2; exit 1; }
    field="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    case "$field" in
      FORMAT|CURRENT_REVISION|CURRENT_IMAGE_ID) ;;
      *) printf '%s\n' 'current deployment state contains an unknown field' >&2; exit 1 ;;
    esac
    [[ -z ${current_state[$field]+present} ]] || { printf '%s\n' 'current deployment state contains a duplicate field' >&2; exit 1; }
    current_state["$field"]=$value
  done < "$CURRENT_RECORD"
  for field in FORMAT CURRENT_REVISION CURRENT_IMAGE_ID; do
    [[ -n ${current_state[$field]+present} ]] || { printf '%s\n' 'current deployment state is incomplete' >&2; exit 1; }
  done
  [[ ${#current_state[@]} -eq 3 ]] || { printf '%s\n' 'current deployment state field count is invalid' >&2; exit 1; }
  [[ ${current_state[FORMAT]} == blog-x-secondary-current-v1 ]] || { printf '%s\n' 'current deployment state version is invalid' >&2; exit 1; }
  current_revision=${current_state[CURRENT_REVISION]}
  current_image_id=${current_state[CURRENT_IMAGE_ID]}
  is_revision "$current_revision" || { printf '%s\n' 'current deployment state revision is invalid' >&2; exit 1; }
  is_image_id "$current_image_id" || { printf '%s\n' 'current deployment state image ID is invalid' >&2; exit 1; }
  current_record_present=1
}

write_rollback_record() {
  local state_tmp="$DEPLOYMENTS_DIR/.rollback.env.$$"
  install -d -m 0700 -o root -g root "$DEPLOYMENTS_DIR"
  (umask 077; printf '%s\n' \
    'FORMAT=blog-x-secondary-rollback-v1' \
    "PRIOR_PRESENT=$prior_present" \
    "CANDIDATE_REVISION=$revision" \
    "CANDIDATE_IMAGE_ID=$candidate_image_id" \
    "PRIOR_REVISION=$prior_revision" \
    "PRIOR_IMAGE_ID=$prior_image_id" > "$state_tmp")
  chmod 0600 "$state_tmp"
  chown root:root "$state_tmp"
  mv -f -- "$state_tmp" "$ROLLBACK_RECORD"
}

write_current_record() {
  local state_tmp="$DEPLOYMENTS_DIR/.current.env.$$"
  (umask 077; printf '%s\n' \
    'FORMAT=blog-x-secondary-current-v1' \
    "CURRENT_REVISION=$revision" \
    "CURRENT_IMAGE_ID=$candidate_image_id" > "$state_tmp")
  chmod 0600 "$state_tmp"
  chown root:root "$state_tmp"
  mv -f -- "$state_tmp" "$CURRENT_RECORD"
}

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  printf '%s\n' 'deploy must run as root' >&2
  exit 1
fi
[[ -f $ENV_FILE ]] || { printf '%s\n' 'secondary environment is missing' >&2; exit 1; }
[[ $(stat -c '%a' "$ENV_FILE") == 600 ]] || { printf '%s\n' 'secondary environment must be mode 0600' >&2; exit 1; }
[[ $(stat -c '%U:%G' "$ENV_FILE") == root:root ]] || { printf '%s\n' 'secondary environment must be owned by root:root' >&2; exit 1; }
[[ -f $COMPOSE_FILE ]] || { printf '%s\n' 'secondary compose bundle is missing' >&2; exit 1; }

if [[ -d $APP_ROOT/.git ]]; then
  revision=$(git -C "$APP_ROOT" rev-parse --verify HEAD)
else
  revision=$(tr -d '\r\n' < "$APP_ROOT/.blog-x-revision")
fi
is_revision "$revision" || { printf '%s\n' 'deployment revision is invalid' >&2; exit 1; }

prior_present=0
prior_revision=''
prior_image_id=''
load_current_record
prior_container="$(single_running_api)"
if [[ -n $prior_container ]]; then
  prior_image_id="$(docker inspect --format '{{.Image}}' "$prior_container")"
  is_image_id "$prior_image_id" || { printf '%s\n' 'running API image ID is invalid' >&2; exit 1; }
  prior_config_image="$(docker inspect --format '{{.Config.Image}}' "$prior_container")"
  prior_label="$(docker image inspect --format '{{ index .Config.Labels \"org.opencontainers.image.revision\" }}' "$prior_image_id")"
  if [[ -n $prior_label && $prior_label != '<no value>' ]]; then
    is_revision "$prior_label" || { printf '%s\n' 'running API revision label is invalid' >&2; exit 1; }
    prior_revision="$prior_label"
    if [[ $current_record_present -eq 1 ]]; then
      [[ $current_image_id == "$prior_image_id" ]] || { printf '%s\n' 'current deployment state image does not match running API' >&2; exit 1; }
      [[ $current_revision == "$prior_revision" ]] || { printf '%s\n' 'current deployment state revision conflicts with running API' >&2; exit 1; }
    fi
  elif [[ $current_record_present -eq 1 ]]; then
    [[ $current_image_id == "$prior_image_id" ]] || { printf '%s\n' 'current deployment state image does not match running API' >&2; exit 1; }
    prior_revision="$current_revision"
  else
    [[ $prior_config_image =~ ^blog-x-api-secondary:([a-f0-9]{40})$ ]] || { printf '%s\n' 'running legacy API revision tag is invalid' >&2; exit 1; }
    prior_revision="${BASH_REMATCH[1]}"
    [[ "$(docker image inspect --format '{{.Id}}' "$prior_config_image")" == "$prior_image_id" ]] || { printf '%s\n' 'running legacy API revision tag does not resolve to its image ID' >&2; exit 1; }
  fi
  prior_present=1
fi

[[ $prior_revision != "$revision" ]] || { printf '%s\n' 'candidate revision is already running' >&2; exit 1; }
export BLOG_X_REVISION="$revision"
compose=(docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")

"${compose[@]}" config --quiet
unset BLOG_X_API_IMAGE
"${compose[@]}" build api
candidate_tag="blog-x-api-secondary:$revision"
candidate_image_id="$(docker image inspect --format '{{.Id}}' "$candidate_tag")"
is_image_id "$candidate_image_id" || { printf '%s\n' 'candidate API image ID is invalid' >&2; exit 1; }
candidate_label="$(docker image inspect --format '{{ index .Config.Labels \"org.opencontainers.image.revision\" }}' "$candidate_image_id")"
[[ $candidate_label == "$revision" ]] || { printf '%s\n' 'candidate API revision label is invalid' >&2; exit 1; }
write_rollback_record

candidate_compose=(env "BLOG_X_REVISION=$revision" "BLOG_X_API_IMAGE=$candidate_image_id" docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")
"${candidate_compose[@]}" config --quiet
"${candidate_compose[@]}" up -d --no-build postgres
"${candidate_compose[@]}" run --rm --no-build api corepack pnpm --filter @blog-x/api db:migrate
"${candidate_compose[@]}" run --rm --no-build api corepack pnpm --filter @blog-x/api db:schema:verify
"${candidate_compose[@]}" up -d --no-build api

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
running_api="$(single_running_api)"
[[ -n $running_api ]] || { printf '%s\n' 'secondary API container is missing after cutover' >&2; exit 1; }
[[ "$(docker inspect --format '{{.Image}}' "$running_api")" == "$candidate_image_id" ]] || { printf '%s\n' 'secondary API image ID does not match candidate' >&2; exit 1; }
[[ "$(docker inspect --format '{{ index .Config.Labels \"com.docker.compose.project\" }}' "$running_api")" == "$PROJECT" ]] || { printf '%s\n' 'secondary API project topology is invalid' >&2; exit 1; }
[[ "$(docker inspect --format '{{ index .Config.Labels \"com.docker.compose.service\" }}' "$running_api")" == api ]] || { printf '%s\n' 'secondary API service topology is invalid' >&2; exit 1; }
write_current_record
systemctl enable --now blog-x-secondary-backup.timer blog-x-secondary-publish-due.timer blog-x-secondary-retention.timer
printf 'SECONDARY DEPLOYMENT COMPLETE %s %s\n' "$revision" "$candidate_image_id"
