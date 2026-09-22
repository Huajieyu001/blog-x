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

create_backup() {
  local stamp backup
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  backup="$BACKUP_ROOT/$stamp"
  install -d -m 0700 "$backup"
  for pair in \
    "$CONFIG:primary.env" \
    "$SSHD_CONFIG:sshd_config" \
    "$SSHD_DROPIN:sshd-hardening.conf"; do
    local source=${pair%%:*} destination=${pair#*:}
    [[ -f $source ]] && cp -p -- "$source" "$backup/$destination"
  done
  printf '%s\n' "$backup" > "$STATE_DIR/.latest-backup"
  set_root_permissions "$backup" "$STATE_DIR/.latest-backup"
  set_mode 0700 "$backup"
  set_mode 0600 "$STATE_DIR/.latest-backup"
  printf '%s\n' "$backup"
}

restore_backup() {
  local backup=$1
  [[ $backup == "$BACKUP_ROOT"/* && -d $backup ]] || fail "backup path is outside the hardening backup root"
  [[ -f $backup/primary.env ]] && install -m 0600 "$backup/primary.env" "$CONFIG"
  [[ -f $backup/sshd_config ]] && install -m 0600 "$backup/sshd_config" "$SSHD_CONFIG"
  [[ -f $backup/sshd-hardening.conf ]] && install -d -m 0755 "$(dirname "$SSHD_DROPIN")" && install -m 0600 "$backup/sshd-hardening.conf" "$SSHD_DROPIN"
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
    systemctl enable --now "$ROLLBACK_TIMER"
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
  local home ssh_dir keys sudoers
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
  install -d -m 0700 "$ssh_dir" "$(dirname "$sudoers")"
  touch "$keys"
  grep -qxF -- "$key" "$keys" || printf '%s\n' "$key" >> "$keys"
  printf '%s ALL=(ALL) NOPASSWD: ALL\n' "$ADMIN_USER" > "$sudoers"
  set_root_permissions "$ssh_dir" "$keys" "$sudoers"
  set_mode 0700 "$ssh_dir"
  set_mode 0600 "$keys" "$sudoers"
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

switch_tunnel_user() {
  local account=$1 backup
  backup="$(create_backup)"
  arm_rollback "$backup" tunnel
  rewrite_tunnel_user "$account"
  if is_test; then
    note "fixture tunnel account rewritten"
    return 0
  fi
  if ! systemctl restart "$TUNNEL_SERVICE" || ! systemctl is-active --quiet "$TUNNEL_SERVICE" || ! loopback_api_healthy; then
    restore_backup "$backup"
    systemctl restart "$TUNNEL_SERVICE" || true
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
  install -d -m 0755 "$(dirname "$SSHD_DROPIN")"
  cat > "$SSHD_DROPIN" <<'EOF'
# Managed by Blog X hardening; do not edit while rollback is armed.
PubkeyAuthentication yes
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
  set_root_permissions "$SSHD_DROPIN"
  set_mode 0600 "$SSHD_DROPIN"
  if ! grep -Eq '^[[:space:]]*Include[[:space:]].*sshd_config\.d/\*\.conf' "$SSHD_CONFIG"; then
    printf '\nInclude /etc/ssh/sshd_config.d/*.conf\n' >> "$SSHD_CONFIG"
  fi
}

harden_ssh() {
  [[ ${1:-} == --fresh-key-session ]] || fail "pass --fresh-key-session only from a verified new administrator session"
  acknowledge_fresh_session
  require_fresh_session
  local backup
  backup="$(create_backup)"
  arm_rollback "$backup" ssh
  write_sshd_policy
  if is_test; then return 0; fi
  if ! sshd -t -f "$SSHD_CONFIG" || ! systemctl reload sshd || ! sshd -T -f "$SSHD_CONFIG" | grep -qx 'permitrootlogin no' || ! sshd -T -f "$SSHD_CONFIG" | grep -qx 'passwordauthentication no' || ! sshd -T -f "$SSHD_CONFIG" | grep -qx 'pubkeyauthentication yes'; then
    restore_backup "$backup"
    sshd -t -f "$SSHD_CONFIG" && systemctl reload sshd || true
    fail "candidate SSH policy failed validation; prior state restored"
  fi
  note "SSH policy reloaded; use confirm-ssh from a second fresh key-only session before rollback expiry"
}

confirm_ssh() {
  [[ ${1:-} == --fresh-key-session ]] || fail "pass --fresh-key-session from a second verified administrator session"
  acknowledge_fresh_session
  require_fresh_session
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
    fail "NFS/RPC consumer detected; refusing to stop rpcbind"
  fi
  is_test || systemctl disable --now rpcbind.service rpcbind.socket
}

unexpected_public_listeners() {
  ss -lntH | awk '
    {
      address=$4; sub(/^\[/, "", address); sub(/\]$/, "", address)
      port=address; sub(/^.*:/, "", port)
      host=address; sub(/:[^:]*$/, "", host)
      public=(host=="0.0.0.0" || host=="*" || host=="::" || host ~ /^[0-9a-fA-F:]+$/ || host ~ /^[0-9.]+$/)
      if (public && port != 22 && port != 80 && port != 443) { print port; bad=1 }
    }
    END { exit bad ? 0 : 1 }
  '
}

apply_firewall() {
  local backup
  backup="$(create_backup)"
  arm_rollback "$backup" firewall
  stop_rpcbind_if_safe
  if is_test; then return 0; fi
  if unexpected_public_listeners; then fail "unexpected public TCP listener detected; firewall was not enabled"; fi
  command -v firewall-offline-cmd >/dev/null || fail "firewall-offline-cmd is required for allow-before-enable"
  for port in 22 80 443; do firewall-offline-cmd --zone=public --add-port="$port/tcp"; done
  systemctl enable --now firewalld
  for service in $(firewall-cmd --permanent --zone=public --list-services); do firewall-cmd --permanent --zone=public --remove-service="$service"; done
  for port in $(firewall-cmd --permanent --zone=public --list-ports); do firewall-cmd --permanent --zone=public --remove-port="$port"; done
  for port in 22 80 443; do firewall-cmd --permanent --zone=public --add-port="$port/tcp"; done
  firewall-cmd --reload
  firewall-cmd --zone=public --query-port=22/tcp && firewall-cmd --zone=public --query-port=80/tcp && firewall-cmd --zone=public --query-port=443/tcp || {
    restore_backup "$backup"; fail "required firewall allowances are not active";
  }
  note "firewall applied; confirm-firewall from a fresh external administrator session before rollback expiry"
}

confirm_firewall() {
  [[ ${1:-} == --fresh-key-session ]] || fail "pass --fresh-key-session from a verified external administrator session"
  acknowledge_fresh_session
  require_fresh_session
  cancel_rollback
  note "firewall rollback cancelled after external confirmation"
}

verify() {
  local tunnel=unknown ssh=unknown firewall=unknown
  if ! is_test && systemctl is-active --quiet "$TUNNEL_SERVICE"; then tunnel=yes; else tunnel=no; fi
  if [[ -f $SSHD_DROPIN ]] && grep -qx 'PermitRootLogin no' "$SSHD_DROPIN" && grep -qx 'PasswordAuthentication no' "$SSHD_DROPIN"; then ssh=yes; else ssh=no; fi
  if ! is_test && firewall-cmd --zone=public --query-port=22/tcp >/dev/null 2>&1 && firewall-cmd --zone=public --query-port=80/tcp >/dev/null 2>&1 && firewall-cmd --zone=public --query-port=443/tcp >/dev/null 2>&1; then firewall=yes; else firewall=no; fi
  printf 'tunnel_active=%s\nssh_key_only=%s\nfirewall_22_80_443=%s\n' "$tunnel" "$ssh" "$firewall"
}

rollback() {
  [[ ${1:-} == --backup && -n ${2:-} ]] || fail "usage: rollback --backup <hardening-backup>"
  restore_backup "$2"
  if ! is_test; then
    sshd -t -f "$SSHD_CONFIG" && systemctl reload sshd || true
    systemctl restart "$TUNNEL_SERVICE" || true
  fi
  cancel_rollback
  note "hardening rollback restored the specified backup"
}

usage() {
  printf '%s\n' 'usage: harden-host.sh {prepare-admin|switch-tunnel-user|harden-ssh|confirm-ssh|apply-firewall|confirm-firewall|verify|rollback} ...' >&2
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
    verify) [[ $# -eq 0 ]] || usage; verify ;;
    rollback) rollback "$@" ;;
    *) usage ;;
  esac
}

main "$@"
