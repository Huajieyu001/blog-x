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
  assert.match(install, /chown root:root "\$ENV_FILE"/);
  assert.match(install, /openssl rand -hex 32/);
  assert.doesNotMatch(install, /enable --now blog-x-secondary-backup\.timer/);
  for (const unit of ["blog-x-secondary-retention.service", "blog-x-secondary-retention.timer"]) {
    const placement = new RegExp(`install -m 0644.*${unit.replace(".", "\\.")}`);
    assert.match(install, placement);
    assert.ok(install.indexOf(unit) < install.indexOf("systemctl daemon-reload"));
  }
  assert.doesNotMatch(install, /systemctl\s+(?:enable|start)[^\n]*blog-x-secondary-retention/i);
  assert.match(deploy, /readonly ENV_FILE=\/etc\/blog-x\/secondary\.env/);
  assert.match(deploy, /stat -c '%U:%G' "\$ENV_FILE"\) == root:root/);
  assert.match(deploy, /db:migrate/);
  assert.match(deploy, /db:schema:verify/);
  assert.doesNotMatch(deploy, /db:seed|0\.0\.0\.0:3001/);
  assert.match(deploy, /systemctl enable --now blog-x-secondary-backup\.timer blog-x-secondary-publish-due\.timer blog-x-secondary-retention\.timer/);
  const retentionEnableIndex = deploy.indexOf("systemctl enable --now");
  for (const gate of ["db:migrate", "db:schema:verify", "curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/health >/dev/null", "port api 3001", "docker ps --format"]) {
    assert.ok(retentionEnableIndex > deploy.lastIndexOf(gate), `retention activation must follow ${gate}`);
  }
  assert.doesNotMatch(`${install}\n${deploy}`, /ops\/systemd\/blog-x-monitor@|off-host/i);
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
  assert.match(retentionService, /^User=root$/m);
  assert.doesNotMatch(retentionService, /^SupplementaryGroups=/m);
  assert.match(retentionService, /ExecStart=\/usr\/bin\/node \/opt\/blog-x\/scripts\/ops\/run-secondary-job\.mjs retention --results-root=\/var\/lib\/blog-x\/ops-results/);
  for (const hardening of [
    "NoNewPrivileges=true", "PrivateTmp=true", "PrivateNetwork=true", "ProtectHome=true", "ProtectSystem=strict",
    "ProtectControlGroups=true", "ProtectKernelTunables=true", "ProtectKernelModules=true", "ProtectClock=true",
    "ProtectHostname=true", "RestrictAddressFamilies=AF_UNIX", "RestrictSUIDSGID=true", "LockPersonality=true",
    "SystemCallArchitectures=native",
  ]) assert.match(retentionService, new RegExp(`^${hardening}$`, "m"));
  assert.match(retentionService, /^ReadWritePaths=\/var\/lib\/blog-x\/ops-results \/run\/docker\.sock$/m);
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

