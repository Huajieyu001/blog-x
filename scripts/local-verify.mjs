import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditRepository } from "./check-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const composeFile = resolve(root, "compose.yaml");
const apiImage = "blog-x-api-verify:phase1";
const webImage = "blog-x-web-verify:phase1";

export function validateNamespace(value) {
  if (!/^blogxverify_[a-z0-9]{8,32}$/.test(value ?? "")) {
    throw new Error("verification namespace must match blogxverify_[a-z0-9]{8,32}");
  }
  return value;
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
    "(select count(*) from pg_tables where schemaname = 'public' and tablename = any(array['administrators','articles','sessions']));",
  ].join(" ")));
  const values = result.stdout.trim().split("|").map(Number);
  if (values.length !== 3 || values[0] !== 1 || values[1] !== 2 || values[2] !== 3) {
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

async function runDatabaseSuite(context, variable, file) {
  await compose(context, `run ${file}`, "exec", "-T",
    "-e", `DATABASE_URL=${context.databaseUrl}`,
    "-e", `${variable}=${context.databaseUrl}`,
    "api", "node", "--import", "tsx", "--test", file);
}

async function fullPhaseChecks(context) {
  await runStep(context, "typecheck workspace", "corepack", ["pnpm", "-r", "typecheck"], { env: process.env });
  await runStep(context, "build workspace", "corepack", ["pnpm", "-r", "build"], { env: process.env });
  await runStep(context, "run operations safety fixtures", "corepack", ["pnpm", "test:ops"], { env: process.env });
  for (const [variable, file] of [
    ["AUTH_TEST_DATABASE_URL", "apps/api/test/auth-session.test.ts"],
    ["ARTICLE_TEST_DATABASE_URL", "apps/api/test/article-draft-preview.test.ts"],
    ["LIFECYCLE_TEST_DATABASE_URL", "apps/api/test/article-lifecycle.test.ts"],
    ["PUBLIC_LIST_TEST_DATABASE_URL", "apps/api/test/public-list.test.ts"],
    ["PUBLIC_VISIBILITY_TEST_DATABASE_URL", "apps/api/test/public-visibility.test.ts"],
  ]) {
    await runDatabaseSuite(context, variable, file);
  }
  await compose(context, "clear acceptance data", "exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", context.database,
    "-c", "truncate table sessions, articles, administrators cascade");
  await seed(context);
  const playwrightEnvironment = {
    ...process.env,
    E2E_WEB_ORIGIN: context.webOrigin,
    E2E_ADMIN_USERNAME: context.username,
    E2E_ADMIN_PASSWORD: context.password,
    E2E_RUN_ID: context.runId,
  };
  await runStep(context, "run whole Phase 1 browser journey", "corepack", ["pnpm", "exec", "playwright", "test", "apps/web/e2e/phase1-publishing.spec.ts", "--workers=1"], { env: playwrightEnvironment });
  const retainedSlug = `${context.runId}-changed`;
  const retained = await compose(context, "verify soft-deleted source retention", ...psqlArgs(context,
    `select count(*) from articles where slug = '${retainedSlug}' and deleted_at is not null and length(markdown) > 0;`));
  if (retained.stdout.trim() !== "1") throw new Error("soft-deleted source/slug retention diagnostic failed");
}

async function runSingle(options) {
  const namespace = validateNamespace(options.namespace ?? generatedNamespace());
  const database = `blog_x_${namespace.slice("blogxverify_".length)}`;
  const webPort = options.webPort ?? await freePort();
  const runId = namespace.replace("blogxverify_", "phase1-");
  const context = {
    namespace,
    database,
    webPort,
    runId,
    webOrigin: `http://127.0.0.1:${webPort}`,
    databaseUrl: `postgres://blog_x@postgres:5432/${database}`,
    username: `admin-${runId}`,
    password: randomBytes(24).toString("base64url"),
    logs: [],
    secrets: [],
  };
  context.secrets.push(context.password, context.databaseUrl);

  try {
    if (!options.skipBuild) await compose(context, "build local API and Web images", "build", "api", "web");
    await compose(context, "start isolated PostgreSQL", "up", "-d", "--wait", "postgres");
    if (options.interruptionCheck) await interruptionCheck(context);
    else {
      await Promise.all([runMigration(context, "concurrent migration A"), runMigration(context, "concurrent migration B")]);
      await inspectSchema(context);
    }
    await compose(context, "start isolated API and Web", "up", "-d", "--wait", "api", "web");
    await waitForHttp(context.webOrigin);
    await compose(context, "verify active schema", "exec", "-T", "-e", `DATABASE_URL=${context.databaseUrl}`,
      "api", "corepack", "pnpm", "--filter", "@blog-x/api", "db:schema:verify");
    await seed(context);
    if (options.fullPhase) await fullPhaseChecks(context);
    await assertCleanLogs(context);
    process.stdout.write(`[local-verify] ${namespace} passed\n`);
  } finally {
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
  const options = {
    namespace: optionValue("namespace"),
    webPort: optionValue("web-port") ? Number(optionValue("web-port")) : undefined,
    fullPhase: flags.has("--full-phase") || (!flags.has("--infrastructure-only") && !flags.has("--internal-run")),
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
