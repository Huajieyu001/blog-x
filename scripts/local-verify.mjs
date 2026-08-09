import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { auditRepository } from "./check-boundaries.mjs";
import { createBackupSet } from "./backup/create.mjs";
import { verifyBackupSet } from "./backup/manifest.mjs";
import { cleanupGeneratedBackupRoot } from "./backup/paths.mjs";
import { cleanupGeneratedRestoreRoot, restoreBackupSet } from "./backup/restore.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const composeFile = resolve(root, "compose.yaml");
const apiImage = "blog-x-api-verify:phase2";
const webImage = "blog-x-web-verify:phase2";

export function validateNamespace(value) {
  if (!/^blogxverify_[a-z0-9]{8,32}$/.test(value ?? "")) {
    throw new Error("verification namespace must match blogxverify_[a-z0-9]{8,32}");
  }
  return value;
}

export function validateMediaVolume(value, namespace) {
  validateNamespace(namespace);
  if (value !== `${namespace}_media-data`) throw new Error("verification media volume must exactly match its generated namespace");
  return value;
}

export function validateDatabaseName(value, namespace) {
  validateNamespace(namespace);
  if (value !== `blog_x_${namespace.slice("blogxverify_".length)}`) {
    throw new Error("verification database must exactly match its generated namespace");
  }
  return value;
}

export function validateLoopbackHttpOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("verification public origin must be an absolute loopback HTTP origin"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("verification public origin must be an absolute loopback HTTP origin");
  }
  return url.origin;
}

export function phase3Selection(mode) {
  const api = ["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"];
  const exportApi = ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"];
  const metadata = "apps/web/app/lib/site-metadata.test.ts";
  const browser = "apps/web/e2e/phase3-distribution.spec.ts";
  const selections = {
    api: { databaseSuites: [api], webSuites: [] },
    metadata: { databaseSuites: [], webSuites: [metadata, browser] },
    full: { databaseSuites: [api, exportApi], webSuites: [metadata, browser] },
    "export-api": { databaseSuites: [exportApi], webSuites: [] },
    "export-browser": { databaseSuites: [], webSuites: [browser] },
  };
  const selection = selections[mode];
  if (!selection) throw new Error(`Phase 3 selection is not recognized: ${mode}`);
  return selection;
}

export function phase4Selection(mode) {
  const selection = {
    security: {
      databaseSuites: [
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/auth-session.test.ts"],
        ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
        ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
        ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
        ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/taxonomy.test.ts"],
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/pages-archive.test.ts"],
        ["AUTH_TEST_DATABASE_URL", "apps/api/test/media.test.ts"],
        ["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"],
        ["PHASE3_TEST_DATABASE_URL", "apps/api/test/public-distribution.test.ts"],
        ["PHASE3_TEST_DATABASE_URL", "apps/api/test/distribution-export.test.ts"],
      ],
      apiSuites: [
        "apps/api/test/security-hardening.test.ts",
        "apps/api/test/markdown-renderer.test.ts",
      ],
    },
    operations: {
      nodeSuites: ["scripts/ops-status.test.mjs", "scripts/backup/backup.test.mjs", "scripts/local-verify.test.mjs"],
    },
    restore: {
      nodeSuites: ["scripts/backup/restore.test.mjs", "scripts/local-verify.test.mjs"],
      databaseSuite: "apps/api/test/backup-restore.test.ts",
      browserSuite: "apps/web/e2e/phase4-restore.spec.ts",
    },
  }[mode];
  if (!selection) throw new Error(`Phase 4 selection is not recognized: ${mode}`);
  return selection;
}

export function validateTopologyPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("topology policy must be an object");
  const policy = value;
  if (Object.keys(policy).sort().join(",") !== "browser,format,futurePrivateLink,services,version") throw new Error("topology policy has unsupported fields");
  if (policy.format !== "blog-x-topology-policy" || policy.version !== 1) throw new Error("topology policy format is unsupported");
  if (!policy.browser || typeof policy.browser !== "object" || Array.isArray(policy.browser)
    || Object.keys(policy.browser).sort().join(",") !== "directDataPlane,relativeRoutes"
    || policy.browser.directDataPlane !== false
    || JSON.stringify(policy.browser.relativeRoutes) !== JSON.stringify(["/api", "/media"])) throw new Error("topology policy must keep browser traffic relative");
  if (!policy.services || typeof policy.services !== "object" || Array.isArray(policy.services)
    || Object.keys(policy.services).sort().join(",") !== "api,postgres,web") throw new Error("topology policy services are invalid");
  const { web, api, postgres } = policy.services;
  if (!web || web.hostPublished !== true || web.bind !== "edge-only"
    || !api || api.hostPublished !== false
    || !postgres || postgres.hostPublished !== false) throw new Error("topology policy exposes a data plane");
  if (!policy.futurePrivateLink || policy.futurePrivateLink.required !== true || policy.futurePrivateLink.status !== "unresolved") {
    throw new Error("topology policy must retain unresolved private-link evidence");
  }
  return policy;
}

