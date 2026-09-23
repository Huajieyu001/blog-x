#!/usr/bin/env bash
# Reversible primary-host hardening. Run only from a verified key session.
set -euo pipefail
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly TEST_ROOT="${BLOG_X_HARDEN_TEST_ROOT:-}"
readonly TEST_MODE="${BLOG_X_HARDEN_TEST_MODE:-}"
readonly TEST_ALLOW="${BLOG_X_HARDEN_TEST_ALLOW:-}"
readonly ADMIN_USER=blog-x-admin
readonly TUNNEL_SERVICE=blog-x-primary-tunnel.service
readonly TUNNEL_RESTART_ATTEMPTS=75
readonly TUNNEL_RESTART_INTERVAL_SECONDS=2
readonly TUNNEL_RECOVERY_ATTEMPTS=15
readonly EDGE_HEADER_ATTEMPTS=10
readonly EDGE_HEADER_RETRY_SECONDS=0.5
readonly ROLLBACK_SERVICE=blog-x-hardening-rollback.service
readonly ROLLBACK_TIMER=blog-x-hardening-rollback.timer

fail() { printf 'BLOG X HARDENING FAILED: %s\n' "$1" >&2; exit 1; }
note() { printf 'BLOG X HARDENING: %s\n' "$1"; }

