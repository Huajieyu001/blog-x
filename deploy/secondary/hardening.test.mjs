import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./harden-host.sh", import.meta.url);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "blog-x-secondary-hardening-"));
  const keys = join(root, "keys");
  const adminSsh = join(root, "home", "ubuntu", ".ssh");
  await mkdir(keys, { recursive: true, mode: 0o700 });
  await mkdir(adminSsh, { recursive: true, mode: 0o700 });
  const createKey = (name) => {
    const privateKey = join(keys, name);
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", privateKey]);
    return `${privateKey}.pub`;
  };
  const management = createKey("management");
  const tunnel = createKey("tunnel");
  const unrelated = createKey("unrelated");
  const restrictedTunnel = `no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen="127.0.0.1:3001" ${await readFile(tunnel, "utf8")}`;
  await writeFile(join(adminSsh, "authorized_keys"), `${await readFile(unrelated, "utf8")}${restrictedTunnel}`, { mode: 0o600 });
  return { root, management, tunnel, unrelated, restrictedTunnel, adminKeys: join(adminSsh, "authorized_keys") };
}

function invoke(root, ...arguments_) {
  return spawnSync("bash", [script.pathname, ...arguments_], {
    env: { ...process.env, BLOG_X_HARDEN_TEST: "1", BLOG_X_HARDEN_TEST_ROOT: root },
    encoding: "utf8",
  });
}

function fingerprint(file) {
  return execFileSync("ssh-keygen", ["-lf", file, "-E", "sha256"], { encoding: "utf8" }).trim().split(/\s+/)[1];
}

test("prepare-admin is additive and provisioned tunnel authorization is exact", async () => {
  const state = await fixture();
  const prepared = invoke(state.root, "prepare-admin", `--management-key-file=${state.management}`);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(invoke(state.root, "prepare-admin", `--management-key-file=${state.management}`).status, 0);
  const adminKeys = await readFile(state.adminKeys, "utf8");
  const managementBlob = (await readFile(state.management, "utf8")).split(" ")[1];
  assert.equal(adminKeys.split("\n").filter((line) => line.includes(managementBlob)).length, 1);
  assert.ok(adminKeys.includes((await readFile(state.unrelated, "utf8")).split(" ")[1]));
  assert.ok(adminKeys.includes((await readFile(state.tunnel, "utf8")).split(" ")[1]));

  assert.equal(invoke(state.root, "provision-tunnel-user", `--tunnel-key-file=${state.tunnel}`).status, 0);
  const tunnelKeys = await readFile(join(state.root, "home", "blog-x-tunnel", ".ssh", "authorized_keys"), "utf8");
  assert.match(tunnelKeys, /^no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen="127\.0\.0\.1:3001" ssh-ed25519 /);
  assert.doesNotMatch(tunnelKeys, /command=/);
});

test("tunnel migration needs the exact fingerprint and explicit healthy-primary acknowledgement", async () => {
  const state = await fixture();
  const expected = fingerprint(state.tunnel);
  assert.equal(invoke(state.root, "prepare-admin", `--management-key-file=${state.management}`).status, 0);
  assert.notEqual(invoke(state.root, "finalize-tunnel-migration", `--old-tunnel-key-file=${state.tunnel}`, `--expected-fingerprint=${expected}`, "--ack-primary-tunnel-health=not-yet").status, 0);
  assert.ok((await readFile(state.adminKeys, "utf8")).includes((await readFile(state.tunnel, "utf8")).split(" ")[1]));
  assert.notEqual(invoke(state.root, "finalize-tunnel-migration", `--old-tunnel-key-file=${state.tunnel}`, "--expected-fingerprint=SHA256:wrongwrongwrongwrongwrong", "--ack-primary-tunnel-health=primary-tunnel-switched-restarted-and-healthy").status, 0);
  assert.equal(invoke(state.root, "finalize-tunnel-migration", `--old-tunnel-key-file=${state.tunnel}`, `--expected-fingerprint=${expected}`, "--ack-primary-tunnel-health=primary-tunnel-switched-restarted-and-healthy").status, 0);
  const keys = await readFile(state.adminKeys, "utf8");
  assert.ok(!keys.includes(state.restrictedTunnel));
  assert.ok(keys.includes((await readFile(state.unrelated, "utf8")).split(" ")[1]));
  assert.ok(keys.includes((await readFile(state.management, "utf8")).split(" ")[1]));
});