export function assertSemanticTap(output) {
  const tap = String(output);
  const lines = tap.split(/\r?\n/);
  const directive = lines.find((line) => /#\s*(?:SKIP|TODO)\b/i.test(line)
    && !/^\s*#\s*(?:skipped|todo)\s+\d+\s*$/i.test(line));
  if (directive) {
    throw new Error(`semantic test output contains a skip/todo directive: ${redactText(directive)}`);
  }
  const nonzeroSummary = lines.find((line) => /^\s*#\s*(?:skipped|todo)\s+[1-9]\d*\s*$/i.test(line));
  if (nonzeroSummary) {
    throw new Error(`semantic test output contains a nonzero skip/todo summary: ${redactText(nonzeroSummary)}`);
  }
  const total = [...tap.matchAll(/^# tests (\d+)$/gmi)].map((match) => Number(match[1]));
  if (!total.length || total.every((count) => count === 0)) throw new Error("semantic test output reported zero semantic tests");
}

export function assertPlaywrightJourney(output) {
  const text = String(output);
  const skipped = [...text.matchAll(/\b(\d+)\s+skipped\b/gi)].some((match) => Number(match[1]) > 0);
  const passed = [...text.matchAll(/\b(\d+)\s+passed\b/gi)].some((match) => Number(match[1]) > 0);
  if (skipped) throw new Error("Playwright journey reported skipped tests");
  if (!passed) throw new Error("Playwright journey reported zero completed tests");
}

export function semanticTestCommand(file) {
  return ["node", "--import", "tsx", "--test", "--test-reporter=tap", file];
}

export async function cleanupGeneratedMediaRoot(value) {
  const resolved = resolve(value ?? "");
  if (dirname(resolved) !== resolve(tmpdir()) || !/^blog-x-media-verify-[A-Za-z0-9_-]{6,64}$/.test(basename(resolved))) {
    throw new Error("cleanup target is not an exact generated media root");
  }
  await rm(resolved, { recursive: true, force: true });
}

export function redactText(text, secrets = []) {
  let redacted = String(text);
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  redacted = redacted
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/((?:set-)?cookie\s*:\s*[^\n]*blog_x_session=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/(blog_x_session=)[^;\s]+/gi, "$1[REDACTED]");
  return redacted;
}

function generatedNamespace() {
  return validateNamespace(`blogxverify_${randomBytes(6).toString("hex")}`);
}

function generatedRestoreNamespace() {
  return `blogxrestore_${randomBytes(6).toString("hex")}`;
}

async function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("unable to allocate a local verification port"));
      server.close(() => accept(address.port));
    });
  });
}

function command(commandName, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(commandName, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; options.onOutput?.(String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr += chunk; options.onOutput?.(String(chunk)); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = { code: code ?? 1, signal, stdout, stderr, combined: `${stdout}${stderr}` };
      if (result.code === 0 || options.allowFailure) accept(result);
      else reject(Object.assign(new Error(`${commandName} exited with ${result.code}`), { result }));
    });
  });
}

function composeEnvironment(context) {
  return {
    ...process.env,
    BLOG_X_API_IMAGE: apiImage,
    BLOG_X_WEB_IMAGE: webImage,
    BLOG_X_POSTGRES_DB: context.database,
    BLOG_X_POSTGRES_USER: "blog_x",
    BLOG_X_WEB_PORT: String(context.webPort),
    BLOG_X_PUBLIC_ORIGIN: context.publicOrigin,
  };
}

function composeArgs(context, ...args) {
  return ["-p", context.namespace, "-f", composeFile, ...args];
}

async function runStep(context, label, commandName, args, options = {}) {
  process.stdout.write(`[local-verify] ${label}\n`);
  try {
    const result = await command(commandName, args, { ...options, env: options.env ?? composeEnvironment(context) });
    context.logs.push(result.combined);
    return result;
  } catch (error) {
    const output = error?.result?.combined ?? error?.message ?? String(error);
    throw new Error(`${label} failed\n${redactText(output, context.secrets)}`);
  }
}

async function compose(context, label, ...args) {
  return runStep(context, label, "docker-compose", composeArgs(context, ...args));
}

async function waitForHttp(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* service is still starting */ }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

function psqlArgs(context, query) {
  return ["exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", context.database, "-Atqc", query];
}

async function inspectSchema(context) {
  const result = await compose(context, "inspect migration ledger and schema", ...psqlArgs(context, [
    "select (select count(*) from blog_x_schema_ledger),",
    "(select migration_count from blog_x_schema_ledger where scope = 'phase1'),",
    "(select count(*) from pg_tables where schemaname = 'public' and tablename = any(array['administrators','articles','sessions','categories','tags','article_tags','site_pages','media'])),",
    "(select count(*) from pg_constraint where conname = any(array['site_pages_key_about_check','site_pages_status_check','articles_cover_alt_check'])),",
    "(select count(*) from pg_indexes where schemaname = 'public' and indexname = any(array['taxonomy_category_slug_unique','taxonomy_tag_slug_unique','article_tags_article_tag_unique','site_pages_key_unique','media_source_key_unique','media_derivative_key_unique']));",
  ].join(" ")));
  const values = result.stdout.trim().split("|").map(Number);
  if (values.length !== 5 || values[0] !== 1 || values[1] !== 6 || values[2] !== 8 || values[3] !== 3 || values[4] !== 6) {
    throw new Error(`unexpected schema inspection result: ${result.stdout.trim()}`);
  }
}