test("immutable secondary deployment resolves a revision tag once and uses only its inspected image ID", async () => {
  const [dockerfile, compose, deploy] = await Promise.all([
    read("../../apps/api/Dockerfile"), read("./compose.yaml"), read("./deploy.sh"),
  ]);
  assert.match(dockerfile, /^ARG BLOG_X_REVISION$/m);
  assert.match(dockerfile, /^LABEL org\.opencontainers\.image\.revision=\$\{?BLOG_X_REVISION\}?$/m);
  assert.match(compose, /args:\n\s+BLOG_X_REVISION: \$\{BLOG_X_REVISION\}/);
  assert.match(compose, /image: \$\{BLOG_X_API_IMAGE:-blog-x-api-secondary:\$\{BLOG_X_REVISION\}\}/);
  assert.match(deploy, /readonly DEPLOYMENTS_DIR=\/var\/lib\/blog-x\/deployments/);
  assert.match(deploy, /docker image inspect --format '\{\{\.Id\}\}' "\$candidate_tag"/);
  assert.match(deploy, /org\.opencontainers\.image\.revision/);
  assert.match(deploy, /"BLOG_X_API_IMAGE=\$candidate_image_id"/);
  assert.match(deploy, /run --rm --no-build api corepack pnpm --filter @blog-x\/api db:migrate/);
  assert.match(deploy, /run --rm --no-build api corepack pnpm --filter @blog-x\/api db:schema:verify/);
  assert.match(deploy, /up -d --no-build api/);
  assert.match(deploy, /rollback\.env/);
  assert.match(deploy, /current\.env/);
  assert.doesNotMatch(deploy, /source .*rollback|\. .*rollback|eval /i);
  const firstMigration = deploy.indexOf("db:migrate");
  for (const gate of ["candidate_image_id", "rollback.env", "mv -f -- \"$state_tmp\" \"$ROLLBACK_RECORD\""]) {
    assert.ok(deploy.indexOf(gate) >= 0 && deploy.indexOf(gate) < firstMigration, `${gate} must precede migration`);
  }
  const timerEnableIndex = deploy.indexOf("systemctl enable --now");
  for (const gate of ["db:migrate", "db:schema:verify", "BLOG_X_API_IMAGE", "current.env", "API listener is not loopback-only"]) {
    assert.ok(timerEnableIndex > deploy.lastIndexOf(gate), `timer activation must follow ${gate}`);
  }
});

test("secondary rollback accepts only a recorded prior image after every identity and topology gate", async () => {
  const [install, rollback] = await Promise.all([read("./install.sh"), read("./rollback.sh")]);
  assert.match(install, /readonly DEPLOYMENTS_DIR=\/var\/lib\/blog-x\/deployments/);
  assert.match(install, /install -d -m 0700 -o root -g root "\$DEPLOYMENTS_DIR"/);
  assert.match(rollback, /^set -euo pipefail$/m);
  assert.match(rollback, /^umask 077$/m);
  assert.match(rollback, /\[\[ \$# -eq 2 \]\]/);
  assert.match(rollback, /--ack-migrations-compatible-with=/);
  assert.match(rollback, /\[\[ ! -L \$ROLLBACK_RECORD && -f \$ROLLBACK_RECORD \]\]/);
  assert.match(rollback, /stat -c '%a' "\$ROLLBACK_RECORD"\) == 600/);
  assert.match(rollback, /stat -c '%U:%G' "\$ROLLBACK_RECORD"\) == root:root/);
  for (const field of ["FORMAT", "PRIOR_PRESENT", "CANDIDATE_REVISION", "CANDIDATE_IMAGE_ID", "PRIOR_REVISION", "PRIOR_IMAGE_ID"]) {
    assert.match(rollback, new RegExp(`\\b${field}\\b`));
  }
  assert.match(rollback, /declare -A rollback_state=/);
  assert.doesNotMatch(rollback, /\b(?:source|eval)\b/);
  assert.match(rollback, /"BLOG_X_API_IMAGE=\$prior_image_id"/);
  assert.match(rollback, /up -d --no-build --no-deps api/);
  assert.match(rollback, /last-rollback\.env/);
  assert.match(rollback, /current\.env/);
  assert.doesNotMatch(rollback, /db:(?:migrate|schema)|pg_(?:dump|restore)|systemctl|secondary\.env.*(?:cat|source|\.)/i);
  const firstMutation = rollback.indexOf("up -d --no-build --no-deps api");
  assert.ok(firstMutation >= 0, "rollback must contain one API-only mutation");
  for (const gate of [
    "target_revision", "ack_candidate_revision", "ROLLBACK_RECORD", "PRIOR_PRESENT", "prior_image_id",
    "candidate_image_id", "current_api", "current_postgres", "docker port \"$current_postgres\" 5432", "port api 3001",
  ]) assert.ok(rollback.indexOf(gate) >= 0 && rollback.indexOf(gate) < firstMutation, `${gate} must precede rollback mutation`);
});
