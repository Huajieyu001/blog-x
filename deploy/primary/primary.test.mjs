import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("primary bundle keeps the browser at canonical HTTPS and Web/API ports private", async () => {
  const [nginx, deploy, tunnel, health, headers] = await Promise.all(["./nginx/blog-x.conf.template", "./deploy.sh", "./tunnel.sh", "./healthcheck.sh", "./nginx/blog-x-security-headers.conf"].map(read));
  assert.match(nginx, /server_name huajieyu001\.top/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3100/);
  assert.match(nginx, /X-Blog-X-Ingress-Auth __BLOG_X_INGRESS_AUTH_SECRET__/);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/(?!127\.0\.0\.1:3100)/);
  assert.match(deploy, /--network host/);
  assert.match(deploy, /HOST=127\.0\.0\.1 -e PORT=3100/);
  assert.match(tunnel, /StrictHostKeyChecking=yes/);
  assert.match(tunnel, /UserKnownHostsFile="\$KNOWN_HOSTS_PATH"/);
  assert.match(tunnel, /-L "127\.0\.0\.1:3001:127\.0\.0\.1:3001"/);
  assert.match(health, /127\.0\.0\.1:3001\/health/);
  assert.match(nginx, /include \/etc\/nginx\/snippets\/blog-x-security-headers\.conf;/);
  assert.match(headers, /proxy_hide_header X-Powered-By;/);
  assert.match(headers, /add_header Content-Security-Policy/);
  assert.match(headers, /Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
  assert.match(headers, /Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)" always;/);
  assert.doesNotMatch(headers, /unsafe-eval|\*/);
  assert.equal([...headers.matchAll(/add_header Content-Security-Policy/g)].length, 1);
});

test("primary deploy backs up and health-gates a prebuilt candidate before cutover", async () => {
  const [deploy, backup, rollback, restore] = await Promise.all(["./deploy.sh", "./backup.sh", "./rollback.sh", "./restore-backup.sh"].map(read));
  assert.ok(deploy.indexOf('"$(dirname "$0")/backup.sh"') < deploy.indexOf('docker load'));
  assert.doesNotMatch(deploy, /docker build/);
  assert.match(deploy, /docker load --input "\$image_archive"/);
  assert.equal([...deploy.matchAll(/for _ in \$\(seq 1 20\)/g)].length, 2);
  assert.ok(deploy.indexOf('healthcheck.sh" 3101') < deploy.indexOf('mv -Tf "$CURRENT.next" "$CURRENT"'));
  assert.match(deploy, /systemctl is-active --quiet blog-x-primary-tunnel\.service/);
  assert.match(deploy, /systemctl enable --now blog-x-primary-web\.service/);
  assert.match(deploy, /restore-backup\.sh/);
  assert.ok(deploy.indexOf('install -m 0640') < deploy.indexOf('nginx -t'));
  assert.ok(deploy.indexOf('LEGACY_DISABLED') < deploy.indexOf('nginx -t'));
  assert.match(deploy, /黔ICP备2023015906号/);
  assert.match(backup, /current-release/);
  assert.match(backup, /\/etc\/nginx/);
  assert.match(backup, /\/usr\/share\/nginx\/html\/blog/);
  assert.match(backup, /SHA256SUMS/);
  assert.match(rollback, /docker image inspect/);
  assert.match(rollback, /mv -Tf "\$CURRENT.next" "\$CURRENT"/);
  assert.match(restore, /primary-state\.tar\.gz/);
  assert.match(restore, /systemctl reload nginx/);
});

test("tracked templates are secret-free and require service-owned configuration", async () => {
  const files = await Promise.all(["./primary.env.example", "./deploy.sh", "./tunnel.sh"].map(read));
  for (const content of files) {
    assert.doesNotMatch(content, /-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----/);
    assert.doesNotMatch(content, /postgres(?:ql)?:\/\/[^\s/]+:[^\s@]+@/i);
  }
  assert.match(files[0], /SSH_KEY_PATH=\/etc\/blog-x\/ssh\/secondary-tunnel\.key/);
  assert.match(files[0], /KNOWN_HOSTS_PATH=\/etc\/blog-x\/ssh\/known_hosts/);
  assert.match(files[1], /-e BLOG_X_INGRESS_AUTH_SECRET="\$BLOG_X_INGRESS_AUTH_SECRET"/);
});
