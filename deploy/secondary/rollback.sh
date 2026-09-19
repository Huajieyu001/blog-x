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
readonly LAST_ROLLBACK_RECORD="$DEPLOYMENTS_DIR/last-rollback.env"

is_revision() { [[ $1 =~ ^[a-f0-9]{40}$ ]]; }
is_image_id() { [[ $1 =~ ^sha256:[a-f0-9]{64}$ ]]; }

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

single_running_service() {
  local service=$1
  local -a containers=()
  mapfile -t containers < <(docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$service" --format '{{.ID}}')
  [[ ${#containers[@]} -eq 1 ]] || fail "expected exactly one running secondary $service container"
  printf '%s\n' "${containers[0]}"
}

assert_service_topology() {
  local container=$1
  local service=$2
  [[ "$(docker inspect --format '{{ index .Config.Labels \"com.docker.compose.project\" }}' "$container")" == "$PROJECT" ]] || fail "$service project topology is invalid"
  [[ "$(docker inspect --format '{{ index .Config.Labels \"com.docker.compose.service\" }}' "$container")" == "$service" ]] || fail "$service topology is invalid"
}

write_current_record() {
  local state_tmp="$DEPLOYMENTS_DIR/.current.env.$$"
  (umask 077; printf '%s\n' \
    'FORMAT=blog-x-secondary-current-v1' \
    "CURRENT_REVISION=$prior_revision" \
    "CURRENT_IMAGE_ID=$prior_image_id" > "$state_tmp")
  chmod 0600 "$state_tmp"
  chown root:root "$state_tmp"
  mv -f -- "$state_tmp" "$CURRENT_RECORD"
}

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  fail 'rollback must run as root'
fi
[[ $# -eq 2 ]] || fail 'usage: rollback.sh <recorded-prior-revision> --ack-migrations-compatible-with=<recorded-candidate-revision>'
target_revision=$1
acknowledgement=$2
is_revision "$target_revision" || fail 'rollback target revision is invalid'
[[ $acknowledgement =~ ^--ack-migrations-compatible-with=([a-f0-9]{40})$ ]] || fail 'rollback migration acknowledgement is invalid'
ack_candidate_revision="${BASH_REMATCH[1]}"

[[ -f $ENV_FILE ]] || fail 'secondary environment is missing'
[[ $(stat -c '%a' "$ENV_FILE") == 600 ]] || fail 'secondary environment must be mode 0600'
[[ $(stat -c '%U:%G' "$ENV_FILE") == root:root ]] || fail 'secondary environment must be owned by root:root'
[[ -d $DEPLOYMENTS_DIR && ! -L $DEPLOYMENTS_DIR ]] || fail 'deployment state directory is invalid'
[[ $(stat -c '%a' "$DEPLOYMENTS_DIR") == 700 ]] || fail 'deployment state directory must be mode 0700'
[[ $(stat -c '%U:%G' "$DEPLOYMENTS_DIR") == root:root ]] || fail 'deployment state directory must be owned by root:root'
[[ ! -L $ROLLBACK_RECORD && -f $ROLLBACK_RECORD ]] || fail 'rollback state is missing or unsafe'
[[ $(stat -c '%a' "$ROLLBACK_RECORD") == 600 ]] || fail 'rollback state must be mode 0600'
[[ $(stat -c '%U:%G' "$ROLLBACK_RECORD") == root:root ]] || fail 'rollback state must be owned by root:root'

declare -A rollback_state=()
while IFS= read -r line || [[ -n $line ]]; do
  [[ $line =~ ^([A-Z_]+)=(.*)$ ]] || fail 'rollback state format is invalid'
  field="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  case "$field" in
    FORMAT|PRIOR_PRESENT|CANDIDATE_REVISION|CANDIDATE_IMAGE_ID|PRIOR_REVISION|PRIOR_IMAGE_ID) ;;
    *) fail 'rollback state contains an unknown field' ;;
  esac
  [[ ! -v "rollback_state[$field]" ]] || fail 'rollback state contains a duplicate field'
  rollback_state["$field"]=$value
done < "$ROLLBACK_RECORD"
for field in FORMAT PRIOR_PRESENT CANDIDATE_REVISION CANDIDATE_IMAGE_ID PRIOR_REVISION PRIOR_IMAGE_ID; do
  [[ -v "rollback_state[$field]" ]] || fail 'rollback state is incomplete'
done
[[ ${#rollback_state[@]} -eq 6 ]] || fail 'rollback state field count is invalid'

[[ ${rollback_state[FORMAT]} == blog-x-secondary-rollback-v1 ]] || fail 'rollback state version is invalid'
[[ ${rollback_state[PRIOR_PRESENT]} == 1 ]] || fail 'rollback is unavailable for an initial deployment'
candidate_revision=${rollback_state[CANDIDATE_REVISION]}
candidate_image_id=${rollback_state[CANDIDATE_IMAGE_ID]}
prior_revision=${rollback_state[PRIOR_REVISION]}
prior_image_id=${rollback_state[PRIOR_IMAGE_ID]}
is_revision "$candidate_revision" && is_revision "$prior_revision" || fail 'rollback state revision is invalid'
is_image_id "$candidate_image_id" && is_image_id "$prior_image_id" || fail 'rollback state image ID is invalid'
[[ $candidate_revision != "$prior_revision" && $candidate_image_id != "$prior_image_id" ]] || fail 'rollback state identities are not distinct'
[[ $target_revision == "$prior_revision" ]] || fail 'rollback target does not match recorded prior revision'
[[ $ack_candidate_revision == "$candidate_revision" ]] || fail 'rollback acknowledgement does not match recorded candidate revision'

[[ "$(docker image inspect --format '{{.Id}}' "$prior_image_id")" == "$prior_image_id" ]] || fail 'recorded prior image is unavailable'
prior_label="$(docker image inspect --format '{{ index .Config.Labels \"org.opencontainers.image.revision\" }}' "$prior_image_id")"
if [[ -z $prior_label || $prior_label == '<no value>' ]]; then
  prior_tag="blog-x-api-secondary:$prior_revision"
  [[ "$(docker image inspect --format '{{.Id}}' "$prior_tag")" == "$prior_image_id" ]] || fail 'legacy prior image tag does not resolve to recorded image ID'
else
  [[ $prior_label == "$prior_revision" ]] || fail 'recorded prior image revision label is invalid'
fi

current_api="$(single_running_service api)"
current_postgres="$(single_running_service postgres)"
assert_service_topology "$current_api" api
assert_service_topology "$current_postgres" postgres
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$current_api")" == healthy ]] || fail 'current API is not healthy'
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$current_postgres")" == healthy ]] || fail 'current PostgreSQL is not healthy'
[[ "$(docker inspect --format '{{.Image}}' "$current_api")" == "$candidate_image_id" ]] || fail 'current API image does not match rollback candidate'
[[ "$(docker image inspect --format '{{ index .Config.Labels \"org.opencontainers.image.revision\" }}' "$candidate_image_id")" == "$candidate_revision" ]] || fail 'current API revision does not match rollback candidate'

compose=(env "BLOG_X_REVISION=$prior_revision" "BLOG_X_API_IMAGE=$prior_image_id" docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file "$COMPOSE_FILE")
"${compose[@]}" config --quiet
[[ $("${compose[@]}" port api 3001) == 127.0.0.1:3001 ]] || fail 'API listener is not loopback-only'
if docker port "$current_postgres" 5432 >/dev/null 2>&1; then
  fail 'PostgreSQL must not publish a host port'
fi

"${compose[@]}" up -d --no-build --no-deps api
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/health >/dev/null; then break; fi
  sleep 2
done
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/health >/dev/null
restored_api="$(single_running_service api)"
assert_service_topology "$restored_api" api
[[ "$(docker inspect --format '{{.Image}}' "$restored_api")" == "$prior_image_id" ]] || fail 'restored API image does not match recorded prior image'
[[ "$(docker image inspect --format '{{ index .Config.Labels \"org.opencontainers.image.revision\" }}' "$prior_image_id")" == "$prior_revision" || $prior_label == '<no value>' || -z $prior_label ]] || fail 'restored API revision label is invalid'
[[ $("${compose[@]}" port api 3001) == 127.0.0.1:3001 ]] || fail 'restored API listener is not loopback-only'
write_current_record
mv -f -- "$ROLLBACK_RECORD" "$LAST_ROLLBACK_RECORD"
printf 'SECONDARY ROLLBACK COMPLETE %s %s %s %s\n' "$candidate_revision" "$candidate_image_id" "$prior_revision" "$prior_image_id"
