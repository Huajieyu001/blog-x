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
  const postgres = compose.slice(compose.indexOf("  postgres:"), compose.indexOf("\n  api:"));
  const api = compose.slice(compose.indexOf("  api:"), compose.indexOf("\nvolumes:"));
  assert.match(postgres, /networks: \[internal\]/);
  assert.match(api, /networks: \[internal, ingress\]/);
  assert.match(compose, /ingress:\n    driver: bridge/);
  assert.doesNotMatch(postgres, /ingress/);
  assert.match(compose, /postgres-data:|media-data:/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /mem_limit: 1200m/);
  assert.match(compose, /mem_limit: 1400m/);
  assert.doesNotMatch(compose, /network:\s*none/);
  assert.match(compose, /command: \["corepack", "pnpm", "--filter", "@blog-x\/api", "dev"\]/);
  assert.doesNotMatch(compose, /node apps\/api\/dist\/app\.js|@blog-x\/contracts.*dist/);
});

test("API image installs only the API workspace closure, never the Web dependency graph", async () => {
  const dockerfile = await read("../../apps/api/Dockerfile");
  assert.match(dockerfile, /COPY apps\/api\/package\.json apps\/api\/package\.json/);
  assert.match(dockerfile, /COPY packages\/contracts\/package\.json packages\/contracts\/package\.json/);
  assert.match(dockerfile, /pnpm --filter @blog-x\/api\.\.\. install --frozen-lockfile/);
  assert.doesNotMatch(dockerfile, /apps\/web\/package\.json/);
  assert.doesNotMatch(dockerfile, /pnpm install --frozen-lockfile/);
});

test("install and deployment scripts use fixed safe authorities without secret output or administrator seeding", async () => {
  const [install, deploy, backup, publish] = await Promise.all(["./install.sh", "./deploy.sh", "./backup-local.sh", "./publish-due.sh"].map(read));
  assert.match(install, /Ubuntu 24\.04/);
  assert.match(install, /docker\.io docker-compose-v2/);
  assert.doesNotMatch(install, /dist-upgrade|full-upgrade|echo .*password/i);
  assert.match(install, /chmod 0600 "\$ENV_FILE"/);
  assert.match(install, /openssl rand -hex 32/);
  assert.doesNotMatch(install, /enable --now blog-x-secondary-backup\.timer/);
  assert.match(deploy, /readonly ENV_FILE=\/etc\/blog-x\/secondary\.env/);
  assert.match(deploy, /db:migrate/);
  assert.match(deploy, /db:schema:verify/);
  assert.doesNotMatch(deploy, /db:seed|0\.0\.0\.0:3001/);
  assert.match(deploy, /systemctl enable --now blog-x-secondary-backup\.timer blog-x-secondary-publish-due\.timer/);
  assert.ok(deploy.indexOf("systemctl enable --now") > deploy.indexOf('port api 3001'));
  assert.match(backup, /same-host-not-off-host-disaster-recovery/);
  assert.match(backup, /pg_dump/);
  assert.match(backup, /sha256sum -c SHA256SUMS/);
  assert.match(backup, /exec -T postgres pg_restore -l < "\$stage\/database\.dump"/);
  assert.doesNotMatch(backup, /\npg_restore -l/);
  const publishCommand = publish.split("\n").find((line) => line.startsWith("docker compose"));
  assert.equal(publishCommand?.split(/\s+/).slice(-2).join(" "), "publish:due --limit=100");
  assert.equal(publishCommand?.includes("publish:due -- --limit="), false);
});

test("systemd jobs use fixed local runners and leave failures visible in the journal", async () => {
  const [backupService, backupTimer, publishService, publishTimer, retentionService, retentionTimer] = await Promise.all([
    "./systemd/blog-x-secondary-backup.service", "./systemd/blog-x-secondary-backup.timer",
    "./systemd/blog-x-secondary-publish-due.service", "./systemd/blog-x-secondary-publish-due.timer",
    "./systemd/blog-x-secondary-retention.service", "./systemd/blog-x-secondary-retention.timer",
  ].map(read));
  assert.match(backupService, /ExecStart=\/opt\/blog-x\/deploy\/secondary\/backup-local\.sh/);
  assert.match(backupService, /StandardError=journal/);
  assert.match(backupTimer, /OnCalendar=daily/);
  assert.match(publishService, /StateDirectory=blog-x\/ops-results/);
  assert.match(publishService, /ExecStart=\/usr\/bin\/node \/opt\/blog-x\/scripts\/ops\/run-secondary-job\.mjs publish-due --results-root=\/var\/lib\/blog-x\/ops-results/);
  assert.match(publishTimer, /OnCalendar=\*:\*:\d\d/);
  assert.match(retentionService, /User=blog-x/);
  assert.match(retentionService, /SupplementaryGroups=docker/);
  assert.match(retentionService, /ExecStart=\/usr\/bin\/node \/opt\/blog-x\/scripts\/ops\/run-secondary-job\.mjs retention --results-root=\/var\/lib\/blog-x\/ops-results/);
  assert.match(retentionService, /ProtectSystem=strict/);
  assert.match(retentionService, /RestrictAddressFamilies=AF_UNIX/);
  assert.match(retentionService, /ReadWritePaths=\/var\/lib\/blog-x\/ops-results \/run\/docker\.sock/);
  assert.doesNotMatch(retentionService, /EnvironmentFile|systemctl\s+enable|apt(?:-get)?\s+install/i);
  assert.match(retentionTimer, /OnCalendar=daily/);
  assert.match(retentionTimer, /Persistent=true/);
  assert.match(retentionTimer, /RandomizedDelaySec=20m/);
  assert.doesNotMatch(`${retentionService}\n${retentionTimer}`, /systemctl\s+enable|apt(?:-get)?\s+install|deploy\.sh/i);
});

test("root retention command remains bounded and calls the API CLI without a scheduler", async () => {
  const packageJson = JSON.parse(await read("../../package.json"));
  assert.equal(packageJson.scripts.retention, "corepack pnpm --filter @blog-x/api retention --views-limit=100 --sessions-limit=100");
  assert.doesNotMatch(packageJson.scripts.retention, /enable|install|systemctl/i);
});
