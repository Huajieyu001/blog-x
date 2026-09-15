import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("secondary compose keeps PostgreSQL private and API loopback-only", async () => {
  const compose = await read("./compose.yaml");
  assert.match(compose, /NODE_ENV: production/);
  assert.match(compose, /PUBLIC_ORIGIN: https:\/\/huajieyu001\.top/);
  assert.match(compose, /- "127\.0\.0\.1:3001:3001"/);
  assert.doesNotMatch(compose, /5432:\d+|:\d+:5432/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /postgres-data:|media-data:/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /mem_limit: 1200m/);
  assert.match(compose, /mem_limit: 1400m/);
});

test("install and deployment scripts use fixed safe authorities without secret output or administrator seeding", async () => {
  const [install, deploy, backup, publish] = await Promise.all(["./install.sh", "./deploy.sh", "./backup-local.sh", "./publish-due.sh"].map(read));
  assert.match(install, /Ubuntu 24\.04/);
  assert.match(install, /docker\.io docker-compose-v2/);
  assert.doesNotMatch(install, /dist-upgrade|full-upgrade|echo .*password/i);
  assert.match(install, /chmod 0600 "\$ENV_FILE"/);
  assert.match(install, /openssl rand -hex 32/);
  assert.match(deploy, /readonly ENV_FILE=\/etc\/blog-x\/secondary\.env/);
  assert.match(deploy, /db:migrate/);
  assert.match(deploy, /db:schema:verify/);
  assert.doesNotMatch(deploy, /db:seed|0\.0\.0\.0:3001/);
  assert.match(backup, /same-host-not-off-host-disaster-recovery/);
  assert.match(backup, /pg_dump/);
  assert.match(backup, /sha256sum -c SHA256SUMS/);
  assert.match(publish, /publish:due/);
});

test("systemd jobs call fixed local scripts and leave failures visible in the journal", async () => {
  const [backupService, backupTimer, publishService, publishTimer] = await Promise.all([
    "./systemd/blog-x-secondary-backup.service", "./systemd/blog-x-secondary-backup.timer",
    "./systemd/blog-x-secondary-publish-due.service", "./systemd/blog-x-secondary-publish-due.timer",
  ].map(read));
  assert.match(backupService, /ExecStart=\/opt\/blog-x\/deploy\/secondary\/backup-local\.sh/);
  assert.match(backupService, /StandardError=journal/);
  assert.match(backupTimer, /OnCalendar=daily/);
  assert.match(publishService, /ExecStart=\/opt\/blog-x\/deploy\/secondary\/publish-due\.sh/);
  assert.match(publishTimer, /OnCalendar=\*:\*:\d\d/);
});
