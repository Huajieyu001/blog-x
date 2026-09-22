import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const script = new URL("./harden-host.sh", import.meta.url);

const run = (root, ...args) => new Promise((resolve, reject) => {
  const child = spawn("bash", [script.pathname, ...args], {
    env: {
      ...process.env,
      BLOG_X_HARDEN_TEST_ROOT: root,
      BLOG_X_HARDEN_TEST_MODE: "1",
      BLOG_X_HARDEN_TEST_ALLOW: "fixture-only",
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

  const before = keys;
  const rejected = await run(root, "prepare-admin", "--public-key", `${key}\nssh-ed25519 injected`);
  assert.notEqual(rejected.code, 0);
  assert.equal(await readFile(join(root, "home/blog-x-admin/.ssh/authorized_keys"), "utf8"), before);
});

test("hardening stages are fixed, reversible, and contain no secret-bearing interfaces", async () => {
  const source = await readFile(script, "utf8");
  for (const stage of ["prepare-admin", "switch-tunnel-user", "harden-ssh", "confirm-ssh", "apply-firewall", "confirm-firewall", "apply-edge", "rollback-edge", "verify", "rollback"]) {
    assert.match(source, new RegExp(`\\b${stage}\\b`));
  }
  assert.match(source, /sshd -t/);
  assert.match(source, /systemctl reload sshd/);
  assert.match(source, /firewall-offline-cmd/);
  assert.match(source, /rpcbind/);
  assert.match(source, /--max-time/);
  assert.match(source, /SECONDARY_SSH_USER/);
  assert.doesNotMatch(source, /PRIVATE KEY|PASSWORD=|read -s/);
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
