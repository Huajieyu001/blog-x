#!/usr/bin/env bash
# Shell helpers shared by secondary Compose callers. They never print environment values.

# BLOG_X_TRUSTED_PEER_BEGIN
blog_x_private_ipv4() {
  local value=$1 a b c d
  [[ $value =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  a=${BASH_REMATCH[1]}; b=${BASH_REMATCH[2]}; c=${BASH_REMATCH[3]}; d=${BASH_REMATCH[4]}
  (( a <= 255 && b <= 255 && c <= 255 && d <= 255 )) || return 1
  (( a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) ))
}

blog_x_assert_ingress_network() {
  local project=$1 network identity
  [[ $project =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || return 1
  network="${project}_ingress"
  identity="$(docker network inspect --format '{{.Driver}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.network"}}' "$network")" || return 1
  [[ $identity == "bridge|${project}|ingress" ]]
}

blog_x_ensure_ingress_network() {
  local project=$1 network
  [[ $project =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || return 1
  network="${project}_ingress"
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    docker network create --driver bridge --label "com.docker.compose.project=${project}" --label 'com.docker.compose.network=ingress' "$network" >/dev/null || return 1
  fi
  blog_x_assert_ingress_network "$project"
}

blog_x_trusted_proxy_cidr() {
  local project=$1 network gateway
  [[ $project =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || return 1
  blog_x_assert_ingress_network "$project" || return 1
  network="${project}_ingress"
  gateway="$(docker network inspect --format '{{range .IPAM.Config}}{{println .Gateway}}{{end}}' "$network")" || return 1
  [[ $gateway != *$'\n'* ]] && blog_x_private_ipv4 "$gateway" || return 1
  printf '%s/32\n' "$gateway"
}

blog_x_export_trusted_proxy_cidr() {
  local cidr
  cidr="$(blog_x_trusted_proxy_cidr "$1")" || return 1
  export TRUSTED_PROXY_CIDRS="$cidr"
}

blog_x_assert_api_ingress_gateway() {
  local project=$1 api_container=$2 expected actual format
  expected="$(blog_x_trusted_proxy_cidr "$project")" || return 1
  format="{{with index .NetworkSettings.Networks \"${project}_ingress\"}}{{.Gateway}}{{end}}"
  actual="$(docker inspect --format "$format" "$api_container")" || return 1
  [[ $actual != *$'\n'* ]] && [[ "$actual/32" == "$expected" ]]
}
# BLOG_X_TRUSTED_PEER_END
