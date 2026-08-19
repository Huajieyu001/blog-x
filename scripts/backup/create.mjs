import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBackupPolicy } from "./policy.mjs";
import { createManifest, hashFile, verifyBackupSet } from "./manifest.mjs";
import { assertNotLink, validateBackupSetId } from "./paths.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = resolve(repositoryRoot, "compose.yaml");

function command(name, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(name, args, { cwd: repositoryRoot, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? accept({ stdout: Buffer.concat(chunks), stderr }) : reject(new Error(`${name} backup command failed`)));
  });
}

async function defaultCollect(stage, policy, dependencies) {
  const run = dependencies.run ?? command;
  const invoke = (name, args) => run(name, args, { env: dependencies.env ?? process.env });
  const compose = (...args) => invoke("docker-compose", ["-p", policy.compose_project, "-f", composeFile, ...args]);
  const dump = await compose("exec", "-T", "postgres", "pg_dump", "-U", "blog_x", "-d", policy.database_name, "-Fc");
  if (!dump.stdout.length) throw new Error("database dump is empty");
  await writeFile(resolve(stage, "database.dump"), dump.stdout, { mode: 0o600 });
  const exported = await compose("exec", "-T", "api", "corepack", "pnpm", "--filter", "@blog-x/api", "exec", "tsx", "src/app.ts", "portable-export");
  await writeFile(resolve(stage, "portable-export-v1.json"), exported.stdout, { mode: 0o600 });
  const api = await compose("ps", "-q", "api");
  const containerId = api.stdout.toString().trim();
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("backup API container is unavailable");
  await mkdir(resolve(stage, "media"), { mode: 0o700 });
  await mkdir(resolve(stage, "media/source"), { recursive: true, mode: 0o700 });
  await mkdir(resolve(stage, "media/derivative"), { recursive: true, mode: 0o700 });
  await invoke("docker", ["cp", `${containerId}:${policy.media_root}/.`, resolve(stage, "media")]).catch(() => undefined);

  const mediaRows = await compose("exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", policy.database_name, "-At", "-F", "|", "-c", "select id, source_key, derivative_key from media order by id");
  const ledger = await compose("exec", "-T", "postgres", "psql", "-U", "blog_x", "-d", policy.database_name, "-At", "-F", "|", "-c", "select migration_count, migration_fingerprint from blog_x_schema_ledger where scope = 'phase1'");
  const [migrationCount, migrationFingerprint] = ledger.stdout.toString().trim().split("|");
  const config = JSON.parse((await compose("config", "--format", "json")).stdout.toString());
  const images = {};
  for (const name of ["api", "web", "postgres"]) {
    const inspected = await invoke("docker", ["image", "inspect", "--format", "{{.Id}}", config.services[name].image]);
    images[name] = inspected.stdout.toString().trim();
  }
  const configChecksums = [];
  for (const path of policy.config_inventory_sources) configChecksums.push({ path, sha256: await hashFile(resolve(repositoryRoot, path)) });
  const media = [];
  for (const line of mediaRows.stdout.toString().trim().split(/\r?\n/).filter(Boolean)) {
    const [id, sourceKey, derivativeKey] = line.split("|");
    const sourcePath = `media/${sourceKey}`;
    const derivativePath = `media/${derivativeKey}`;
    media.push({ id, sourcePath, derivativePath, sourceSha256: await hashFile(resolve(stage, sourcePath)), derivativeSha256: await hashFile(resolve(stage, derivativePath)) });
  }
  await mkdir(resolve(stage, "config"), { mode: 0o700 });
  await writeFile(resolve(stage, "config/inventory.json"), JSON.stringify({
    format: "blog-x-backup-config-inventory", version: 1,
    migration: { count: Number(migrationCount), fingerprint: migrationFingerprint }, images,
    configChecksums, variableNamesPresent: ["DATABASE_URL", "MEDIA_ROOT", "PUBLIC_ORIGIN"],
    mediaRootRole: "api-owned-source-and-derivative", secretAuthorityRef: policy.secret_authority_ref, media,
  }), { mode: 0o600 });
}

export async function createBackupSet(input, options = {}) {
  const policy = parseBackupPolicy(input);
  const setId = validateBackupSetId(options.setId ?? `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}-${randomBytes(4).toString("hex")}`);
  const finalRoot = resolve(policy.destination_root, setId);
  const stagingRoot = resolve(policy.destination_root, `.${setId}.incomplete-${randomBytes(6).toString("hex")}`);
  const priorUmask = process.umask(0o077);
  try {
    await mkdir(policy.destination_root, { recursive: true, mode: 0o700 });
    await assertNotLink(policy.destination_root, "backup destination root");
    await lstat(finalRoot).then(() => { throw new Error("backup final collision exists"); }).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await mkdir(stagingRoot, { mode: 0o700 });
    const collect = options.collect ?? ((stage, selectedPolicy) => defaultCollect(stage, selectedPolicy, options));
    await collect(stagingRoot, policy);
    const createdAt = (options.now?.() ?? new Date()).toISOString();
    const manifest = await createManifest(stagingRoot, setId, createdAt);
    const manifestText = `${JSON.stringify(manifest)}\n`;
    await writeFile(resolve(stagingRoot, "manifest.json"), manifestText, { flag: "wx", mode: 0o600 });
    const marker = { format: "blog-x-backup-complete", version: 1, manifestSha256: await hashFile(resolve(stagingRoot, "manifest.json")) };
    await writeFile(resolve(stagingRoot, "COMPLETE"), `${JSON.stringify(marker)}\n`, { flag: "wx", mode: 0o600 });
    await verifyBackupSet(stagingRoot);
    await rename(stagingRoot, finalRoot);
    return { setId, finalRoot, message: `BACKUP COMPLETE ${setId}` };
  } finally {
    process.umask(priorUmask);
  }
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const policyPath = option("policy");
  readFile(policyPath, "utf8").then(JSON.parse).then((policy) => createBackupSet(policy)).then((result) => process.stdout.write(`${result.message}\n`)).catch((error) => {
    process.stderr.write(`BACKUP FAILED ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
