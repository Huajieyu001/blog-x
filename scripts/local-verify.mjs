import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { auditRepository } from "./check-boundaries.mjs";

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
    full: { databaseSuites: [api], webSuites: [metadata, browser] },
    "export-api": { databaseSuites: [exportApi], webSuites: [] },
    "export-browser": { databaseSuites: [], webSuites: [browser] },
  };
  const selection = selections[mode];
  if (!selection) throw new Error(`Phase 3 selection is not recognized: ${mode}`);
  return selection;
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

async function runSingle(options) {
  const namespace = validateNamespace(options.namespace ?? generatedNamespace());
  const database = validateDatabaseName(`blog_x_${namespace.slice("blogxverify_".length)}`, namespace);
  const webPort = options.webPort ?? await freePort();
  const phaseLabel = options.phase3Mode ? "phase3-" : options.phase2Full ? "phase2-" : "phase1-";
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
    if (options.phase3Mode === "full") {
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
  const child = (namespace, webPort) => command(process.execPath, [scriptPath, "--internal-run", "--infrastructure-only", "--skip-build", `--namespace=${namespace}`, `--web-port=${webPort}`], { env: process.env });
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
  if (phase3Modes.length > 1) throw new Error("choose at most one Phase 3 verification selection");
  const options = {
    namespace: optionValue("namespace"),
    webPort: optionValue("web-port") ? Number(optionValue("web-port")) : undefined,
    phase2Full: flags.has("--phase2-full"),
    phase3Mode: phase3Modes[0],
    fullPhase: flags.has("--full-phase") || flags.has("--phase2-full") || (!flags.has("--infrastructure-only") && !flags.has("--internal-run")),
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
