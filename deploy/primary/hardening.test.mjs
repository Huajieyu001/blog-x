import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const script = new URL("./harden-host.sh", import.meta.url);

const runWith = (root, extraEnv, ...args) => new Promise((resolve, reject) => {
  const child = spawn("bash", [script.pathname, ...args], {
    env: {
      ...process.env,
      BLOG_X_HARDEN_TEST_ROOT: root,
      BLOG_X_HARDEN_TEST_MODE: "1",
      BLOG_X_HARDEN_TEST_ALLOW: "fixture-only",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
});

const run = (root, ...args) => runWith(root, {}, ...args);

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "blog-x-primary-hardening-"));
  await Promise.all([
    mkdir(join(root, "etc/blog-x"), { recursive: true }),
    mkdir(join(root, "etc/ssh"), { recursive: true }),
    mkdir(join(root, "etc/nginx/conf.d"), { recursive: true }),
    mkdir(join(root, "home/blog-x-admin/.ssh"), { recursive: true }),
  ]);
  await writeFile(join(root, "etc/blog-x/primary.env"), [
    "PUBLIC_ORIGIN=https://example.invalid",
    "SECONDARY_SSH_USER=legacy-tunnel",
    "SECONDARY_SSH_HOST=secondary.invalid",
  ].join("\n"));
  await writeFile(join(root, "home/blog-x-admin/.ssh/authorized_keys"), "ssh-ed25519 unrelated-key comment\n");
  return root;
};

test("prepare-admin is fixture-idempotent and rejects unsafe public-key input before mutation", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureOnlyKeyMaterial fixture-admin";

  assert.equal((await run(root, "prepare-admin", "--public-key", key)).code, 0);
  assert.equal((await run(root, "prepare-admin", "--public-key", key)).code, 0);
  const keys = await readFile(join(root, "home/blog-x-admin/.ssh/authorized_keys"), "utf8");
  assert.match(keys, /unrelated-key/);
  assert.equal(keys.split(key).length - 1, 1);
  assert.equal((await stat(join(root, "home/blog-x-admin/.ssh"))).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, "home/blog-x-admin/.ssh/authorized_keys"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(root, "etc/sudoers.d"))).mode & 0o777, 0o750);
  assert.equal((await stat(join(root, "etc/sudoers.d/blog-x-admin"))).mode & 0o777, 0o440);

  const before = keys;
  const rejected = await run(root, "prepare-admin", "--public-key", `${key}\nssh-ed25519 injected`);
  assert.notEqual(rejected.code, 0);
  assert.equal(await readFile(join(root, "home/blog-x-admin/.ssh/authorized_keys"), "utf8"), before);
});

test("prepare-admin gives the administrator its SSH files while sudoers stays root-owned and traversable", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /chown "\$ADMIN_USER:\$ADMIN_USER" "\$ssh_dir" "\$keys"/);
  assert.match(source, /set_root_permissions "\$\(dirname "\$sudoers"\)" "\$sudoers_tmp"/);
  assert.match(source, /set_mode 0750 "\$\(dirname "\$sudoers"\)"/);
  assert.match(source, /set_mode 0440 "\$sudoers_tmp"/);
  assert.match(source, /mv -f -- "\$sudoers_tmp" "\$sudoers"/);
  assert.doesNotMatch(source, /set_root_permissions "\$ssh_dir" "\$keys"/);
});

test("tunnel switching uses a non-blocking bounded restart and cancels rollback after fixture recovery", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await readFile(script, "utf8");
  assert.match(source, /systemctl restart --no-block "\$TUNNEL_SERVICE"/);
  assert.match(source, /ActiveEnterTimestampMonotonic/);
  assert.match(source, /systemctl show -p ActiveEnterTimestampMonotonic "\$TUNNEL_SERVICE"/);
  assert.doesNotMatch(source, /--value/);
  assert.match(source, /seq 1 "\$attempts"/);
  assert.match(source, /sleep "\$TUNNEL_RESTART_INTERVAL_SECONDS"/);
  assert.match(source, /tunnel_uses_current_config/);
  assert.match(source, /restart_tunnel_bounded "\$TUNNEL_RECOVERY_ATTEMPTS"/);

  const result = await runWith(root, { BLOG_X_HARDEN_TEST_TUNNEL_RESTART: "fail" }, "switch-tunnel-user", "blog-x-tunnel");
  assert.notEqual(result.code, 0);
  const config = await readFile(join(root, "etc/blog-x/primary.env"), "utf8");
  assert.match(config, /^SECONDARY_SSH_USER=legacy-tunnel$/m);
  await assert.rejects(stat(join(root, "var/lib/blog-x-hardening/.armed-backup")));
});