test("tunnel migration fails closed for duplicate restricted authorizations", async () => {
  const state = await fixture();
  await writeFile(state.adminKeys, `${await readFile(state.adminKeys, "utf8")}${state.restrictedTunnel}`, { mode: 0o600 });
  const before = await readFile(state.adminKeys, "utf8");
  const result = invoke(state.root, "finalize-tunnel-migration", `--old-tunnel-key-file=${state.tunnel}`, `--expected-fingerprint=${fingerprint(state.tunnel)}`, "--ack-primary-tunnel-health=primary-tunnel-switched-restarted-and-healthy");
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(state.adminKeys, "utf8"), before);
});

test("invalid key material fails before it can mutate the administrator authority", async () => {
  const state = await fixture();
  const before = await readFile(state.adminKeys, "utf8");
  const invalid = join(state.root, "keys", "invalid.pub");
  await writeFile(invalid, `${await readFile(state.management, "utf8")}${await readFile(state.tunnel, "utf8")}`, { mode: 0o600 });
  await chmod(invalid, 0o600);
  assert.notEqual(invoke(state.root, "prepare-admin", `--management-key-file=${invalid}`).status, 0);
  assert.equal(await readFile(state.adminKeys, "utf8"), before);
});

test("SSH and firewall stages are acknowledgement-gated, rollback-backed, and live-only", async () => {
  const source = await readFile(script, "utf8");
  for (const required of ["sshd -t", "systemctl reload ssh", "permitrootlogin no", "passwordauthentication no", "pubkeyauthentication yes", "ufw allow 22/tcp", "ufw default deny incoming", "ufw default allow outgoing", "OnActiveSec=10min", "127.0.0.1:3001"]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /harden-ssh\) shift; harden_ssh/);
  assert.match(source, /confirm-firewall\) shift; confirm_firewall/);
  assert.match(source, /host mutation stages cannot run with a test root/);
  assert.doesNotMatch(source, /ufw allow (?:3001|5432)/);
  assert.match(source, /readonly SSH_POLICY=\/etc\/ssh\/sshd_config\.d\/00-blog-x-hardening\.conf/);
  assert.match(source, /sshd -T \| grep -qx 'passwordauthentication no'/);
  assert.match(source, /systemctl daemon-reload[\s\S]*systemctl start "\$unit\.timer"/);
  assert.match(source, /systemctl stop blog-x-secondary-hardening-rollback\.timer/);
});

test("tunnel account stays key-auth eligible while its password remains unknowable", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /useradd --create-home --user-group --shell \/usr\/sbin\/nologin/);
  assert.match(source, /openssl rand -base64 48 \| openssl passwd -6 -stdin/);
  assert.match(source, /usermod --shell \/usr\/sbin\/nologin --password "\$password_hash" "\$TUNNEL_USER"/);
  assert.match(source, /unset password_hash/);
  assert.doesNotMatch(source, /passwd --lock/);
});

test("authorized_keys mutations restore account ownership and strict modes after atomic replacement", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /secure_authorized_keys\(\) \{/);
  assert.match(source, /chmod 0700 "\$home\/\.ssh"/);
  assert.match(source, /chmod 0600 "\$target"/);
  assert.match(source, /chown "\$account:\$account" "\$home\/\.ssh" "\$target"/);
  assert.match(source, /atomic_add_key "\$target" "\$source"\n  secure_authorized_keys "\$ADMIN_USER" "\$ADMIN_HOME" "\$target"/);
  assert.match(source, /atomic_remove_key "\$target" "\$old_file"\n  secure_authorized_keys "\$ADMIN_USER" "\$ADMIN_HOME" "\$target"/);
  assert.match(source, /secure_authorized_keys "\$TUNNEL_USER" "\$TUNNEL_HOME" "\$target"/);
});