is_test() { [[ -n $TEST_ROOT ]]; }
host_path() {
  local absolute=$1
  [[ $absolute == /* ]] || fail "internal non-absolute path rejected"
  if is_test; then printf '%s%s\n' "$TEST_ROOT" "$absolute"; else printf '%s\n' "$absolute"; fi
}

validate_mode() {
  if is_test; then
    [[ $TEST_MODE == 1 && $TEST_ALLOW == fixture-only && $TEST_ROOT != / && -d $TEST_ROOT ]] || fail "test mode requires an isolated fixture root"
    [[ ! -e /etc/blog-x/primary.env || $(host_path /etc/blog-x/primary.env) != /etc/blog-x/primary.env ]] || fail "test mode cannot target production paths"
  else
    [[ -z $TEST_MODE && -z $TEST_ALLOW ]] || fail "test flags require a fixture root"
    [[ ${EUID:-$(id -u)} -eq 0 ]] || fail "must run as root"
  fi
}

readonly CONFIG="$(host_path /etc/blog-x/primary.env)"
readonly STATE_DIR="$(host_path /var/lib/blog-x-hardening)"
readonly BACKUP_ROOT="$(host_path /var/backups/blog-x-hardening)"
readonly SSHD_CONFIG="$(host_path /etc/ssh/sshd_config)"
readonly SSHD_DROPIN="$(host_path /etc/ssh/sshd_config.d/99-blog-x-hardening.conf)"
readonly SSHD_BLOCK_BEGIN='# BEGIN BLOG X MANAGED SSH POLICY'
readonly SSHD_BLOCK_END='# END BLOG X MANAGED SSH POLICY'
readonly FIREWALL_CONFIG="$(host_path /etc/firewalld)"
readonly NGINX_CONFIG="$(host_path /etc/nginx/conf.d/blog-x.conf)"
readonly NGINX_SNIPPET="$(host_path /etc/nginx/snippets/blog-x-security-headers.conf)"
readonly SNIPPET_SOURCE="$SCRIPT_DIR/nginx/blog-x-security-headers.conf"

require_file() { [[ -f $1 ]] || fail "required file is missing"; }
set_root_permissions() {
  is_test && return 0
  chown root:root "$@"
}
set_mode() {
  local mode=$1
  shift
  chmod "$mode" "$@"
}

config_value() {
  local key=$1 value
  require_file "$CONFIG"
  value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$CONFIG")"
  [[ -n $value && $value != *$'\n'* && $value != *$'\r'* ]] || fail "missing or unsafe primary configuration value"
  printf '%s\n' "$value"
}

unit_state() {
  local unit=$1 enabled active
  if is_test; then
    printf 'disabled inactive\n'
    return 0
  fi
  enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
  active="$(systemctl is-active "$unit" 2>/dev/null || true)"
  printf '%s %s\n' "${enabled:-disabled}" "${active:-inactive}"
}

snapshot_firewall_state() {
  local backup=$1 state unit key enabled active
  state="$backup/runtime-state.env"
  : > "$state"
  for unit in firewalld.service rpcbind.service rpcbind.socket; do
    key=${unit//./_}
    read -r enabled active < <(unit_state "$unit")
    printf '%s_ENABLED=%s\n%s_ACTIVE=%s\n' "$key" "$enabled" "$key" "$active" >> "$state"
  done
  if [[ -d $FIREWALL_CONFIG ]]; then
    tar -C "$(dirname "$FIREWALL_CONFIG")" -czf "$backup/firewalld-config.tar.gz" "$(basename "$FIREWALL_CONFIG")"
  else
    : > "$backup/firewalld-config.absent"
  fi
  set_root_permissions "$state" "$backup/firewalld-config.tar.gz" "$backup/firewalld-config.absent" 2>/dev/null || true
  set_mode 0600 "$state"
}

state_value() {
  local state=$1 key=$2
  awk -F= -v key="$key" '$1 == key { print $2; exit }' "$state"
}

restore_unit_enabled_state() {
  local unit=$1 state=$2
  case "$state" in
    enabled|enabled-runtime|linked|linked-runtime|alias) systemctl enable "$unit" ;;
    disabled) systemctl disable "$unit" >/dev/null 2>&1 || true ;;
    masked) systemctl mask "$unit" ;;
    static|indirect|generated|transient|'') : ;;
    *) fail "unrecognized saved systemd enablement state" ;;
  esac
}

restore_unit_active_state() {
  local unit=$1 state=$2
  case "$state" in
    active) systemctl start "$unit" ;;
    inactive|failed|deactivating|activating|'') systemctl stop "$unit" >/dev/null 2>&1 || true ;;
    *) fail "unrecognized saved systemd activity state" ;;
  esac
}

restore_firewall_state() {
  local backup=$1 state
  state="$backup/runtime-state.env"
  [[ -f $state ]] || return 0
  if [[ -f $backup/firewalld-config.tar.gz ]]; then
    rm -rf -- "$FIREWALL_CONFIG"
    tar -C "$(dirname "$FIREWALL_CONFIG")" -xzf "$backup/firewalld-config.tar.gz"
  elif [[ -f $backup/firewalld-config.absent ]]; then
    rm -rf -- "$FIREWALL_CONFIG"
  fi
  is_test && return 0
  local firewall_enabled firewall_active rpcbind_enabled rpcbind_active socket_enabled socket_active
  firewall_enabled="$(state_value "$state" firewalld_service_ENABLED)"
  firewall_active="$(state_value "$state" firewalld_service_ACTIVE)"
  rpcbind_enabled="$(state_value "$state" rpcbind_service_ENABLED)"
  rpcbind_active="$(state_value "$state" rpcbind_service_ACTIVE)"
  socket_enabled="$(state_value "$state" rpcbind_socket_ENABLED)"
  socket_active="$(state_value "$state" rpcbind_socket_ACTIVE)"
  restore_unit_enabled_state firewalld.service "$firewall_enabled"
  restore_unit_active_state firewalld.service "$firewall_active"
  if [[ $firewall_active == active ]]; then firewall-cmd --reload; fi
  restore_unit_enabled_state rpcbind.socket "$socket_enabled"
  restore_unit_active_state rpcbind.socket "$socket_active"
  restore_unit_enabled_state rpcbind.service "$rpcbind_enabled"
  restore_unit_active_state rpcbind.service "$rpcbind_active"
}

create_backup() {
  local stamp backup
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  backup="$BACKUP_ROOT/$stamp"
  install -d -m 0700 "$backup"
  for pair in \
    "$CONFIG:primary.env" \
    "$SSHD_CONFIG:sshd_config" \
    "$SSHD_DROPIN:sshd-hardening.conf" \
    "$NGINX_CONFIG:blog-x.conf" \
    "$NGINX_SNIPPET:blog-x-security-headers.conf"; do
    local source=${pair%%:*} destination=${pair#*:}
    if [[ -f $source ]]; then
      cp -p -- "$source" "$backup/$destination"
    else
      : > "$backup/$destination.absent"
    fi
  done
  snapshot_firewall_state "$backup"
  printf '%s\n' "$backup" > "$STATE_DIR/.latest-backup"
  set_root_permissions "$backup" "$STATE_DIR/.latest-backup"
  set_mode 0700 "$backup"
  set_mode 0600 "$STATE_DIR/.latest-backup"
  printf '%s\n' "$backup"
}

restore_backup() {
  local backup=$1
  [[ $backup == "$BACKUP_ROOT"/* && -d $backup ]] || fail "backup path is outside the hardening backup root"
  if [[ -f $backup/primary.env ]]; then install -m 0600 "$backup/primary.env" "$CONFIG"; fi
  if [[ -f $backup/sshd_config ]]; then install -m 0600 "$backup/sshd_config" "$SSHD_CONFIG"; fi
  if [[ -f $backup/sshd-hardening.conf ]]; then
    install -d -m 0755 "$(dirname "$SSHD_DROPIN")"
    install -m 0600 "$backup/sshd-hardening.conf" "$SSHD_DROPIN"
  elif [[ -f $backup/sshd-hardening.conf.absent ]]; then
    rm -f -- "$SSHD_DROPIN"
  fi
  if [[ -f $backup/blog-x.conf ]]; then install -m 0640 "$backup/blog-x.conf" "$NGINX_CONFIG"; fi
  if [[ -f $backup/blog-x-security-headers.conf ]]; then
    install -d -m 0755 "$(dirname "$NGINX_SNIPPET")"
    install -m 0644 "$backup/blog-x-security-headers.conf" "$NGINX_SNIPPET"
  elif [[ -f $backup/blog-x-security-headers.conf.absent ]]; then
    rm -f -- "$NGINX_SNIPPET"
  fi
  restore_firewall_state "$backup"
}

arm_rollback() {
  local backup=$1 purpose=$2 service timer
  service="$(host_path "/etc/systemd/system/$ROLLBACK_SERVICE")"
  timer="$(host_path "/etc/systemd/system/$ROLLBACK_TIMER")"
  install -d -m 0755 "$(dirname "$service")"
  printf '[Unit]\nDescription=Blog X hardening rollback (%s)\n\n[Service]\nType=oneshot\nExecStart=%q rollback --backup %q\n' \
    "$purpose" "$SCRIPT_DIR/harden-host.sh" "$backup" > "$service"
  printf '[Unit]\nDescription=Blog X hardening rollback timer\n\n[Timer]\nOnActiveSec=8min\nUnit=%s\n\n[Install]\nWantedBy=timers.target\n' \
    "$ROLLBACK_SERVICE" > "$timer"
  set_root_permissions "$service" "$timer"
  set_mode 0600 "$service" "$timer"
  if ! is_test; then
    systemctl daemon-reload
    systemctl disable --now "$ROLLBACK_TIMER" >/dev/null 2>&1 || true
    systemctl reset-failed "$ROLLBACK_TIMER" "$ROLLBACK_SERVICE" >/dev/null 2>&1 || true
    systemctl enable "$ROLLBACK_TIMER"
    systemctl start "$ROLLBACK_TIMER"
    systemctl is-active --quiet "$ROLLBACK_TIMER" || fail "rollback timer did not start"
  fi
  printf '%s\n' "$backup" > "$STATE_DIR/.armed-backup"
  set_root_permissions "$STATE_DIR/.armed-backup"
  set_mode 0600 "$STATE_DIR/.armed-backup"
}

cancel_rollback() {
  rm -f -- "$STATE_DIR/.armed-backup"
  if ! is_test; then
    systemctl disable --now "$ROLLBACK_TIMER" >/dev/null 2>&1 || true
    systemctl daemon-reload
  fi
}

validate_public_key() {
  local key=$1
  [[ $key != *$'\n'* && $key != *$'\r'* ]] || fail "public key must be one line"
  [[ $key =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/]+={0,3}([[:space:]][^[:cntrl:]]*)?$ ]] || fail "only one ssh-ed25519 public key is accepted"
}

prepare_admin() {
  local key=${1:-}
  validate_public_key "$key"
  local home ssh_dir keys sudoers sudoers_tmp
  home="$(host_path "/home/$ADMIN_USER")"
  ssh_dir="$home/.ssh"
  keys="$ssh_dir/authorized_keys"
  sudoers="$(host_path "/etc/sudoers.d/$ADMIN_USER")"
  if is_test; then
    install -d -m 0700 "$ssh_dir" "$(host_path /var/lib/blog-x-hardening/test-users)"
    : > "$(host_path "/var/lib/blog-x-hardening/test-users/$ADMIN_USER")"
  elif ! id "$ADMIN_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash --groups wheel "$ADMIN_USER"
  fi
  install -d -m 0700 "$ssh_dir"
  install -d -m 0750 "$(dirname "$sudoers")"
  touch "$keys"
  grep -qxF -- "$key" "$keys" || printf '%s\n' "$key" >> "$keys"
  sudoers_tmp="$(mktemp "$(dirname "$sudoers")/.${ADMIN_USER}.XXXXXX")"
  printf '%s ALL=(ALL) NOPASSWD: ALL\n' "$ADMIN_USER" > "$sudoers_tmp"
  if ! is_test; then chown "$ADMIN_USER:$ADMIN_USER" "$ssh_dir" "$keys"; fi
  set_root_permissions "$(dirname "$sudoers")" "$sudoers_tmp"
  set_mode 0700 "$ssh_dir"
  set_mode 0600 "$keys"
  set_mode 0750 "$(dirname "$sudoers")"
  set_mode 0440 "$sudoers_tmp"
  mv -f -- "$sudoers_tmp" "$sudoers"
  if ! is_test; then visudo -cf "$sudoers" >/dev/null || fail "sudoers validation failed"; fi
  note "dedicated administrator key prepared; verify a fresh key-only session before SSH hardening"
}

rewrite_tunnel_user() {
  local user=$1 tmp
  [[ $user =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || fail "invalid tunnel account name"
  tmp="$(mktemp "$(dirname "$CONFIG")/.primary.env.XXXXXX")"
  set_mode 0600 "$tmp"
  if ! awk -v user="$user" '
      /^SECONDARY_SSH_USER=/ { print "SECONDARY_SSH_USER=" user; found=1; next }
      { print }
      END { exit found ? 0 : 42 }
    ' "$CONFIG" > "$tmp"; then
    rm -f -- "$tmp"
    fail "tunnel account key is missing from primary configuration"
  fi
  set_root_permissions "$tmp"
  mv -f -- "$tmp" "$CONFIG"
  set_mode 0600 "$CONFIG"
}

loopback_api_healthy() {
  curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3001/health >/dev/null
}

tunnel_active_timestamp() {
  local property
  property="$(systemctl show -p ActiveEnterTimestampMonotonic "$TUNNEL_SERVICE" 2>/dev/null || true)"
  case "$property" in
    ActiveEnterTimestampMonotonic=[0-9]*) printf '%s\n' "${property#ActiveEnterTimestampMonotonic=}" ;;
    *) return 1 ;;
  esac
}

restart_tunnel_bounded() {
  if is_test; then [[ ${BLOG_X_HARDEN_TEST_TUNNEL_RESTART:-success} == success ]]; return; fi
  local attempts=${1:-$TUNNEL_RESTART_ATTEMPTS} before current attempt
  [[ $attempts =~ ^[1-9][0-9]*$ ]] || return 1
  before="$(tunnel_active_timestamp || true)"
  systemctl restart --no-block "$TUNNEL_SERVICE" || return 1
  for attempt in $(seq 1 "$attempts"); do
    current="$(tunnel_active_timestamp || true)"
    if [[ -n $current && $current != "$before" ]] && systemctl is-active --quiet "$TUNNEL_SERVICE" && loopback_api_healthy; then
      return 0
    fi
    sleep "$TUNNEL_RESTART_INTERVAL_SECONDS"
  done
  return 1
}

tunnel_uses_current_config() {
  is_test && return 0
  local user host identity
  user="$(config_value SECONDARY_SSH_USER)"
  host="$(config_value SECONDARY_SSH_HOST)"
  [[ $user =~ ^[a-z_][a-z0-9_-]{0,31}$ && $host =~ ^[A-Za-z0-9._:-]+$ ]] || return 1
  identity="$user@$host"
  systemctl is-active --quiet "$TUNNEL_SERVICE" && loopback_api_healthy && ps -eo args= | grep -F -- "$identity" | grep -F -- '127.0.0.1:3001:127.0.0.1:3001' >/dev/null
}

restore_tunnel_after_switch() {
  if tunnel_uses_current_config; then return 0; fi
  restart_tunnel_bounded "$TUNNEL_RECOVERY_ATTEMPTS"
}

switch_tunnel_user() {
  local account=$1 backup
  backup="$(create_backup)"
  arm_rollback "$backup" tunnel
  if ! rewrite_tunnel_user "$account"; then
    cancel_rollback
    fail "tunnel account was not changed"
  fi
  if ! restart_tunnel_bounded; then
    restore_backup "$backup"
    restore_tunnel_after_switch || true
    cancel_rollback
    fail "new tunnel account did not provide a healthy loopback API; prior state restored"
  fi
  note "tunnel account switched; retain rollback until SSH and firewall confirmation"
}

acknowledge_fresh_session() {
  [[ ${SUDO_USER:-} == "$ADMIN_USER" ]] || fail "fresh-session acknowledgement must be issued through $ADMIN_USER"
  install -d -m 0700 "$STATE_DIR"
  printf '%s\n' "$(date -u +%FT%TZ)" > "$STATE_DIR/fresh-key-session"
  set_root_permissions "$STATE_DIR" "$STATE_DIR/fresh-key-session"
  set_mode 0600 "$STATE_DIR/fresh-key-session"
}

require_fresh_session() { [[ -s $STATE_DIR/fresh-key-session ]] || fail "fresh key-only session acknowledgement is required"; }

write_sshd_policy() {
  require_file "$SSHD_CONFIG"
  local tmp
  tmp="$(mktemp "$(dirname "$SSHD_CONFIG")/.sshd_config.XXXXXX")"
  if ! awk -v blogx_begin="$SSHD_BLOCK_BEGIN" -v blogx_end="$SSHD_BLOCK_END" '
    BEGIN {
      print blogx_begin
      print "PubkeyAuthentication yes"
      print "PermitRootLogin no"
      print "PasswordAuthentication no"
      print "KbdInteractiveAuthentication no"
      print "ChallengeResponseAuthentication no"
      print blogx_end
      print ""
    }
    $0 == blogx_begin { in_block=1; blocks++; next }
    in_block && $0 == blogx_end { in_block=0; next }
    in_block { next }
    { print }
    END { if (in_block || blocks > 1) exit 42 }
  ' "$SSHD_CONFIG" > "$tmp"; then
    rm -f -- "$tmp"
    return 1
  fi
  if ! is_test && ! sshd -t -f "$tmp"; then
    rm -f -- "$tmp"
    return 1
  fi
  set_root_permissions "$tmp"
  set_mode 0600 "$tmp"
  mv -f -- "$tmp" "$SSHD_CONFIG"
}

effective_sshd_policy_valid() {
  local effective expected
  effective="$(sshd -T -f "$SSHD_CONFIG")" || return 1
  for expected in 'permitrootlogin no' 'passwordauthentication no' 'pubkeyauthentication yes'; do
    grep -qxF "$expected" <<<"$effective" || return 1
  done
  grep -qxF 'kbdinteractiveauthentication no' <<<"$effective" || grep -qxF 'challengeresponseauthentication no' <<<"$effective"
}

harden_ssh() {
  [[ ${1:-} == --fresh-key-session ]] || fail "pass --fresh-key-session only from a verified new administrator session"
  acknowledge_fresh_session
  require_fresh_session
  local backup
  backup="$(create_backup)"
  arm_rollback "$backup" ssh
  if ! write_sshd_policy; then
    restore_backup "$backup"
    cancel_rollback
    fail "candidate SSH policy could not be written; prior state restored"
  fi
  if is_test; then return 0; fi
  if ! sshd -t -f "$SSHD_CONFIG" || ! systemctl reload sshd || ! effective_sshd_policy_valid; then
    restore_backup "$backup"
    sshd -t -f "$SSHD_CONFIG" && systemctl reload sshd || true
    cancel_rollback
    fail "candidate SSH policy failed validation; prior state restored"
  fi
  note "SSH policy reloaded; use confirm-ssh from a second fresh key-only session before rollback expiry"
}

confirm_ssh() {
  [[ ${1:-} == --fresh-key-session ]] || fail "pass --fresh-key-session from a second verified administrator session"
  acknowledge_fresh_session
  require_fresh_session
  if ! is_test && ! effective_sshd_policy_valid; then
    fail "effective SSH key-only policy is no longer valid; rollback remains armed"
  fi
  cancel_rollback
  note "SSH rollback cancelled after second key-only session acknowledgement"
}

rpc_consumers_present() {
  findmnt -rn -t nfs,nfs4 2>/dev/null | grep -q . && return 0
  exportfs -v 2>/dev/null | grep -q . && return 0
  for service in nfs-server rpc-statd rpc-idmapd; do systemctl is-active --quiet "$service" 2>/dev/null && return 0; done
  return 1
}

stop_rpcbind_if_safe() {
  if rpc_consumers_present; then
    printf '%s\n' 'NFS/RPC consumer detected; refusing to stop rpcbind' >&2
    return 1
  fi
  is_test || systemctl disable --now rpcbind.service rpcbind.socket
}

unexpected_public_listeners() {
  if is_test && [[ -n ${BLOG_X_HARDEN_TEST_LISTENERS:-} ]]; then
    printf '%s\n' "$BLOG_X_HARDEN_TEST_LISTENERS"
  else
    ss -lntH
  fi | awk '
    {
      address=$4
      if (address ~ /^\[/) {
        host=address; sub(/^\[/, "", host); sub(/\]:[^]]*$/, "", host)
        port=address; sub(/^.*\]:/, "", port)
      } else {
        port=address; sub(/^.*:/, "", port)
        host=address; sub(/:[^:]*$/, "", host)
      }
      loopback=(host=="127.0.0.1" || host=="::1")
      wildcard=(host=="0.0.0.0" || host=="*" || host=="::")
      nonloopback=(host ~ /^[0-9.]+$/ || host ~ /^[0-9a-fA-F:]+$/)
      public=(!loopback && (wildcard || nonloopback))
      if (public && port != 22 && port != 80 && port != 443) { print port; bad=1 }
    }
    END { exit bad ? 0 : 1 }
  '
}

write_firewall_allowlist() {
  local zones zone
  zones="$FIREWALL_CONFIG/zones"
  zone="$zones/public.xml"
  install -d -m 0755 "$zones"
  cat > "$zone" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<zone target="default">
  <short>public</short>
  <description>Blog X public ingress: SSH, HTTP, and HTTPS only.</description>
  <port port="22" protocol="tcp"/>
  <port port="80" protocol="tcp"/>
  <port port="443" protocol="tcp"/>
</zone>
EOF
  set_root_permissions "$zone"
  set_mode 0600 "$zone"
  command -v firewall-offline-cmd >/dev/null || fail "firewall-offline-cmd is required for allow-before-enable"
  for port in 22 80 443; do firewall-offline-cmd --zone=public --add-port="$port/tcp"; done
}

firewall_is_exact() {
  local ports services rich port count=0
  ports="$(firewall-cmd --zone=public --list-ports)"
  services="$(firewall-cmd --zone=public --list-services)"
  rich="$(firewall-cmd --zone=public --list-rich-rules)"
  [[ -z $services && -z $rich ]] || return 1
  for port in $ports; do
    case "$port" in 22/tcp|80/tcp|443/tcp) ((count += 1)) ;; *) return 1 ;; esac
  done
  [[ $count -eq 3 && " $ports " == *' 22/tcp '* && " $ports " == *' 80/tcp '* && " $ports " == *' 443/tcp '* ]]
}

apply_firewall() {
  local backup
  backup="$(create_backup)"
  arm_rollback "$backup" firewall
  if ! stop_rpcbind_if_safe; then
    restore_backup "$backup"
    cancel_rollback
    fail "rpcbind was not changed because its prior state could not be safely preserved"
  fi
  if is_test; then return 0; fi
  if unexpected_public_listeners; then
    restore_backup "$backup"
    cancel_rollback
    fail "unexpected public TCP listener detected; prior rpcbind state restored"
  fi
  if ! write_firewall_allowlist || ! systemctl enable --now firewalld || ! firewall-cmd --reload || ! firewall-cmd --zone=public --query-port=22/tcp || ! firewall-cmd --zone=public --query-port=80/tcp || ! firewall-cmd --zone=public --query-port=443/tcp || ! firewall_is_exact; then
    restore_backup "$backup"
    cancel_rollback
    fail "required exact firewall allowances are not active; prior firewall and rpcbind state restored"
  fi
  note "firewall applied; confirm-firewall from a fresh external administrator session before rollback expiry"
}

confirm_firewall() {
  [[ ${1:-} == --fresh-key-session ]] || fail "pass --fresh-key-session from a verified external administrator session"
  acknowledge_fresh_session
  require_fresh_session
  cancel_rollback
  note "firewall rollback cancelled after external confirmation"
}

ensure_nginx_include() {
  local include_line='    include /etc/nginx/snippets/blog-x-security-headers.conf;'
  grep -qxF "$include_line" "$NGINX_CONFIG" && return 0
  local tmp
  tmp="$(mktemp "$(dirname "$NGINX_CONFIG")/.blog-x.conf.XXXXXX")"
  awk -v include_line="$include_line" '
    { print }
    /^[[:space:]]*server_tokens[[:space:]]+off;/ { print include_line; added=1 }
    END { if (!added) exit 42 }
  ' "$NGINX_CONFIG" > "$tmp" || { rm -f -- "$tmp"; fail "known Blog X TLS include point was not found"; }
  set_root_permissions "$tmp"
  set_mode 0640 "$tmp"
  mv -f -- "$tmp" "$NGINX_CONFIG"
}

header_present() { grep -qiF "$1" "$2"; }
edge_headers_match() {
  local headers=$1 api_headers=$2 expected
  for expected in \
    'Content-Security-Policy: default-src' \
    'Strict-Transport-Security: max-age=31536000; includeSubDomains' \
    'X-Content-Type-Options: nosniff' \
    'Referrer-Policy: strict-origin-when-cross-origin' \
    'Cross-Origin-Opener-Policy: same-origin' \
    'X-Frame-Options: DENY' \
    'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()'; do
    header_present "$expected" "$headers" && header_present "$expected" "$api_headers" || return 1
  done
  ! grep -qi '^X-Powered-By:' "$headers" && ! grep -qi '^X-Powered-By:' "$api_headers"
}

verify_edge_headers() {
  local origin headers api_headers attempt
  origin="$(config_value PUBLIC_ORIGIN)"
  [[ $origin =~ ^https://[A-Za-z0-9.-]+$ ]] || fail "PUBLIC_ORIGIN is not a canonical HTTPS origin"
  grep -qF 'proxy_hide_header X-Powered-By;' "$NGINX_SNIPPET" || fail "edge header snippet is incomplete"
  headers="$(mktemp)"
  api_headers="$(mktemp)"
  for attempt in $(seq 1 "$EDGE_HEADER_ATTEMPTS"); do
    : > "$headers"
    : > "$api_headers"
    if curl --fail --silent --show-error --max-time 10 --connect-timeout 5 -D "$headers" -o /dev/null "$origin/" && \
      curl --fail --silent --show-error --max-time 10 --connect-timeout 5 -D "$api_headers" -o /dev/null "$origin/api/health" && \
      edge_headers_match "$headers" "$api_headers"; then
      rm -f -- "$headers" "$api_headers"
      return 0
    fi
    if [[ $attempt -lt $EDGE_HEADER_ATTEMPTS ]]; then sleep "$EDGE_HEADER_RETRY_SECONDS"; fi
  done
  rm -f -- "$headers" "$api_headers"
  return 1
}

apply_edge() {
  require_file "$SNIPPET_SOURCE"
  require_file "$NGINX_CONFIG"
  if [[ -f $NGINX_SNIPPET ]] && cmp -s "$SNIPPET_SOURCE" "$NGINX_SNIPPET" && grep -qxF '    include /etc/nginx/snippets/blog-x-security-headers.conf;' "$NGINX_CONFIG"; then
    if ! is_test; then verify_edge_headers || fail "existing edge headers did not pass verification"; fi
    note "edge headers already installed; no Nginx mutation performed"
    return 0
  fi
  local backup
  backup="$(create_backup)"
  if ! install -d -m 0755 "$(dirname "$NGINX_SNIPPET")" || ! install -m 0644 "$SNIPPET_SOURCE" "$NGINX_SNIPPET" || ! ensure_nginx_include; then
    restore_backup "$backup"
    cancel_rollback
    fail "edge configuration could not be written; last-known-good configuration restored"
  fi
  if is_test; then return 0; fi
  if ! nginx -t || ! systemctl reload nginx || ! verify_edge_headers; then
    restore_backup "$backup"
    nginx -t && systemctl reload nginx || true
    cancel_rollback
    fail "edge header validation failed; last-known-good Nginx configuration restored"
  fi
  note "edge headers applied and verified without an application release"
}

rollback_edge() {
  [[ ${1:-} == --backup && -n ${2:-} ]] || fail "usage: rollback-edge --backup <hardening-backup>"
  restore_backup "$2"
  if ! is_test; then nginx -t && systemctl reload nginx; fi
  note "edge configuration restored from hardening backup"
}

verify() {
  local tunnel=unknown ssh=unknown firewall=unknown edge=unknown
  if ! is_test && systemctl is-active --quiet "$TUNNEL_SERVICE"; then tunnel=yes; else tunnel=no; fi
  if is_test && grep -qxF "$SSHD_BLOCK_BEGIN" "$SSHD_CONFIG" && grep -qxF "$SSHD_BLOCK_END" "$SSHD_CONFIG"; then ssh=yes; elif ! is_test && effective_sshd_policy_valid; then ssh=yes; else ssh=no; fi
  if ! is_test && firewall-cmd --zone=public --query-port=22/tcp >/dev/null 2>&1 && firewall-cmd --zone=public --query-port=80/tcp >/dev/null 2>&1 && firewall-cmd --zone=public --query-port=443/tcp >/dev/null 2>&1; then firewall=yes; else firewall=no; fi
  if [[ -f $NGINX_SNIPPET ]] && grep -qF 'proxy_hide_header X-Powered-By;' "$NGINX_SNIPPET"; then edge=yes; else edge=no; fi
  printf 'tunnel_active=%s\nssh_key_only=%s\nfirewall_22_80_443=%s\nedge_headers=%s\n' "$tunnel" "$ssh" "$firewall" "$edge"
}

rollback() {
  [[ ${1:-} == --backup && -n ${2:-} ]] || fail "usage: rollback --backup <hardening-backup>"
  restore_backup "$2"
  if ! is_test; then
    sshd -t -f "$SSHD_CONFIG" && systemctl reload sshd || true
    nginx -t && systemctl reload nginx || true
    restart_tunnel_bounded || true
  fi
  cancel_rollback
  note "hardening rollback restored the specified backup"
}

usage() {
  printf '%s\n' 'usage: harden-host.sh {prepare-admin|switch-tunnel-user|harden-ssh|confirm-ssh|apply-firewall|confirm-firewall|apply-edge|rollback-edge|verify|rollback} ...' >&2
  exit 64
}

main() {
  validate_mode
  install -d -m 0700 "$STATE_DIR" "$BACKUP_ROOT"
  set_root_permissions "$STATE_DIR" "$BACKUP_ROOT"
  local stage=${1:-}
  shift || true
  case "$stage" in
    prepare-admin) [[ ${1:-} == --public-key && -n ${2:-} && $# -eq 2 ]] || usage; prepare_admin "$2" ;;
    switch-tunnel-user) [[ $# -eq 1 ]] || usage; switch_tunnel_user "$1" ;;
    harden-ssh) harden_ssh "$@" ;;
    confirm-ssh) confirm_ssh "$@" ;;
    apply-firewall) [[ $# -eq 0 ]] || usage; apply_firewall ;;
    confirm-firewall) confirm_firewall "$@" ;;
    apply-edge) [[ $# -eq 0 ]] || usage; apply_edge ;;
    rollback-edge) rollback_edge "$@" ;;
    test-listeners) is_test || usage; unexpected_public_listeners ;;
    verify) [[ $# -eq 0 ]] || usage; verify ;;
    rollback) rollback "$@" ;;
    *) usage ;;
  esac
}

main "$@"