test("hardening stages are fixed, reversible, and contain no secret-bearing interfaces", async () => {
  const source = await readFile(script, "utf8");
  for (const stage of ["prepare-admin", "switch-tunnel-user", "harden-ssh", "confirm-ssh", "apply-firewall", "confirm-firewall", "apply-edge", "rollback-edge", "verify", "rollback"]) {
    assert.match(source, new RegExp(`\\b${stage}\\b`));
  }
  assert.match(source, /sshd -t/);
  assert.match(source, /effective_sshd_policy_valid/);
  assert.match(source, /effective="\$\(sshd -T -f "\$SSHD_CONFIG"\)"/);
  assert.doesNotMatch(source, /sshd -T -f "\$SSHD_CONFIG" \|/);
  assert.match(source, /awk -v include_line="\$include_line"/);
  assert.doesNotMatch(source, /awk -v include=/);
  assert.match(source, /systemctl reload sshd/);
  assert.match(source, /systemctl disable --now "\$ROLLBACK_TIMER"/);
  assert.match(source, /systemctl reset-failed "\$ROLLBACK_TIMER" "\$ROLLBACK_SERVICE"/);
  assert.match(source, /systemctl enable "\$ROLLBACK_TIMER"/);
  assert.match(source, /systemctl start "\$ROLLBACK_TIMER"/);
  assert.match(source, /firewall-offline-cmd/);
  assert.match(source, /runtime-state\.env/);
  assert.match(source, /firewalld-config\.tar\.gz/);
  assert.match(source, /restore_firewall_state/);
  assert.match(source, /rpcbind\.socket/);
  assert.match(source, /write_firewall_allowlist/);
  assert.doesNotMatch(source, /for service in \$\(firewall-cmd/);
  assert.match(source, /rpcbind/);
  assert.match(source, /--max-time/);
  assert.match(source, /SECONDARY_SSH_USER/);
  assert.doesNotMatch(source, /PRIVATE KEY|PASSWORD=|read -s/);
});

test("confirm-ssh rechecks the captured effective policy before cancelling rollback", async () => {
  const source = await readFile(script, "utf8");
  const confirm = source.slice(source.indexOf("confirm_ssh()"), source.indexOf("rpc_consumers_present()"));
  assert.ok(confirm.indexOf("effective_sshd_policy_valid") < confirm.indexOf("cancel_rollback"));
  assert.match(confirm, /rollback remains armed/);
  assert.match(source, /challengeresponseauthentication no/);
  assert.match(source, /kbdinteractiveauthentication no/);
});

test("restored failure paths cancel the armed rollback timer", async () => {
  const source = await readFile(script, "utf8");
  const harden = source.slice(source.indexOf("harden_ssh()"), source.indexOf("confirm_ssh()"));
  const failedValidation = harden.slice(harden.indexOf("if ! sshd -t"));
  assert.ok(failedValidation.indexOf("restore_backup") < failedValidation.indexOf("cancel_rollback"));
  assert.match(failedValidation, /prior state restored/);
  const edge = source.slice(source.indexOf("apply_edge()"), source.indexOf("rollback_edge()"));
  assert.equal((edge.match(/restore_backup "\$backup"[\s\S]{0,180}cancel_rollback/g) ?? []).length, 2);
});

test("managed SSH policy block is topmost, idempotent, and preserves existing configuration order", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const sshd = join(root, "etc/ssh/sshd_config");
  await writeFile(sshd, "# Existing header\nPermitRootLogin yes\nPasswordAuthentication yes\nKbdInteractiveAuthentication yes\nPubkeyAuthentication no\nMatch User legacy\n  X11Forwarding no\n");

  const first = await runWith(root, { SUDO_USER: "blog-x-admin" }, "harden-ssh", "--fresh-key-session");
  const second = await runWith(root, { SUDO_USER: "blog-x-admin" }, "harden-ssh", "--fresh-key-session");
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const effectiveCandidate = await readFile(sshd, "utf8");
  assert.ok(effectiveCandidate.startsWith("# BEGIN BLOG X MANAGED SSH POLICY\n"));
  assert.equal((effectiveCandidate.match(/# BEGIN BLOG X MANAGED SSH POLICY/g) ?? []).length, 1);
  assert.ok(effectiveCandidate.indexOf("PermitRootLogin no") < effectiveCandidate.indexOf("PermitRootLogin yes"));
  assert.match(effectiveCandidate, /ChallengeResponseAuthentication no/);
  assert.match(effectiveCandidate, /Match User legacy\n  X11Forwarding no/);
  assert.doesNotMatch(effectiveCandidate, /^Include /m);
  await assert.rejects(readFile(join(root, "etc/ssh/sshd_config.d/99-blog-x-hardening.conf")));
});

test("managed SSH policy validates a candidate without OpenSSH Include support", async () => {
  const source = await readFile(script, "utf8");
  const writer = source.slice(source.indexOf("write_sshd_policy()"), source.indexOf("effective_sshd_policy_valid()"));
  assert.match(writer, /sshd -t -f "\$tmp"/);
  assert.match(writer, /ChallengeResponseAuthentication no/);
  assert.doesNotMatch(writer, /Include \/etc\/ssh\/sshd_config\.d/);
  assert.doesNotMatch(writer, /SSHD_DROPIN/);
});

test("listener guard accepts loopback API and Web ports but rejects wildcard and non-loopback listeners", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const loopback = [
    "LISTEN 0 4096 127.0.0.1:3001 0.0.0.0:*",
    "LISTEN 0 4096 127.0.0.1:3100 0.0.0.0:*",
    "LISTEN 0 4096 [::1]:3001 [::]:*",
  ].join("\n");
  const accepted = await runWith(root, { BLOG_X_HARDEN_TEST_LISTENERS: loopback }, "test-listeners");
  assert.equal(accepted.code, 1, accepted.stderr);

  const wildcard = await runWith(root, { BLOG_X_HARDEN_TEST_LISTENERS: "LISTEN 0 4096 0.0.0.0:3001 0.0.0.0:*" }, "test-listeners");
  assert.equal(wildcard.code, 0, wildcard.stderr);
  assert.match(wildcard.stdout, /3001/);
  const address = await runWith(root, { BLOG_X_HARDEN_TEST_LISTENERS: "LISTEN 0 4096 192.0.2.10:25 0.0.0.0:*" }, "test-listeners");
  assert.equal(address.code, 0, address.stderr);
  assert.match(address.stdout, /25/);
});

test("fixture edge stage installs one managed include without publishing or contacting a host", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, "etc/nginx/conf.d/blog-x.conf");
  await writeFile(config, "server {\n    server_tokens off;\n}\n");

  const first = await run(root, "apply-edge");
  const second = await run(root, "apply-edge");
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const rendered = await readFile(config, "utf8");
  assert.equal((rendered.match(/blog-x-security-headers\.conf/g) ?? []).length, 1);
  const snippet = await readFile(join(root, "etc/nginx/snippets/blog-x-security-headers.conf"), "utf8");
  assert.match(snippet, /proxy_hide_header X-Powered-By;/);
  assert.match(snippet, /Strict-Transport-Security/);
  assert.doesNotMatch(snippet, /unsafe-eval|\*/);

  const backup = (await readFile(join(root, "var/lib/blog-x-hardening/.latest-backup"), "utf8")).trim();
  const rollback = await run(root, "rollback-edge", "--backup", backup);
  assert.equal(rollback.code, 0, rollback.stderr);
  assert.doesNotMatch(await readFile(config, "utf8"), /blog-x-security-headers\.conf/);
  await assert.rejects(readFile(join(root, "etc/nginx/snippets/blog-x-security-headers.conf")));
});