async function runMigration(context, label) {
  return compose(context, label, "run", "--rm", "-T", "-e", `DATABASE_URL=${context.databaseUrl}`, "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate");
}

async function interruptionCheck(context) {
  const volume = `${context.namespace}_postgres-data`;
  const container = `${context.namespace}_migration_interrupt`;
  const before = await runStep(context, "record verification volume", "docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume]);
  const started = await compose(context, "start interruptible migration", "run", "-d", "--name", container,
    "-e", `DATABASE_URL=${context.databaseUrl}`, "-e", "BLOG_X_MIGRATION_HOLD_MS=30000",
    "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate");
  if (!started.stdout.trim()) throw new Error("interruptible migration container did not start");
  let marker = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const logs = await command("docker", ["logs", container], { allowFailure: true });
    if (logs.combined.includes("migration lock acquired")) { marker = true; break; }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  if (!marker) throw new Error("migration did not reach the advisory-lock checkpoint");
  await runStep(context, "interrupt migration process", "docker", ["kill", container]);
  await runStep(context, "remove interrupted migration container", "docker", ["rm", "-f", container]);
  await Promise.all([runMigration(context, "retry migration A"), runMigration(context, "retry migration B")]);
  await inspectSchema(context);
  const after = await runStep(context, "confirm verification volume identity", "docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume]);
  if (before.stdout.trim() !== after.stdout.trim()) throw new Error("interruption recovery replaced the PostgreSQL volume");
}

async function migrationRetryPreservation(context) {
  const slug = `${context.runId}-migration-retained`;
  await compose(context, "insert migration retry sentinel", ...psqlArgs(context,
    `insert into articles (title, slug, markdown, status) values ('Migration retry sentinel', '${slug}', 'retained source', 'draft');`));
  await Promise.all([runMigration(context, "preservation retry migration A"), runMigration(context, "preservation retry migration B")]);
  await inspectSchema(context);
  const retained = await compose(context, "confirm migration retry preserved article", ...psqlArgs(context,
    `select count(*) from articles where slug = '${slug}' and markdown = 'retained source';`));
  if (retained.stdout.trim() !== "1") throw new Error("migration retry did not preserve the existing article");
}

async function assertCleanLogs(context) {
  const result = await compose(context, "capture service logs", "logs", "--no-color", "postgres", "api", "web");
  const raw = `${context.logs.join("")}\n${result.combined}`;
  for (const secret of context.secrets) {
    if (secret && raw.includes(secret)) throw new Error("captured logs contain generated secret material");
  }
  if (/blog_x_session=[^;\s\[]/i.test(raw)) throw new Error("captured logs contain a session cookie value");
}

async function seed(context) {
  await compose(context, "seed generated administrator", "exec", "-T",
    "-e", `DATABASE_URL=${context.databaseUrl}`,
    "-e", `ADMIN_USERNAME=${context.username}`,
    "-e", `ADMIN_PASSWORD=${context.password}`,
    "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:seed");
}

async function resetAcceptanceData(context, label) {
  await compose(context, label, "exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", context.database,
    "-c", "truncate table sessions, article_tags, articles, categories, tags, site_pages, media, administrators cascade");
  await seed(context);
}

async function runDatabaseSuite(context, variable, file) {
  const result = await compose(context, `run ${file}`, "exec", "-T",
    "-e", `DATABASE_URL=${context.databaseUrl}`,
    "-e", `${variable}=${context.databaseUrl}`,
    "api", ...semanticTestCommand(file));
  assertSemanticTap(result.combined);
}

function startManaged(context, label, commandName, args, env) {
  process.stdout.write(`[local-verify] ${label}\n`);
  const child = spawn(commandName, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const collect = (chunk) => { context.logs.push(String(chunk)); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  context.children.push(child);
  return child;
}

async function stopManaged(context) {
  const children = context.children.splice(0).reverse();
  await Promise.all(children.map((child) => new Promise((accept) => {
    if (child.exitCode !== null || child.signalCode !== null) return accept();
    child.once("close", accept);
    child.kill("SIGTERM");
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 3_000);
    timer.unref();
  })));
}

async function runFailureRecoveryJourney(context) {
  const [fixturePort, errorWebPort] = await Promise.all([freePort(), freePort()]);
  const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
  const errorWebOrigin = `http://127.0.0.1:${errorWebPort}`;
  startManaged(context, "start local unavailable-response fixture", process.execPath,
    ["--import", "tsx", "apps/web/e2e/public-error-fixture.ts"], { ...process.env, ERROR_FIXTURE_PORT: String(fixturePort) });
  await waitForHttp(`${fixtureOrigin}/health`);
  startManaged(context, "start local recovery Web", process.execPath,
    ["apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", String(errorWebPort)],
    { ...process.env, INTERNAL_API_ORIGIN: fixtureOrigin, PUBLIC_ORIGIN: errorWebOrigin });
  await waitForHttp(errorWebOrigin);
  await runStep(context, "run Phase 2 unavailable/retry browser journey", "corepack",
    ["pnpm", "exec", "playwright", "test", "apps/web/e2e/public-errors.spec.ts", "--workers=1"],
    { env: { ...process.env, E2E_ERROR_WEB_ORIGIN: errorWebOrigin, E2E_ERROR_FIXTURE_ORIGIN: fixtureOrigin } });
  await stopManaged(context);
}

async function fullPhaseChecks(context, phase2Full) {
  await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
  await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin } });
  await runStep(context, "run operations safety fixtures", "corepack", ["pnpm", "test:ops"], { env: process.env });
  const databaseSuites = [
    ["AUTH_TEST_DATABASE_URL", "apps/api/test/auth-session.test.ts"],
    ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
    ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
    ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
    ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
    ...(phase2Full ? [
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/taxonomy.test.ts"],
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/pages-archive.test.ts"],
      ["AUTH_TEST_DATABASE_URL", "apps/api/test/media.test.ts"],
      ["PHASE2_TEST_DATABASE_URL", "apps/api/test/phase2-public-visibility.test.ts"],
    ] : []),
  ];
  for (const [variable, file] of databaseSuites) {
    await runDatabaseSuite(context, variable, file);
  }
  await resetAcceptanceData(context, "clear Phase acceptance data");
  const playwrightEnvironment = {
    ...process.env,
    E2E_WEB_ORIGIN: context.webOrigin,
    E2E_ADMIN_USERNAME: context.username,
    E2E_ADMIN_PASSWORD: context.password,
    E2E_RUN_ID: context.runId,
  };
  const journey = phase2Full ? "apps/web/e2e/phase2-reading.spec.ts" : "apps/web/e2e/phase1-publishing.spec.ts";
  await runStep(context, `run whole ${phase2Full ? "Phase 2" : "Phase 1"} browser journey`, "corepack", ["pnpm", "exec", "playwright", "test", journey, "--workers=1"], { env: playwrightEnvironment });
  if (phase2Full) await runFailureRecoveryJourney(context);
  if (!phase2Full) {
    const retainedSlug = `${context.runId}-changed`;
    const retained = await compose(context, "verify soft-deleted source retention", ...psqlArgs(context,
      `select count(*) from articles where slug = '${retainedSlug}' and deleted_at is not null and length(markdown) > 0;`));
    if (retained.stdout.trim() !== "1") throw new Error("soft-deleted source/slug retention diagnostic failed");
  }
}

async function runPhase3Checks(context, mode) {
  const selection = phase3Selection(mode);
  for (const [variable, file] of selection.databaseSuites) await runDatabaseSuite(context, variable, file);
  if (selection.webSuites.length) await resetAcceptanceData(context, "clear Phase 3 browser acceptance data");
  for (const file of selection.webSuites) {
    if (file.endsWith(".test.ts")) {
      const result = await runStep(context, `run ${file}`, "corepack", ["pnpm", "exec", "tsx", "--test", "--test-reporter=tap", file], { env: process.env });
      assertSemanticTap(result.combined);
      continue;
    }
    const result = await runStep(context, `run ${file}`, "corepack", ["pnpm", "exec", "playwright", "test", file, "--workers=1"], {
      env: {
        ...process.env,
        E2E_WEB_ORIGIN: context.publicOrigin,
        E2E_ADMIN_USERNAME: context.username,
        E2E_ADMIN_PASSWORD: context.password,
        E2E_RUN_ID: context.runId,
      },
    });
    assertPlaywrightJourney(result.combined);
  }
}

async function runPhase4SecurityChecks(context) {
  const selection = phase4Selection("security");
  await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
  await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: { ...process.env, PUBLIC_ORIGIN: context.publicOrigin } });
  await runStep(context, "run operations safety fixtures", "corepack", ["pnpm", "test:ops"], { env: process.env });
  for (const [variable, file] of selection.databaseSuites) await runDatabaseSuite(context, variable, file);
  for (const file of selection.apiSuites) await runDatabaseSuite(context, "AUTH_TEST_DATABASE_URL", file);
}

