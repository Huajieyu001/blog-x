#!/usr/bin/env bash
set -euo pipefail
umask 077

# This tool is deliberately staged. Do not run a later stage until the
# operator handoff has recorded the preceding fresh-session confirmation.
readonly ADMIN_USER=ubuntu
readonly TUNNEL_USER=blog-x-tunnel
readonly TUNNEL_DESTINATION=127.0.0.1:3001
readonly ACK_PRIMARY_TUNNEL_HEALTH=primary-tunnel-switched-restarted-and-healthy
readonly ACK_FRESH_KEY_SESSION=fresh-key-only-ubuntu-session-verified
readonly APP_ROOT=/opt/blog-x
readonly BACKUP_ROOT=/var/backups/blog-x-hardening
# Ubuntu includes sshd_config.d lexicographically and sshd keeps the first value
# it encounters for these options. This must precede cloud-init's 50-* policy.
readonly SSH_POLICY=/etc/ssh/sshd_config.d/00-blog-x-hardening.conf

test_root=${BLOG_X_HARDEN_TEST_ROOT:-}
if [[ -n $test_root ]]; then
  [[ ${BLOG_X_HARDEN_TEST:-} == 1 && $test_root == /* && $test_root != / ]] || { printf '%s\n' 'unsafe test root' >&2; exit 1; }
  readonly ROOT="$test_root"
  readonly ADMIN_HOME="$ROOT/home/$ADMIN_USER"
  readonly TUNNEL_HOME="$ROOT/home/$TUNNEL_USER"
else
  [[ ${EUID:-$(id -u)} -eq 0 ]] || { printf '%s\n' 'hardening must run as root' >&2; exit 1; }
  readonly ROOT=''
  readonly ADMIN_HOME="/home/$ADMIN_USER"
  readonly TUNNEL_HOME="/home/$TUNNEL_USER"
fi

fail() { printf '%s\n' "$1" >&2; exit 1; }
usage() { printf '%s\n' 'usage: harden-host.sh <prepare-admin|provision-tunnel-user|finalize-tunnel-migration|harden-ssh|confirm-ssh|apply-firewall|confirm-firewall|verify|rollback> [strict options]' >&2; exit 2; }

require_exact() {
  [[ $# -eq 2 && $1 == "$2" ]] || fail 'required acknowledgement is missing or invalid'
}

key_file() {
  local value=${1#--*=}
  [[ $1 == --*=* && $value == /* && -f $value && ! -L $value ]] || fail 'public key file is invalid'
  [[ $(wc -l < "$value") -eq 1 && $(wc -c < "$value") -le 8192 ]] || fail 'public key file must contain one short line'
  LC_ALL=C grep -Eq '^(ssh-ed25519|sk-ssh-ed25519@openssh\.com|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+( [^[:cntrl:]]+)?$' "$value" || fail 'public key format is invalid'
  printf '%s\n' "$value"
}

key_type() { awk '{ print $1 }' "$1"; }
key_blob() { awk '{ print $2 }' "$1"; }
key_fingerprint() { ssh-keygen -lf "$1" -E sha256 | awk 'NF >= 2 { print $2 }' | head -n 1; }

authorized_keys_for() { printf '%s/.ssh/authorized_keys\n' "$1"; }

secure_authorized_keys() {
  local account=$1 home=$2 target=$3
  # Atomic replacement runs as root; reset both modes and ownership after every
  # account mutation so sshd continues to accept the account's public keys.
  chmod 0700 "$home/.ssh"
  chmod 0600 "$target"
  if [[ -z $test_root ]]; then chown "$account:$account" "$home/.ssh" "$target"; fi
}

authorized_key_match_count() {
  local target=$1 wanted_type=$2 wanted_blob=$3
  awk -v wanted_type="$wanted_type" -v wanted_blob="$wanted_blob" '
    function key_type(value) {
      return value == "ssh-ed25519" || value == "sk-ssh-ed25519@openssh.com" || value == "ecdsa-sha2-nistp256" || value == "ssh-rsa"
    }
    # OpenSSH key options occupy the single first token, before the key type.
    # Match only the first key-type/blob pair so comment text cannot masquerade
    # as another authorization later on the line.
    function matches() {
      if (key_type($1)) return $1 == wanted_type && $2 == wanted_blob
      return $1 !~ /^#/ && key_type($2) && $2 == wanted_type && $3 == wanted_blob
    }
    matches() { count++ }
    END { print count + 0 }
  ' "$target"
}

without_authorized_key() {
  local target=$1 wanted_type=$2 wanted_blob=$3
  awk -v wanted_type="$wanted_type" -v wanted_blob="$wanted_blob" '
    function key_type(value) {
      return value == "ssh-ed25519" || value == "sk-ssh-ed25519@openssh.com" || value == "ecdsa-sha2-nistp256" || value == "ssh-rsa"
    }
    function matches() {
      if (key_type($1)) return $1 == wanted_type && $2 == wanted_blob
      return $1 !~ /^#/ && key_type($2) && $2 == wanted_type && $3 == wanted_blob
    }
    !matches() { print }
  ' "$target"
}

atomic_add_key() {
  local target=$1 source=$2 type blob temp matches
  type=$(key_type "$source")
  blob=$(key_blob "$source")
  [[ -n $type && -n $blob ]] || fail 'public key is invalid'
  install -d -m 0700 "$(dirname "$target")"
  [[ -e $target && ! -f $target || -L $target ]] && fail 'authorized keys target is unsafe'
  touch "$target"
  chmod 0600 "$target"
  matches=$(authorized_key_match_count "$target" "$type" "$blob")
  [[ $matches =~ ^[0-9]+$ ]] || fail 'authorized key parser returned an invalid match count'
  [[ $matches == 0 ]] || { [[ $matches == 1 ]] && return; fail 'authorized key is duplicated'; }
  temp="${target}.tmp.$$"
  { cat "$target"; cat "$source"; } > "$temp"
  chmod 0600 "$temp"
  mv -f -- "$temp" "$target"
}

atomic_remove_key() {
  local target=$1 source=$2 type blob temp matches
  type=$(key_type "$source")
  blob=$(key_blob "$source")
  [[ -n $type && -n $blob ]] || fail 'public key is invalid'
  matches=$(authorized_key_match_count "$target" "$type" "$blob")
  [[ $matches == 1 ]] || fail 'old tunnel authorization must match exactly once'
  temp="${target}.tmp.$$"
  without_authorized_key "$target" "$type" "$blob" > "$temp"
  chmod 0600 "$temp"
  mv -f -- "$temp" "$target"
}

prepare_admin() {
  [[ $# -eq 1 && $1 == --management-key-file=* ]] || usage
  local source target
  source=$(key_file "$1")
  target=$(authorized_keys_for "$ADMIN_HOME")
  [[ -d $ADMIN_HOME ]] || fail 'Ubuntu administrator home is unavailable'
  atomic_add_key "$target" "$source"
  secure_authorized_keys "$ADMIN_USER" "$ADMIN_HOME" "$target"
}

provision_tunnel_user() {
  [[ $# -eq 1 && $1 == --tunnel-key-file=* ]] || usage
  local source target line password_hash
  source=$(key_file "$1")
  if [[ -z $test_root ]]; then
    if ! id -u "$TUNNEL_USER" >/dev/null 2>&1; then useradd --create-home --user-group --shell /usr/sbin/nologin "$TUNNEL_USER"; fi
    # A leading ! password lock can reject public-key authentication before
    # authorized_keys is evaluated. Store only a fresh, unknown SHA-512 hash.
    password_hash=$(openssl rand -base64 48 | openssl passwd -6 -stdin)
    [[ $password_hash == '$6$'* ]] || fail 'unable to create an unusable tunnel password hash'
    usermod --shell /usr/sbin/nologin --password "$password_hash" "$TUNNEL_USER"
    unset password_hash
    id -nG "$TUNNEL_USER" | tr ' ' '\n' | grep -Eq '^(sudo|adm|docker)$' && fail 'tunnel account has an administrative group'
  else
    install -d -m 0700 "$TUNNEL_HOME"
  fi
  install -d -m 0700 "$TUNNEL_HOME/.ssh"
  target=$(authorized_keys_for "$TUNNEL_HOME")
  line="no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen=\"$TUNNEL_DESTINATION\" $(cat "$source")"
  [[ $line != *$'\n'* ]] || fail 'tunnel authorization is invalid'
  printf '%s\n' "$line" > "${target}.tmp.$$"
  chmod 0600 "${target}.tmp.$$"
  mv -f -- "${target}.tmp.$$" "$target"
  secure_authorized_keys "$TUNNEL_USER" "$TUNNEL_HOME" "$target"
}

finalize_tunnel_migration() {
  [[ $# -eq 3 ]] || usage
  local old_file='' expected='' acknowledgement='' argument target
  for argument in "$@"; do
    case $argument in
      --old-tunnel-key-file=*) old_file=$(key_file "$argument") ;;
      --expected-fingerprint=*) expected=${argument#*=} ;;
      --ack-primary-tunnel-health=*) acknowledgement=${argument#*=} ;;
      *) usage ;;
    esac
  done
  [[ -n $old_file && $expected =~ ^SHA256:[A-Za-z0-9+/]{20,}={0,2}$ ]] || fail 'tunnel migration fingerprint is invalid'
  require_exact "$acknowledgement" "$ACK_PRIMARY_TUNNEL_HEALTH"
  [[ $(key_fingerprint "$old_file") == "$expected" ]] || fail 'tunnel migration fingerprint does not match old key'
  target=$(authorized_keys_for "$ADMIN_HOME")
  atomic_remove_key "$target" "$old_file"
  secure_authorized_keys "$ADMIN_USER" "$ADMIN_HOME" "$target"
}

backup_dir() {
  local value=$1
  [[ $value == "$BACKUP_ROOT"/* && $value != *'..'* ]] || fail 'backup directory is invalid'
  printf '%s\n' "$value"
}

snapshot_host() {
  local stage=$1 directory
  [[ -z $test_root ]] || fail 'host mutation stages cannot run with a test root'
  directory="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)-$stage"
  install -d -m 0700 "$directory"
  [[ -f $SSH_POLICY ]] && cp -p -- "$SSH_POLICY" "$directory/sshd-policy" || : > "$directory/sshd-policy.absent"
  cp -a /etc/ufw "$directory/ufw"
  printf '%s\n' "$directory"
}

arm_rollback() {
  local directory=$1 unit=blog-x-secondary-hardening-rollback
  cat > "/etc/systemd/system/$unit.service" <<UNIT
[Unit]
Description=Blog X secondary hardening timed rollback
[Service]
Type=oneshot
ExecStart=$APP_ROOT/deploy/secondary/harden-host.sh rollback --backup-dir=$directory
UNIT
  cat > "/etc/systemd/system/$unit.timer" <<UNIT
[Unit]
Description=Blog X secondary hardening rollback timer
[Timer]
OnActiveSec=10min
Unit=$unit.service
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl start "$unit.timer"
}

restore_snapshot() {
  local directory=$1
  [[ -f $directory/sshd-policy ]] && install -m 0600 "$directory/sshd-policy" "$SSH_POLICY" || rm -f -- "$SSH_POLICY"
  [[ -d $directory/ufw ]] && cp -a "$directory/ufw/." /etc/ufw/
  sshd -t
  systemctl reload ssh
  ufw --force reload || true
}

require_sshd_policy() {
  sshd -T | grep -qx 'permitrootlogin no'
  sshd -T | grep -qx 'passwordauthentication no'
  sshd -T | grep -Eq '^kbdinteractiveauthentication no$|^challengeresponseauthentication no$'
  sshd -T | grep -qx 'pubkeyauthentication yes'
}

write_sshd_policy() {
  install -d -m 0755 /etc/ssh/sshd_config.d
  cat > "$SSH_POLICY" <<'POLICY'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
POLICY
  chmod 0600 "$SSH_POLICY"
}

harden_ssh() {
  [[ $# -eq 1 && $1 == --ack-fresh-admin-key-session=$ACK_FRESH_KEY_SESSION ]] || fail 'fresh key-only administrator session acknowledgement is required'
  local directory
  directory=$(snapshot_host ssh)
  arm_rollback "$directory"
  if ! write_sshd_policy || ! sshd -t || ! systemctl reload ssh || ! require_sshd_policy; then restore_snapshot "$directory"; fail 'SSH hardening failed and was restored'; fi
  printf '%s\n' "$directory"
}

confirm_ssh() {
  [[ $# -eq 1 && $1 == --ack-fresh-admin-key-session=$ACK_FRESH_KEY_SESSION ]] || fail 'fresh key-only administrator session acknowledgement is required'
  require_sshd_policy
  systemctl stop blog-x-secondary-hardening-rollback.timer
}

apply_firewall() {
  [[ $# -eq 1 && $1 == --ack-fresh-admin-key-session=$ACK_FRESH_KEY_SESSION ]] || fail 'fresh key-only administrator session acknowledgement is required'
  local directory
  directory=$(snapshot_host firewall)
  arm_rollback "$directory"
  if ! ufw allow 22/tcp || ! ufw default deny incoming || ! ufw default allow outgoing || ! ufw --force enable; then restore_snapshot "$directory"; fail 'firewall hardening failed and was restored'; fi
  ufw status | grep -Eq '^22/tcp[[:space:]]+ALLOW' || { restore_snapshot "$directory"; fail 'SSH firewall allowance is missing'; }
  ! ufw status | grep -Eq '(^|[[:space:]])(3001|5432)/tcp' || { restore_snapshot "$directory"; fail 'application database firewall rule is forbidden'; }
  printf '%s\n' "$directory"
}

verify_live_topology() {
  local compose_status
  require_sshd_policy
  ufw status | grep -q 'Status: active'
  ufw status | grep -Eq '^22/tcp[[:space:]]+ALLOW'
  ! ufw status | grep -Eq '(^|[[:space:]])(3001|5432)/tcp'
  curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/health >/dev/null
  compose_status=$(docker compose --project-name blog-x-secondary --env-file /etc/blog-x/secondary.env --file /opt/blog-x/deploy/secondary/compose.yaml ps --format json)
  printf '%s\n' "$compose_status" | grep -E '"(Service|service)":"api"' | grep -Eq '"(Health|health)":"healthy"'
  printf '%s\n' "$compose_status" | grep -E '"(Service|service)":"postgres"' | grep -Eq '"(Health|health)":"healthy"'
  ss -lnt | grep -Eq '127\.0\.0\.1:3001'
  ! docker ps --format '{{.Ports}}' | grep -Eq '(^|[, ])(0\.0\.0\.0|\[::\]):5432'
  grep -Fxq "no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen=\"$TUNNEL_DESTINATION\"" <(cut -d' ' -f1 "$(authorized_keys_for "$TUNNEL_HOME")")
}

confirm_firewall() {
  [[ $# -eq 1 && $1 == --ack-fresh-admin-key-session=$ACK_FRESH_KEY_SESSION ]] || fail 'fresh key-only administrator session acknowledgement is required'
  verify_live_topology
  systemctl stop blog-x-secondary-hardening-rollback.timer
}

rollback() {
  [[ $# -eq 1 && $1 == --backup-dir=* ]] || usage
  restore_snapshot "$(backup_dir "${1#*=}")"
}

case ${1:-} in
  prepare-admin) shift; prepare_admin "$@" ;;
  provision-tunnel-user) shift; provision_tunnel_user "$@" ;;
  finalize-tunnel-migration) shift; finalize_tunnel_migration "$@" ;;
  harden-ssh) shift; harden_ssh "$@" ;;
  confirm-ssh) shift; confirm_ssh "$@" ;;
  apply-firewall) shift; apply_firewall "$@" ;;
  confirm-firewall) shift; confirm_firewall "$@" ;;
  verify) shift; [[ $# -eq 0 ]] || usage; [[ -z $test_root ]] || fail 'verify cannot run with a test root'; verify_live_topology ;;
  rollback) shift; rollback "$@" ;;
  *) usage ;;
esac