async function preflightCachedImages(context) {
  await runStep(context, "preflight exact cached base images", "docker", ["image", "inspect", "node:24.15.0-alpine", "postgres:18-alpine"]);
}

async function exerciseApiRecovery(context) {
  const postgresVolume = `${context.namespace}_postgres-data`;
  const beforeVolumes = await Promise.all([postgresVolume, context.mediaVolume].map((volume) => command("docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume])));
  const apiContainer = await compose(context, "resolve exact API container", "ps", "-q", "api");
  const containerId = apiContainer.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("exact API container could not be resolved");
  const before = await runStep(context, "record API restart count", "docker", ["inspect", "--format", "{{.RestartCount}}", containerId]);
  // Docker activates restart policies only after a container has stayed up for
  // roughly ten seconds; make that daemon contract explicit before fault injection.
  await new Promise((accept) => setTimeout(accept, 10_000));
  const processList = await runStep(context, "resolve actual API process", "docker", ["exec", containerId, "ps", "-o", "pid,ppid,args"]);
  const applicationLine = processList.stdout.split(/\r?\n/).find((line) => line.includes("src/app.ts") && line.includes("node --require"));
  const applicationPid = applicationLine?.trim().split(/\s+/, 1)[0];
  if (!applicationPid || !/^\d+$/.test(applicationPid) || applicationPid === "1") throw new Error("actual API application process could not be resolved");
  await runStep(context, "terminate generated API process", "docker", ["exec", containerId, "kill", "-KILL", applicationPid]);
  const deadline = Date.now() + 30_000;
  let recovered = false;
  let restartCount = Number(before.stdout.trim());
  while (Date.now() < deadline) {
    try {
      const current = await command("docker", ["inspect", "--format", "{{.RestartCount}}", containerId], { allowFailure: true });
      restartCount = Number(current.stdout.trim());
      if (restartCount > Number(before.stdout.trim())) {
        const response = await fetch(`${context.webOrigin}/api/health`);
        if (response.ok) { recovered = true; break; }
      }
    } catch { /* bounded recovery is still in progress */ }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  if (!recovered) throw new Error("generated API did not recover through the Web origin within 30 seconds");
  process.stdout.write(`[local-verify] confirm API restart count ${restartCount}\n`);
  await compose(context, "wait for recovered service health", "up", "-d", "--wait", "api", "web");
  const afterVolumes = await Promise.all([postgresVolume, context.mediaVolume].map((volume) => command("docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", volume])));
  if (beforeVolumes.some((value, index) => value.stdout.trim() !== afterVolumes[index].stdout.trim())) throw new Error("API recovery replaced a persistent volume");
}

async function runPhase4OperationsChecks(context) {
  const selection = phase4Selection("operations");
  process.stdout.write("[local-verify] inspect effective operations config\n");
  const effective = await command("docker-compose", composeArgs(context, "config", "--format", "json"), { env: composeEnvironment(context) });
  if (!effective.stdout.includes('"restart": "unless-stopped"') || !effective.stdout.includes('"driver": "local"')) throw new Error("effective operations config is missing lifecycle or log policy");
  for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
  }
  await exerciseApiRecovery(context);
  const status = await runStep(context, "run redacted local operator status", "node", ["scripts/ops-status.mjs", `--project=${context.namespace}`, `--web-origin=${context.webOrigin}`]);
  if (!status.stdout.includes("BLOG X STATUS PASS") || !status.stdout.includes("TLS NOT_EVALUATED")) throw new Error("local operator status did not pass with TLS not evaluated");
  const backupRoot = await mkdtemp(resolve(tmpdir(), "blog-x-backup-verify-"));
  try {
    process.stdout.write("[local-verify] create complete atomic backup set\n");
    const backup = await createBackupSet({
      format: "blog-x-backup-policy", version: 1, destination_root: backupRoot,
      off_host_destination_ref: "external:off-host-destination", retention_decision_ref: "external:retention-decision",
      encryption_key_ref: "external:encryption-authority", alert_recipient_ref: "external:alert-recipient",
      secret_authority_ref: "external:service-secret-authority", schedule: "daily",
      compose_project: context.namespace, database_name: context.database, media_root: "/var/lib/blog-x/media",
      config_inventory_sources: ["compose.yaml", "ops/production-config.names.json", "ops/topology-policy.json"],
    }, { env: composeEnvironment(context) });
    await verifyBackupSet(backup.finalRoot);
    process.stdout.write(`[local-verify] ${backup.message}\n`);
  } finally {
    await cleanupGeneratedBackupRoot(backupRoot);
  }
}

function generatedBackupPolicy(context, backupRoot) {
  return {
    format: "blog-x-backup-policy", version: 1, destination_root: backupRoot,
    off_host_destination_ref: "external:off-host-destination", retention_decision_ref: "external:retention-decision",
    encryption_key_ref: "external:encryption-authority", alert_recipient_ref: "external:alert-recipient",
    secret_authority_ref: "external:service-secret-authority", schedule: "daily",
    compose_project: context.namespace, database_name: context.database, media_root: "/var/lib/blog-x/media",
    config_inventory_sources: ["compose.yaml", "ops/production-config.names.json", "ops/topology-policy.json"],
  };
}

async function seedRestoreFixture(context) {
  await resetAcceptanceData(context, "clear restore source fixture data");
  const mediaId = "44444444-4444-4444-8444-444444444444";
  const categoryId = "11111111-1111-4111-8111-111111111111";
  const tagId = "22222222-2222-4222-8222-222222222222";
  const articleIds = [
    "33333333-3333-4333-8333-333333333331", "33333333-3333-4333-8333-333333333332",
    "33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333334",
    "33333333-3333-4333-8333-333333333335",
  ];
  const publishedSlug = `${context.runId}-restore-published`;
  const hiddenSlugs = ["draft", "offline", "deleted", "null-publication"].map((state) => `${context.runId}-restore-${state}`);
  const publishedTitle = `恢复演练公开文章 ${context.runId}`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const mediaRoot = await mkdtemp(resolve(tmpdir(), "blog-x-media-verify-"));
  try {
    const sourcePath = resolve(mediaRoot, `${mediaId}.bin`);
    const derivativePath = resolve(mediaRoot, `${mediaId}.png`);
    await writeFile(sourcePath, png);
    await writeFile(derivativePath, png);
    const api = await compose(context, "resolve source API for media fixture", "ps", "-q", "api");
    const containerId = api.stdout.trim();
    if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("source API container is unavailable for restore fixture");
    await runStep(context, "create source media fixture directories", "docker", ["exec", containerId, "mkdir", "-p", "/var/lib/blog-x/media/source", "/var/lib/blog-x/media/derivative"]);
    await runStep(context, "copy source media fixture", "docker", ["cp", sourcePath, `${containerId}:/var/lib/blog-x/media/source/${mediaId}.bin`]);
    await runStep(context, "copy derivative media fixture", "docker", ["cp", derivativePath, `${containerId}:/var/lib/blog-x/media/derivative/${mediaId}.png`]);
  } finally {
    await cleanupGeneratedMediaRoot(mediaRoot);
  }
  const timestamp = "2026-08-09T12:00:00.000Z";
  const query = [
    `insert into categories (id,name,slug,created_at,updated_at) values ('${categoryId}','恢复分类','restore-category','${timestamp}','${timestamp}');`,
    `insert into tags (id,name,slug,created_at,updated_at) values ('${tagId}','恢复标签','restore-tag','${timestamp}','${timestamp}');`,
    `insert into media (id,source_key,derivative_key,source_mime_type,derivative_mime_type,source_bytes,derivative_bytes,width,height,created_at) values ('${mediaId}','source/${mediaId}.bin','derivative/${mediaId}.png','image/png','image/png',${png.length},${png.length},1,1,'${timestamp}');`,
    `insert into articles (id,title,summary,slug,markdown,seo_description,status,published_at,created_at,updated_at,category_id,cover_media_id,cover_alt,cover_decorative) values ('${articleIds[0]}','${publishedTitle}','完整恢复后的公开摘要','${publishedSlug}','# 恢复正文\\n\\n![恢复图片](/media/${mediaId})','恢复演练','published','${timestamp}','${timestamp}','${timestamp}','${categoryId}','${mediaId}','恢复演练封面',false);`,
    `insert into articles (id,title,summary,slug,markdown,status,created_at,updated_at,category_id) values ('${articleIds[1]}','恢复草稿','draft-secret','${hiddenSlugs[0]}','# draft-secret','draft','${timestamp}','${timestamp}','${categoryId}');`,
    `insert into articles (id,title,summary,slug,markdown,status,published_at,created_at,updated_at) values ('${articleIds[2]}','恢复下线','offline-secret','${hiddenSlugs[1]}','# offline-secret','unpublished','${timestamp}','${timestamp}','${timestamp}');`,
    `insert into articles (id,title,summary,slug,markdown,status,published_at,deleted_at,created_at,updated_at) values ('${articleIds[3]}','恢复删除','deleted-secret','${hiddenSlugs[2]}','# deleted-secret','published','${timestamp}','${timestamp}','${timestamp}','${timestamp}');`,
    `insert into articles (id,title,summary,slug,markdown,status,published_at,created_at,updated_at) values ('${articleIds[4]}','恢复空发布时间','null-secret','${hiddenSlugs[3]}','# null-secret','published',null,'${timestamp}','${timestamp}');`,
    `insert into article_tags (article_id,tag_id) values ('${articleIds[0]}','${tagId}'),('${articleIds[1]}','${tagId}');`,
    `insert into site_pages (id,key,title,markdown,status,version,created_at,updated_at) values ('55555555-5555-4555-8555-555555555555','about','恢复后的关于页','# 关于恢复','published','${timestamp}','${timestamp}','${timestamp}');`,
  ].join(" ");
  await compose(context, "seed retained restore authority fixture", ...psqlArgs(context, query));
  return { mediaId, publishedSlug, publishedTitle, hiddenSlugs };
}

async function runPhase4RestoreChecks(context) {
  const selection = phase4Selection("restore");
  for (const file of selection.nodeSuites) {
    const result = await runStep(context, `run ${file}`, "node", ["--test", "--test-reporter=tap", file], { env: process.env });
    assertSemanticTap(result.combined);
  }
  const fixture = await seedRestoreFixture(context);
  const backupRoot = await mkdtemp(resolve(tmpdir(), "blog-x-backup-verify-"));
  const restoreNamespace = generatedRestoreNamespace();
  const suffix = restoreNamespace.slice("blogxrestore_".length);
  const restorePort = await freePort();
  const restoreContext = {
    namespace: restoreNamespace, database: `blog_x_restore_${suffix}`, webPort: restorePort,
    publicOrigin: `http://127.0.0.1:${restorePort}`, webOrigin: `http://127.0.0.1:${restorePort}`,
    mediaVolume: `${restoreNamespace}_media-data`, logs: context.logs, secrets: context.secrets,
  };
  const restoreRoot = resolve(tmpdir(), `blog-x-restore-verify-${randomBytes(6).toString("hex")}`);
  try {
    process.stdout.write("[local-verify] create source backup for isolated restore\n");
    const backup = await createBackupSet(generatedBackupPolicy(context, backupRoot), { env: composeEnvironment(context) });
    await verifyBackupSet(backup.finalRoot);
    process.stdout.write("[local-verify] preflight and restore into generated namespace\n");
    const restored = await restoreBackupSet({
      backupRoot: backup.finalRoot, restoreRoot, namespace: restoreContext.namespace,
      database: restoreContext.database, mediaVolume: restoreContext.mediaVolume, webOrigin: restoreContext.webOrigin,
    }, { env: composeEnvironment(restoreContext) });
    if (restored.message !== `RESTORE READY ${restoreContext.namespace}`) throw new Error("restore did not report its exact generated namespace");
    await waitForHttp(restoreContext.webOrigin);
    const api = await compose(restoreContext, "resolve restored API for authority comparison", "ps", "-q", "api");
    const containerId = api.stdout.trim();
    if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("restored API container is unavailable");
    await runStep(context, "create restored comparison root", "docker", ["exec", containerId, "mkdir", "-p", "/tmp/blog-x-restore-expected"]);
    await runStep(context, "copy immutable backup evidence for comparison", "docker", ["cp", `${backup.finalRoot}/.`, `${containerId}:/tmp/blog-x-restore-expected`]);
    const authority = await compose(restoreContext, `run ${selection.databaseSuite}`, "exec", "-T",
      "-e", `DATABASE_URL=postgres://blog_x@postgres:5432/${restoreContext.database}`,
      "-e", `BACKUP_RESTORE_TEST_DATABASE_URL=postgres://blog_x@postgres:5432/${restoreContext.database}`,
      "-e", "BACKUP_RESTORE_EXPECTED_ROOT=/tmp/blog-x-restore-expected", "-e", "MEDIA_ROOT=/var/lib/blog-x/media",
      "api", ...semanticTestCommand(selection.databaseSuite));
    assertSemanticTap(authority.combined);
    const browser = await runStep(context, `run ${selection.browserSuite}`, "corepack",
      ["pnpm", "exec", "playwright", "test", selection.browserSuite, "--workers=1"], {
        env: { ...process.env, E2E_WEB_ORIGIN: restoreContext.webOrigin, E2E_RESTORE_WEB_ORIGIN: restoreContext.webOrigin,
          E2E_RESTORE_PUBLISHED_SLUG: fixture.publishedSlug, E2E_RESTORE_PUBLISHED_TITLE: fixture.publishedTitle,
          E2E_RESTORE_MEDIA_ID: fixture.mediaId, E2E_RESTORE_HIDDEN_SLUGS: fixture.hiddenSlugs.join(",") },
      });
    assertPlaywrightJourney(browser.combined);
    await verifyBackupSet(backup.finalRoot);
  } finally {
    await command("docker-compose", composeArgs(restoreContext, "down", "--remove-orphans", "--volumes"), { env: composeEnvironment(restoreContext), allowFailure: true });
    await cleanupGeneratedRestoreRoot(restoreRoot);
    await cleanupGeneratedBackupRoot(backupRoot);
  }
}

async function runSingle(options) {
  const namespace = validateNamespace(options.namespace ?? generatedNamespace());
  const database = validateDatabaseName(`blog_x_${namespace.slice("blogxverify_".length)}`, namespace);
  const webPort = options.webPort ?? await freePort();
  const phaseLabel = options.phase4Mode ? "phase4-" : options.phase3Mode ? "phase3-" : options.phase2Full ? "phase2-" : "phase1-";
  const runId = namespace.replace("blogxverify_", phaseLabel);
  const publicOrigin = validateLoopbackHttpOrigin(`http://127.0.0.1:${webPort}`);
  const context = {
    namespace,
    database,
    webPort,
    runId,
    webOrigin: publicOrigin,
    publicOrigin,
    internalApiOrigin: "http://api:3001",
    databaseUrl: `postgres://blog_x@postgres:5432/${database}`,
    username: `admin-${runId}`,
    password: randomBytes(24).toString("base64url"),
    mediaVolume: validateMediaVolume(`${namespace}_media-data`, namespace),
    logs: [],
    secrets: [],
    children: [],
  };
  context.secrets.push(context.password, context.databaseUrl);
  if (context.publicOrigin === context.internalApiOrigin) throw new Error("public and internal API origins must remain separate");

  try {
    if (["operations", "restore"].includes(options.phase4Mode) && !options.skipBuild) await preflightCachedImages(context);
    if (!options.skipBuild) await compose(context, "build local API and Web images", "build", "api", "web");
    await compose(context, "start isolated PostgreSQL", "up", "-d", "--wait", "postgres");
    if (options.interruptionCheck) await interruptionCheck(context);
    else {
      await Promise.all([runMigration(context, "concurrent migration A"), runMigration(context, "concurrent migration B")]);
      await inspectSchema(context);
    }
    await migrationRetryPreservation(context);
    await compose(context, "start isolated API and Web", "up", "-d", "--wait", "api", "web");
    await runStep(context, "confirm exact generated media volume", "docker", ["volume", "inspect", context.mediaVolume]);
    await waitForHttp(context.webOrigin);
    await compose(context, "verify active schema", "exec", "-T", "-e", `DATABASE_URL=${context.databaseUrl}`,
      "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:schema:verify");
    await seed(context);
    if (options.phase4Mode === "security") {
      await runPhase4SecurityChecks(context);
    }
    else if (options.phase4Mode === "operations") {
      await runPhase4OperationsChecks(context);
    }
    else if (options.phase4Mode === "restore") {
      await runPhase4RestoreChecks(context);
    }
    else if (options.phase3Mode === "full") {
      await fullPhaseChecks(context, true);
      await runPhase3Checks(context, "full");
    }
    else if (options.phase3Mode) await runPhase3Checks(context, options.phase3Mode);
    else if (options.fullPhase) await fullPhaseChecks(context, options.phase2Full);
    await assertCleanLogs(context);
    process.stdout.write(`[local-verify] ${namespace} passed\n`);
  } finally {
    await stopManaged(context);
    validateNamespace(context.namespace);
    validateDatabaseName(context.database, context.namespace);
    validateMediaVolume(context.mediaVolume, context.namespace);
    await command("docker-compose", composeArgs(context, "down", "--remove-orphans", "--volumes"), {
      env: composeEnvironment(context), allowFailure: true,
    });
  }
}

async function parallelCheck(options) {
  const first = generatedNamespace();
  const second = generatedNamespace();
  if (first === second) throw new Error("parallel verification namespaces collided");
  const [firstPort, secondPort] = await Promise.all([freePort(), freePort()]);
  const childMode = options.phase4Mode === "restore" ? "--phase4-restore" : "--infrastructure-only";
  const child = (namespace, webPort) => command(process.execPath, [scriptPath, "--internal-run", childMode, "--skip-build", `--namespace=${namespace}`, `--web-port=${webPort}`], { env: process.env });
  process.stdout.write("[local-verify] run two isolated namespaces in parallel\n");
  const results = await Promise.all([child(first, firstPort), child(second, secondPort)]);
  if (!results[0].stdout.includes(`${first} passed`) || !results[1].stdout.includes(`${second} passed`)) {
    throw new Error("parallel verification did not preserve namespace identity");
  }
}

function optionValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const phase3Modes = ["api", "metadata", "full", "export-api", "export-browser"].filter((mode) => flags.has(`--phase3-${mode}`));
  const phase4Modes = ["security", "operations", "restore"].filter((mode) => flags.has(`--phase4-${mode}`));
  if (phase3Modes.length + phase4Modes.length > 1) throw new Error("choose at most one Phase 3 or Phase 4 verification selection");
  const options = {
    namespace: optionValue("namespace"),
    webPort: optionValue("web-port") ? Number(optionValue("web-port")) : undefined,
    phase2Full: flags.has("--phase2-full"),
    phase3Mode: phase3Modes[0],
    phase4Mode: phase4Modes[0],
    fullPhase: !phase4Modes.length && (flags.has("--full-phase") || flags.has("--phase2-full") || (!flags.has("--infrastructure-only") && !flags.has("--internal-run"))),
    interruptionCheck: flags.has("--interruption-check"),
    parallelCheck: flags.has("--parallel-check"),
    skipBuild: flags.has("--skip-build"),
  };

  await command("docker", ["info"]);
  await command("docker-compose", ["version"]);
  const boundaryIssues = await auditRepository(root);
  if (boundaryIssues.length) throw new Error(boundaryIssues.map((finding) => `${finding.code}: ${finding.path}`).join("\n"));
  await runSingle(options);
  if (options.parallelCheck) await parallelCheck(options);
  process.stdout.write("[local-verify] all requested checks passed\n");
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(redactText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
