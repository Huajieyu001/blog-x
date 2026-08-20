import { createHash, randomBytes } from "node:crypto";
import { lstat, link, mkdir, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseLocalDeliveryAcceptanceRecord } from "./local-delivery-acceptance.mjs";
import {
  REFRESH_AUTHORITY,
  assertCanonicalPortOwner,
  assertFixedRuntimeAuthority,
  assertPersistenceTransition,
  assertRouteFacts,
  assertRouteObservations,
  collectRefreshFacts,
  factsEqual,
  factsSha256,
  projectSanitizedFacts,
} from "./refresh-local-facts.mjs";

const CLAIM_ROOT = "/private/tmp/blog-x-refresh-attempts";
export const LOCAL_DELIVERY_EVIDENCE_PATH = "ops/v1.1-local-delivery-evidence.json";
export const LOCAL_DELIVERY_FORMAT = "blog-x-v1.1-local-delivery-evidence";
export const LOCAL_DELIVERY_VERSION = 1;
export const LOCAL_DELIVERY_REFRESH_KIND = "v1.1-offline-local-delivery";
export const SEED_PREREQUISITE_KINDS = Object.freeze(["missing", "stale", "incompatible", "lock-drifted", "incomplete-store"]);
const COMPOSE_FILE = "compose.yaml";
const PROJECT = "blogxlocal";
const ORIGIN = "http://127.0.0.1:3100";
const CONTAINERS = ["blogxlocal-postgres-1", "blogxlocal-api-1", "blogxlocal-web-1"];
const VOLUMES = ["blogxlocal_postgres-data", "blogxlocal_media-data"];
const REQUIRED_IMAGE_LABELS = ["org.opencontainers.image.revision", "io.blog-x.lockfile-sha256", "io.blog-x.seed-image-id", "io.blog-x.application", "io.blog-x.public-origin", "io.blog-x.refresh-kind"];
const MEDIA_PROGRAM = "const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');const root='/var/lib/blog-x/media';const out=[];function walk(dir){for(const name of fs.readdirSync(dir).sort()){const full=path.join(dir,name),st=fs.lstatSync(full);if(st.isSymbolicLink())throw new Error('symlink');if(st.isDirectory())walk(full);else if(st.isFile()){const bytes=fs.readFileSync(full);out.push({relativePath:path.relative(root,full),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}if(fs.existsSync(root))walk(root);process.stdout.write(JSON.stringify(out));";
const TARGET_FS_PROGRAM = "const fs=require('node:fs');const app=process.argv[1],store=process.argv[2],required=app==='web'?['/refresh-workspace/apps/web/.next','/refresh-workspace/node_modules']:['/refresh-workspace/apps/api/src/app.ts','/refresh-workspace/node_modules'],forbidden=['/workspace','/pnpm-store/files',app==='web'?'/refresh-workspace/apps/web/dist':'/refresh-workspace/apps/api/dist'],roots=fs.readdirSync('/pnpm-store');if(!/^\\/pnpm-store\\/v\\d+$/.test(store)||roots.length!==1||!/^v\\d+$/.test(roots[0])||required.some(p=>!fs.existsSync(p))||forbidden.some(p=>fs.existsSync(p)))process.exit(42);";
const SEED_PREREQUISITE_PROGRAM = "const fs=require('node:fs');const app=process.argv[1],root='/pnpm-store',versions=fs.readdirSync(root);if(versions.length!==1||!/^v\\d+$/.test(versions[0])||fs.readdirSync(root+'/'+versions[0]).length===0||!fs.existsSync('/refresh-workspace/apps/'+app))process.exit(42);";
const ONEOFF_PROGRAM = "setInterval(()=>{},2147483647)";
const BUSINESS_ARGS = ["-p", PROJECT, "-f", COMPOSE_FILE, "exec", "-T", "postgres", "pg_dump", "--data-only", "--no-owner", "--no-privileges", "--exclude-table=public.blog_x_schema_ledger", "--dbname=postgres://blog_x@127.0.0.1:5432/blog_x"];
const SEQUENCE_SQL = "SELECT COALESCE(json_agg(x ORDER BY schemaname,sequencename),'[]'::json) FROM (SELECT schemaname,sequencename,sequenceowner,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname='public') x;";
const LEDGER_SQL = "SELECT COALESCE(json_agg(x ORDER BY scope),'[]'::json) FROM (SELECT scope,migration_count,migration_fingerprint,applied_at FROM blog_x_schema_ledger) x;";
const DATABASE_SQL = "SELECT json_build_object('name',current_database(),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()));";
const SCHEMA_SQL = "SELECT COALESCE(json_agg(x ORDER BY kind,name,detail),'[]'::json) FROM (SELECT 'column' kind,table_name||'.'||column_name name,data_type||':'||is_nullable||':'||COALESCE(column_default,'') detail FROM information_schema.columns WHERE table_schema='public' UNION ALL SELECT 'index',tablename||'.'||indexname,indexdef FROM pg_indexes WHERE schemaname='public' UNION ALL SELECT 'constraint',conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace) x;";
const PSQL_PREFIX = ["-p", PROJECT, "-f", COMPOSE_FILE, "exec", "-T", "postgres", "psql", "--no-psqlrc", "--tuples-only", "--no-align", "--dbname=postgres://blog_x@127.0.0.1:5432/blog_x", "--command"];
const ACCEPTANCE_RESULT_PREFIX = "BLOG X V1.1 ACCEPTANCE RESULT ";

function fail(message) { throw new Error(`local refresh: ${message}`); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function validRevision(value) { return typeof value === "string" && /^[a-f0-9]{40}$/.test(value); }
function validDigest(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validImageId(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function validBranchRef(value) { return typeof value === "string" && /^refs\/heads\/[^\s\x00-\x1f]+$/.test(value); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(`${label} keys are not exact`);
}
function seedPrerequisiteError(kind, cause) {
  if (!SEED_PREREQUISITE_KINDS.includes(kind)) fail("seed prerequisite classification is invalid");
  return new Error(`seed prerequisite ${kind}`, { cause });
}
function isSeedPrerequisiteError(error) { return SEED_PREREQUISITE_KINDS.includes(error?.seedPrerequisite); }
function typedSeedPrerequisiteError(kind, cause) {
  const error = seedPrerequisiteError(kind, cause);
  Object.defineProperty(error, "seedPrerequisite", { value: kind });
  return error;
}
export function classifySeedPrerequisiteFailure(error) {
  return isSeedPrerequisiteError(error) ? error.seedPrerequisite : null;
}
export function formatSeedPrewarmInstruction(classification) {
  if (!SEED_PREREQUISITE_KINDS.includes(classification)) fail("seed prerequisite pre-warm classification is invalid");
  return `LOCAL DELIVERY SEED PRE-WARM REQUIRED (${classification}): repair the repository-managed API and Web seed images for the committed lock, verify the fixed offline probe, commit that remediation, then retry once from the new clean revision.`;
}
export function assertSeedPrerequisiteFacts({ application, expectedId, image, lockfileSha256 } = {}) {
  if (!["api", "web"].includes(application) || !validImageId(expectedId) || !validDigest(lockfileSha256)) fail("seed prerequisite facts are invalid");
  if (!image || typeof image !== "object" || !validImageId(image.Id)) throw typedSeedPrerequisiteError("missing");
  if (image.Id !== expectedId) throw typedSeedPrerequisiteError("stale");
  const labels = image.Config?.Labels;
  if (!labels || typeof labels !== "object" || Array.isArray(labels) || image.Config?.WorkingDir !== "/refresh-workspace" || labels["io.blog-x.application"] !== application || labels["io.blog-x.public-origin"] !== ORIGIN) throw typedSeedPrerequisiteError("incompatible");
  if (labels["io.blog-x.lockfile-sha256"] !== lockfileSha256) throw typedSeedPrerequisiteError("lock-drifted");
  return true;
}
function canonicalClaim(revision) {
  if (!validRevision(revision)) fail("attempt claim revision must be lowercase full SHA");
  return `${JSON.stringify({ format: "blog-x-local-refresh-attempt", version: 1, implementationRevision: revision })}\n`;
}
const FAILURE_KEYS = ["baseline", "claimSha256", "errorClass", "facts", "format", "implementationRevision", "preservation", "recollection", "stage", "version"];
function canonicalFailureReport(report) {
  exactKeys(report, FAILURE_KEYS, "failure report");
  if (report.format !== "blog-x-local-refresh-failure" || report.version !== 1 || !validRevision(report.implementationRevision) || !validDigest(report.claimSha256) || !["applicable", "not_applicable"].includes(report.baseline) || !["collected", "failed", "not_attempted"].includes(report.recollection) || !["proved", "unproved", "not_applicable_pre_runtime"].includes(report.preservation) || typeof report.stage !== "string" || !/^[a-z][a-z0-9_-]*$/.test(report.errorClass)) fail("failure report schema is invalid");
  exactKeys(report.facts, ["current", "preflight", "rollback"], "failure report facts");
  if (Object.values(report.facts).some((value) => value !== null && !validDigest(value))) fail("failure report fact digest is invalid");
  const canonical = {
    format: report.format,
    version: report.version,
    implementationRevision: report.implementationRevision,
    claimSha256: report.claimSha256,
    stage: report.stage,
    errorClass: report.errorClass,
    baseline: report.baseline,
    recollection: report.recollection,
    preservation: report.preservation,
    facts: { preflight: report.facts.preflight, current: report.facts.current, rollback: report.facts.rollback },
  };
  return `${JSON.stringify(canonical)}\n`;
}
function mode(entry) { return entry.mode & 0o7777; }
function isMissing(error) { return error?.code === "ENOENT"; }
function selectedLabels(labels = {}) { return Object.fromEntries(REQUIRED_IMAGE_LABELS.map((key) => [key, labels[key]])); }
function parseJson(stdout, label) { try { return JSON.parse(stdout); } catch { fail(`${label} returned invalid JSON`); } }
function parseComposePs(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) fail("Compose ps output is empty");
  let body = stdout;
  if (body.endsWith("\r\n")) body = body.slice(0, -2);
  else if (body.endsWith("\n")) body = body.slice(0, -1);
  else if (body.endsWith("\r")) fail("Compose ps output has an invalid terminal record");
  if (!body.trim() || body.endsWith("\n") || body.endsWith("\r")) fail("Compose ps output contains a blank terminal record");
  const leading = body.match(/^\s*/)?.[0] ?? "";
  if (/[\r\n]/.test(leading)) fail("Compose ps output contains a leading blank record");
  const trailing = body.slice(body.trimEnd().length);
  if (/[\r\n]/.test(trailing)) fail("Compose ps output contains a blank terminal record");
  const first = body.trimStart()[0];
  let records;
  if (first === "[") {
    const decoded = parseJson(body, "Compose ps");
    if (!Array.isArray(decoded) || decoded.length === 0) fail("Compose ps array must contain object records");
    records = decoded;
  } else {
    records = body.split("\n").map((line) => {
      if (!line.trim()) fail("Compose ps output contains a blank record");
      return parseJson(line, "Compose ps record");
    });
  }
  for (const record of records) {
    if (record === null || typeof record !== "object" || Array.isArray(record)) fail("Compose ps records must be objects");
    if (typeof record.Service !== "string" || !record.Service.trim()) fail("Compose ps Service must be a nonempty string");
  }
  return records;
}
function cleanOutput(result) { return String(result?.stdout ?? "").trim(); }
function normalizeDump(value) { return value.split("\n").filter((line) => !/^--|^SET |^SELECT pg_catalog\.set_config|^\\restrict |^\\unrestrict /.test(line)).join("\n").trim(); }

const ENV_OVERRIDE = /^(?:DOCKER_|COMPOSE_|BUILDX_|BUILDKIT_|COLIMA_)/;
export function buildMinimalChildEnvironment(ambient = process.env, additions = {}) {
  const forbidden = Object.keys(ambient).find((key) => ENV_OVERRIDE.test(key));
  if (forbidden) fail(`ambient ${forbidden} override is forbidden`);
  const output = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]) if (typeof ambient[key] === "string" && ambient[key]) output[key] = ambient[key];
  for (const [key, value] of Object.entries(additions)) {
    if (!["BLOG_X_API_IMAGE", "BLOG_X_WEB_IMAGE"].includes(key) || typeof value !== "string") fail("child environment addition is forbidden");
    output[key] = value;
  }
  return output;
}

export function assertLocalDockerAuthority(context, inspect, { home = process.env.HOME } = {}) {
  if (!["colima", "default"].includes(context) || !Array.isArray(inspect) || inspect.length !== 1 || inspect[0]?.Name !== context) fail("Docker context authority is invalid");
  const host = inspect[0]?.Endpoints?.docker?.Host;
  if (typeof host !== "string" || !host.startsWith("unix://")) fail("Docker daemon must use a local Unix socket");
  const socket = host.slice("unix://".length);
  const expected = context === "colima" ? `${home}/.colima/default/docker.sock` : "/var/run/docker.sock";
  if (socket !== expected || socket.includes("..")) fail("Docker Unix socket authority is not approved local authority");
  return { context, socket };
}

export async function assertLocalDockerSocket(authority, fs = nativeFs) {
  const item = await fs.lstat(authority.socket);
  if (!item?.isSocket?.() || item.isSymbolicLink?.() || await fs.realpath(authority.socket) !== authority.socket) fail("Docker Unix socket filesystem authority is unsafe");
  return authority;
}

const nativeFs = { lstat, link, mkdir, open, readFile, readdir, realpath, unlink };

/** The path is deliberately not configurable: tests inject filesystem and identity behavior, never authority. */
export function createRefreshAttemptStore({ fs = nativeFs, identity = { uid: process.getuid?.() }, randomHex = () => randomBytes(12).toString("hex"), ...unexpected } = {}) {
  if (Object.keys(unexpected).length) fail("attempt claim store accepts no root override or extra option");
  if (!Number.isSafeInteger(identity.uid) || identity.uid < 0) fail("attempt claim identity is invalid");
  const pathFor = (revision) => {
    if (!validRevision(revision)) fail("attempt claim revision must be lowercase full SHA");
    return `${CLAIM_ROOT}/${revision}.json`;
  };
  const failurePathFor = (revision) => `${CLAIM_ROOT}/${validRevision(revision) ? revision : fail("failure report revision must be lowercase full SHA")}.failure.json`;
  async function entry(path) { try { return await fs.lstat(path); } catch (error) { if (isMissing(error)) return undefined; throw error; } }
  async function assertRealDirectory(path, { uid, expectedMode }) {
    const item = await entry(path);
    if (!item || !item.isDirectory() || item.isSymbolicLink() || item.uid !== uid || mode(item) !== expectedMode || await fs.realpath(path) !== path) fail(`attempt claim path ${path} authority is unsafe`);
  }
  async function assertParents() {
    await assertRealDirectory("/private", { uid: 0, expectedMode: 0o755 });
    await assertRealDirectory("/private/tmp", { uid: 0, expectedMode: 0o1777 });
  }
  async function assertRoot({ create = false } = {}) {
    await assertParents();
    let item = await entry(CLAIM_ROOT);
    if (!item && create) {
      await fs.mkdir(CLAIM_ROOT, { mode: 0o700 });
      item = await entry(CLAIM_ROOT);
    }
    if (!item) return false;
    await assertRealDirectory(CLAIM_ROOT, { uid: identity.uid, expectedMode: 0o700 });
    return true;
  }
  async function assertClaimFile(path) {
    const item = await entry(path);
    if (!item || !item.isFile() || item.isSymbolicLink() || item.uid !== identity.uid || mode(item) !== 0o600 || await fs.realpath(path) !== path) fail("attempt claim file authority is unsafe");
  }
  async function syncRoot() {
    const directory = await fs.open(CLAIM_ROOT, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  function invariant(artifact, error) {
    const code = String(error?.code ?? "publication_failed").replace(/[^A-Za-z0-9_-]/g, "_");
    const wrapped = new Error(`UNRECOVERABLE_${artifact.toUpperCase().replace("-", "_")}_INVARIANT:${code}`, { cause: error });
    wrapped.code = code;
    return wrapped;
  }
  async function publishFile(finalPath, bytes, suffix, artifact) {
    const tempPath = `${CLAIM_ROOT}/.${basename(finalPath)}.${suffix}.tmp`;
    let handle; let tempExists = false; let linked = false;
    try {
      handle = await fs.open(tempPath, "wx", 0o600); tempExists = true;
      await handle.writeFile(bytes, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
      await assertClaimFile(tempPath);
      if (await entry(finalPath)) fail("atomic final is already published");
      try { await fs.link(tempPath, finalPath); } catch (error) { if (error?.code === "EEXIST") fail("atomic final is already published"); throw error; }
      linked = true;
      await assertClaimFile(finalPath);
      await syncRoot();
      await fs.unlink(tempPath); tempExists = false;
      await syncRoot();
    } catch (error) {
      try { if (handle) { await handle.close(); handle = undefined; } }
      catch (closeError) { throw invariant(artifact, closeError); }
      if (linked) {
        try { await fs.unlink(finalPath); linked = false; await syncRoot(); }
        catch (cleanupError) { throw invariant(artifact, cleanupError); }
      }
      if (tempExists) {
        try { await fs.unlink(tempPath); tempExists = false; }
        catch (cleanupError) { throw invariant(artifact, cleanupError); }
      }
      if (linked || error?.code || /UNRECOVERABLE_/.test(error?.message ?? "")) throw invariant(artifact, error);
      throw error;
    }
  }
  async function readCanonicalClaim(revision) {
    const path = pathFor(revision);
    if (!(await assertRoot())) fail("refresh attempt claim is absent");
    if (!(await entry(path))) fail("refresh attempt claim is absent");
    await assertClaimFile(path);
    const bytes = await fs.readFile(path, "utf8");
    if (bytes !== canonicalClaim(revision)) fail("attempt claim bytes are not canonical");
    return { present: true, bytes, sha256: digest(bytes) };
  }
  return Object.freeze({
    root: CLAIM_ROOT,
    pathFor,
    failurePathFor,
    async assertAbsent(revision) {
      const path = pathFor(revision);
      if (!(await assertRoot())) return { present: false };
      if (await entry(path)) fail("refresh attempt is already claimed");
      return { present: false };
    },
    async assertPresent(revision) {
      return readCanonicalClaim(revision);
    },
    async claimRefreshAttempt(revision) {
      const finalPath = pathFor(revision);
      await assertRoot({ create: true });
      if (await entry(finalPath)) fail("refresh attempt is already claimed");
      const bytes = canonicalClaim(revision);
      const suffix = randomHex();
      if (!/^[a-f0-9]{24}$/.test(suffix)) fail("attempt claim temporary token is invalid");
      await publishFile(finalPath, bytes, suffix, "claim");
      return { implementationRevision: revision, bytes, sha256: digest(bytes) };
    },
    async assertFailureReportAbsent(revision) {
      const path = failurePathFor(revision);
      if (!(await assertRoot())) return { present: false };
      if (await entry(path)) fail("refresh failure report is already present");
      return { present: false };
    },
    async assertFailureReportPresent(revision) {
      const claim = await readCanonicalClaim(revision);
      const path = failurePathFor(revision);
      await assertClaimFile(path);
      const bytes = await fs.readFile(path, "utf8");
      const report = parseJson(bytes, "failure report");
      if (canonicalFailureReport(report) !== bytes || report.implementationRevision !== revision) fail("failure report bytes or revision are not canonical");
      if (report.claimSha256 !== claim.sha256) fail("failure report claim digest is not bound to the canonical claim");
      return { present: true, report, bytes, sha256: digest(bytes) };
    },
    async writeFailureReport(report) {
      const bytes = canonicalFailureReport(report); const path = failurePathFor(report.implementationRevision);
      await assertRoot({ create: true });
      if (await entry(path)) fail("refresh failure report is already present");
      const suffix = randomHex();
      if (!/^[a-f0-9]{24}$/.test(suffix)) fail("failure report temporary token is invalid");
      await publishFile(path, bytes, suffix, "failure-report");
      return { report, bytes, sha256: digest(bytes) };
    },
  });
}

function exact(command, args, expected) { return command === expected[0] && same(args, expected[1]); }
function buildArgsMatch(args) {
  if (args.length !== 18 || args[0] !== "build" || args[1] !== "--network=none" || args[2] !== "--pull=false" || args[3] !== "--file" || !/^apps\/(api|web)\/Dockerfile\.refresh$/.test(args[4]) || args[5] !== "--tag") return false;
  const app = args[4].split("/")[1];
  const revision = args[12]?.slice("REFRESH_REVISION=".length);
  return args[6] === `blog-x-${app}-local:${revision?.slice(0, 12)}` && args[7] === "--build-arg" && args[8].startsWith("SEED_IMAGE=") && validRef(args[8].slice("SEED_IMAGE=".length)) && args[9] === "--build-arg" && /^SEED_IMAGE_ID=sha256:[a-f0-9]{64}$/.test(args[10]) && args[11] === "--build-arg" && validRevision(revision) && args[13] === "--build-arg" && /^LOCKFILE_SHA256=[a-f0-9]{64}$/.test(args[14]) && args[15] === "--build-arg" && args[16] === `PUBLIC_ORIGIN=${ORIGIN}` && args[17] === ".";
}
function validRef(ref) { return validImageId(ref) || /^blog-x-(api|web)-local(?::[a-f0-9]{12})?$/.test(ref); }
function validOneoff(value) { return /^blogxlocal-api-refresh-[a-f0-9]{12}$/.test(value); }
function assertEnv(options, expected) {
  const actual = options?.env ?? {};
  if (!same(Object.keys(actual).sort(), Object.keys(expected).sort()) || Object.entries(expected).some(([key, value]) => actual[key] !== value)) fail("command environment is not exact");
}

/** Complete token-level policy. The runner never receives a command before this passes. */
export function assertAllowedRefreshCommand(command, args, options = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) fail("command argv is invalid");
  let allowed = false;
  if (command === "git") allowed = exact(command, args, ["git", ["status", "--porcelain"]]) || exact(command, args, ["git", ["symbolic-ref", "--quiet", "HEAD"]]) || exact(command, args, ["git", ["rev-parse", "HEAD"]]) || exact(command, args, ["git", ["hash-object", "pnpm-lock.yaml"]]) || exact(command, args, ["git", ["ls-files", ".planning/milestones"]]) || (args.length === 2 && args[0] === "show" && /^[a-f0-9]{40}:pnpm-lock\.yaml$/.test(args[1])) || (args.length === 4 && same(args.slice(0, 2), ["merge-base", "--is-ancestor"]) && validRevision(args[2]) && validRevision(args[3])) || (args.length === 4 && same(args.slice(0, 2), ["diff", "--name-only"]) && /^[a-f0-9]{40}\.\.[a-f0-9]{40}$/.test(args[2]) && args[3] === "--");
  if (command === "docker") {
    allowed = same(args, ["context", "show"])
      || (args.length === 3 && same(args.slice(0, 2), ["context", "inspect"]) && ["colima", "default"].includes(args[2]))
      || same(args, ["ps", "--filter", "publish=3100", "--format", "{{json .}}"])
      || buildArgsMatch(args)
      || (same(args.slice(0, 2), ["image", "inspect"]) && args.length === 3 && validRef(args[2]))
      || (same(args.slice(0, 2), ["container", "inspect"]) && ((args.length === 5 && same(args.slice(2), CONTAINERS)) || (args.length === 3 && validOneoff(args[2]))))
      || (same(args.slice(0, 2), ["volume", "inspect"]) && args.length === 4 && same(args.slice(2), VOLUMES))
      || (args.length === 10 && same(args.slice(0, 5), ["run", "--rm", "--network=none", "--entrypoint", "corepack"]) && validRef(args[5]) && same(args.slice(6), ["pnpm", "--store-dir=/pnpm-store", "store", "path"]))
      || (args.length === 10 && same(args.slice(0, 5), ["run", "--rm", "--network=none", "--entrypoint", "node"]) && validRef(args[5]) && args[6] === "-e" && args[7] === TARGET_FS_PROGRAM && ["api", "web"].includes(args[8]) && /^\/pnpm-store\/v\d+$/.test(args[9]))
      || (args.length === 9 && same(args.slice(0, 5), ["run", "--rm", "--network=none", "--entrypoint", "node"]) && validImageId(args[5]) && args[6] === "-e" && args[7] === SEED_PREREQUISITE_PROGRAM && ["api", "web"].includes(args[8]))
      || (args.length === 3 && args[0] === "exec" && validOneoff(args[1]) && args[2] === "true")
      || (args.length === 7 && args[0] === "exec" && validOneoff(args[1]) && same(args.slice(2, 6), ["corepack", "pnpm", "--filter", "@blog-x/api"]) && ["db:migrate", "db:schema:verify"].includes(args[6]))
      || (args.length === 3 && same(args.slice(0, 2), ["rm", "-f"]) && validOneoff(args[2]));
  }
  const prefix = ["-p", PROJECT, "-f", COMPOSE_FILE];
  if (command === "docker-compose" && same(args.slice(0, 4), prefix)) {
    const tail = args.slice(4);
    allowed = same(tail, ["config", "--services"])
      || same(tail, ["ps", "--all", "--format", "json"])
      || same(args, BUSINESS_ARGS)
      || same(args, [...PSQL_PREFIX, SEQUENCE_SQL])
      || same(args, [...PSQL_PREFIX, LEDGER_SQL])
      || same(args, [...PSQL_PREFIX, DATABASE_SQL])
      || same(args, [...PSQL_PREFIX, SCHEMA_SQL])
      || same(tail, ["exec", "-T", "api", "node", "-e", MEDIA_PROGRAM])
      || (tail.length === 9 && same(tail.slice(0, 5), ["run", "--detach", "--no-deps", "--name", tail[4]]) && validOneoff(tail[4]) && same(tail.slice(5), ["api", "node", "-e", ONEOFF_PROGRAM]))
      || same(tail, ["up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"]);
  }
  if (command === "node") allowed = same(args, ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"])
    || same(args, ["scripts/local-delivery-acceptance.mjs"]);
  if (!allowed) fail(`command argv is not an exact allowlisted shape: ${command} ${args.join(" ")}`);
  if (options?.env !== undefined) {
    if (command === "docker-compose" && args.at(4) === "run") {
      assertEnv(options, { BLOG_X_API_IMAGE: options.env.BLOG_X_API_IMAGE });
      const suffix = args[8]?.slice("blogxlocal-api-refresh-".length);
      if (options.env.BLOG_X_API_IMAGE !== `blog-x-api-local:${suffix}`) fail("target API environment is not exact");
    }
    else if (command === "docker-compose" && args.at(4) === "up") {
      exactKeys(options.env, ["BLOG_X_API_IMAGE", "BLOG_X_WEB_IMAGE"], "Compose image environment");
      if (![options.env.BLOG_X_API_IMAGE, options.env.BLOG_X_WEB_IMAGE].every(validRef)) fail("Compose image environment contains a mutable or alternate ref");
    } else fail("command does not accept an environment override");
  }
  return true;
}

export const assertAllowedRefreshArgv = assertAllowedRefreshCommand;

function routeSource(fetch) {
  return async () => {
    const output = {};
    for (const path of ["/", "/categories", "/tags", "/archives", "/api/health", "/api/public/search?q=", "/api/public/articles/phase6-unknown/related"]) {
      const requested = `${ORIGIN}${path}`;
      const response = await fetch(requested, { redirect: "error" });
      if (response.url !== requested || new URL(response.url).origin !== ORIGIN || response.status >= 300 && response.status < 400) fail(`route ${path} redirect or final URL authority is invalid`);
      const bytes = await response.text();
      if (Buffer.byteLength(bytes) > 1_048_576) fail(`route ${path} body exceeds the fixed bound`);
      const fact = { status: response.status, bodySha256: digest(bytes) };
      const contentType = response.headers?.get?.("content-type");
      const mediaType = typeof contentType === "string" ? contentType.split(";", 1)[0].trim().toLowerCase() : "";
      if (mediaType === "application/json" || mediaType.endsWith("+json")) { try { fact.body = JSON.parse(bytes); } catch { fail(`route ${path} returned malformed JSON`); } }
      output[path] = fact;
    }
    assertRouteObservations(output);
    return output;
  };
}

export function createRawRefreshFactSources({ run, fetch, root = process.cwd(), fs = nativeFs, state }) {
  if (!state || typeof state !== "object") fail("raw fact sources require runtime state");
  return Object.freeze({
    async composeAuthority() {
      const services = cleanOutput(await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "config", "--services"])).split("\n").filter(Boolean).sort();
      const raw = parseComposePs((await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "ps", "--all", "--format", "json"])).stdout);
      const ps = raw.map((item) => item.Service).sort();
      return { services, ps };
    },
    async containers() { return parseJson((await run("docker", ["container", "inspect", ...CONTAINERS])).stdout, "container inspect"); },
    async portOwner(containers) { return assertCanonicalPortOwner((await run("docker", ["ps", "--filter", "publish=3100", "--format", "{{json .}}"])).stdout, containers); },
    async volumes() { return parseJson((await run("docker", ["volume", "inspect", ...VOLUMES])).stdout, "volume inspect"); },
    async business() { const value = normalizeDump((await run("docker-compose", BUSINESS_ARGS)).stdout); return { count: value ? value.split("\n").length : 0, sha256: digest(value) }; },
    async sequences() { const rows = parseJson(cleanOutput(await run("docker-compose", [...PSQL_PREFIX, SEQUENCE_SQL])), "sequence query"); return { count: rows.length, sha256: factsSha256(rows) }; },
    async ledger() { return parseJson(cleanOutput(await run("docker-compose", [...PSQL_PREFIX, LEDGER_SQL])), "ledger query"); },
    async media() { const rows = parseJson(cleanOutput(await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "exec", "-T", "api", "node", "-e", MEDIA_PROGRAM])), "media inventory"); return { count: rows.length, bytes: rows.reduce((sum, row) => sum + row.bytes, 0), sha256: factsSha256(rows) }; },
    async protected() {
      const tracked = cleanOutput(await run("git", ["ls-files", ".planning/milestones"])).split("\n").filter(Boolean);
      const paths = [...tracked, "ops/phase5-full-gate-receipt.json", ".planning/phases/06-public-discovery-data/06-VERIFICATION.md"].sort();
      const hashes = [];
      for (const path of paths) hashes.push({ path, sha256: digest(await fs.readFile(resolve(root, path))) });
      return { count: hashes.length, sha256: factsSha256(hashes) };
    },
    async git() {
      const status = cleanOutput(await run("git", ["status", "--porcelain"]));
      const ref = cleanOutput(await run("git", ["symbolic-ref", "--quiet", "HEAD"]));
      const implementationRevision = cleanOutput(await run("git", ["rev-parse", "HEAD"]));
      if (status || !validBranchRef(ref) || !validRevision(implementationRevision)) fail("Git authority is not one clean branch-qualified full revision");
      return { implementationRevision, clean: true, lockfileSha256: digest(await fs.readFile(resolve(root, "pnpm-lock.yaml"))), ref };
    },
    async database() {
      const identity = parseJson(cleanOutput(await run("docker-compose", [...PSQL_PREFIX, DATABASE_SQL])), "database identity");
      const schema = parseJson(cleanOutput(await run("docker-compose", [...PSQL_PREFIX, SCHEMA_SQL])), "database schema");
      if (identity?.name !== "blog_x" || typeof identity.systemIdentifier !== "string" || !Array.isArray(schema) || schema.length === 0) fail("database identity/schema is invalid");
      return { name: identity.name, systemIdentifier: identity.systemIdentifier, schemaRows: schema.length, schemaSha256: factsSha256(schema) };
    },
    async seeds() { return structuredClone(state.seeds); },
    async targets() { return structuredClone(state.targetFacts); },
    routes: routeSource(fetch),
    async releaseState() { await run("node", ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"]); return "BLOCKED"; },
  });
}

function buildCommand(target, plan) {
  return ["build", "--network=none", "--pull=false", "--file", target.dockerfile, "--tag", target.tag, "--build-arg", `SEED_IMAGE=${target.seedReference}`, "--build-arg", `SEED_IMAGE_ID=${target.seedId}`, "--build-arg", `REFRESH_REVISION=${plan.revision}`, "--build-arg", `LOCKFILE_SHA256=${plan.lockSha256}`, "--build-arg", `PUBLIC_ORIGIN=${ORIGIN}`, "."];
}
function imageByService(facts, service) { return facts.containers.find((item) => item.Config?.Labels?.["com.docker.compose.service"] === service); }
function validateTarget(image, target) {
  if (!validImageId(image?.Id) || image.Config?.WorkingDir !== "/refresh-workspace" || !Array.isArray(image.Config?.Cmd) || image.Config.Cmd.some((part) => String(part).includes("/workspace"))) fail(`${target.application} target configuration is invalid`);
  const expected = { ...target.labels, "io.blog-x.seed-image-id": target.seedId };
  exactKeys(selectedLabels(image.Config?.Labels), REQUIRED_IMAGE_LABELS, `${target.application} target labels`);
  for (const [key, value] of Object.entries(expected)) if (image.Config.Labels[key] !== value) fail(`${target.application} target label ${key} is not exact`);
}
async function publishEvidence(fs, finalPath, bytes, randomHex) {
  const token = randomHex();
  if (!/^[a-f0-9]{16}$/.test(token)) fail("evidence temporary token is invalid");
  const parent = dirname(finalPath);
  const temp = resolve(parent, `.${basename(finalPath)}.${token}.tmp`);
  const uid = process.getuid?.();
  const entry = async (path) => { try { return await fs.lstat(path); } catch (error) { if (isMissing(error)) return undefined; throw error; } };
  const assertDirectory = async () => {
    const item = await entry(parent);
    if (!item?.isDirectory?.() || item.isSymbolicLink?.() || item.uid !== uid || mode(item) !== 0o755 || await fs.realpath(parent) !== parent) fail("evidence parent authority is unsafe");
  };
  const assertFile = async (path) => {
    const item = await entry(path);
    if (!item?.isFile?.() || item.isSymbolicLink?.() || item.uid !== uid || mode(item) !== 0o600 || await fs.realpath(path) !== path) fail("evidence file authority is unsafe");
  };
  const syncDirectory = async () => {
    const directory = await fs.open(parent, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  };
  const safeCode = (error) => String(error?.code ?? "publication_failed").replace(/[^A-Za-z0-9_-]/g, "_");
  const invariant = (error, cause = error) => {
    const wrapped = new Error(`UNRECOVERABLE_EVIDENCE_INVARIANT:${safeCode(error)}`, { cause });
    wrapped.code = safeCode(error);
    return wrapped;
  };
  await assertDirectory();
  if (await entry(finalPath)) fail("evidence already exists and will not be overwritten");
  if (await entry(temp)) fail("evidence temporary already exists");
  let handle; let tempExists = false; let linked = false; let linkedEver = false;
  try {
    handle = await fs.open(temp, "wx", 0o600); tempExists = true;
    await handle.writeFile(bytes, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
    await assertFile(temp);
    await assertDirectory();
    if (await entry(finalPath)) fail("evidence already exists and will not be overwritten");
    try { await fs.link(temp, finalPath); linked = true; linkedEver = true; } catch (error) { if (error?.code === "EEXIST") fail("evidence already exists and will not be overwritten"); throw error; }
    await assertFile(finalPath);
    await syncDirectory();
    await fs.unlink(temp); tempExists = false;
    await syncDirectory();
  } catch (error) {
    let cleanupError;
    if (handle) {
      try { await handle.close(); handle = undefined; } catch (closeError) { cleanupError = closeError; }
    }
    if (linked) {
      try { await fs.unlink(finalPath); linked = false; await syncDirectory(); }
      catch (fault) { cleanupError ??= fault; }
    }
    if (tempExists) {
      try { await fs.unlink(temp); tempExists = false; await syncDirectory(); }
      catch (fault) { cleanupError ??= fault; }
    }
    if (cleanupError) throw invariant(cleanupError, error);
    if (linkedEver || error?.code) throw invariant(error);
    throw error;
  }
}

export function createRawRefreshRuntime({ runArgv, claimStore, fetch, root, evidenceFs, randomEvidenceHex, ambientEnv, clock = () => undefined, enforceLocalAuthority = true } = {}) {
  if (typeof runArgv !== "function" || typeof fetch !== "function") fail("live adapter requires argv runner and loopback fetch");
  if (!claimStore || !evidenceFs || typeof root !== "string" || typeof randomEvidenceHex !== "function") fail("live adapter raw boundaries are incomplete");
  const run = async (command, args, options = {}) => { assertAllowedRefreshCommand(command, args, options); return runArgv(command, args, options); };
  const tick = (stage) => { try { clock(stage); } catch (error) { error.refreshStage = stage; if (stage === "cutover-api-web") error.refreshBeforeMutation = true; throw error; } };
  const state = { facts: {}, claim: undefined, acceptance: undefined, targets: {}, targetFacts: { api: null, web: null }, seeds: { api: null, web: null }, oldImages: {}, cutover: false, migrationOneoff: undefined, phase: "constructed" };
  let sources; let collect;
  const initializeCollectors = () => {
    if (sources) return;
    sources = createRawRefreshFactSources({ run, fetch, root, fs: evidenceFs, state });
    collect = () => collectRefreshFacts({ sources });
  };
  const inspectImages = async (refs) => {
    const result = [];
    for (const ref of refs) result.push(parseJson((await run("docker", ["image", "inspect", ref])).stdout, `image inspect ${ref}`)[0]);
    return result;
  };
  const validateSeedPrerequisites = async (plan) => {
    for (const target of plan.targets) {
      let image;
      try {
        image = (await inspectImages([target.seedReference]))[0];
      } catch (error) {
        throw typedSeedPrerequisiteError("missing", error);
      }
      assertSeedPrerequisiteFacts({ application: target.application, expectedId: target.seedId, image, lockfileSha256: plan.lockSha256 });
      try {
        await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "node", image.Id, "-e", SEED_PREREQUISITE_PROGRAM, target.application]);
      } catch (error) {
        throw typedSeedPrerequisiteError("incomplete-store", error);
      }
      state.seeds[target.application] = { reference: target.seedReference, inspectedId: image.Id };
    }
  };
  const probe = async (target, image) => {
    const store = cleanOutput(await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "corepack", image.Id, "pnpm", "--store-dir=/pnpm-store", "store", "path"]));
    if (!/^\/pnpm-store\/v\d+$/.test(store)) fail(`${target.application} target store is invalid`);
    await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "node", image.Id, "-e", TARGET_FS_PROGRAM, target.application, store]);
    validateTarget(image, target);
    return { storeSha256: digest(store), filesystemSha256: digest(`${target.application}:${image.Config.WorkingDir}:${JSON.stringify(image.Config.Cmd)}`), filesystemExact: true };
  };
  const evidencePath = resolve(root, LOCAL_DELIVERY_EVIDENCE_PATH);
  async function assertEvidenceAbsent() {
    try { await evidenceFs.lstat(evidencePath); fail("refresh evidence final already exists"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    const prefix = `.${basename(evidencePath)}.`;
    const names = await evidenceFs.readdir(dirname(evidencePath));
    if (names.some((name) => name.startsWith(prefix) && name.endsWith(".tmp"))) fail("refresh evidence temporary already exists");
  }
  async function inspectTargetOneoff(plan) {
    const api = plan.targets.find((target) => target.application === "api");
    const oneoff = (parseJson((await run("docker", ["container", "inspect", state.migrationOneoff])).stdout, "target API oneoff inspect"))[0];
    const labels = oneoff?.Config?.Labels ?? {};
    if (oneoff?.Image !== state.targets.api.Id || labels["com.docker.compose.project"] !== PROJECT || labels["com.docker.compose.service"] !== "api" || labels["com.docker.compose.oneoff"] !== "True" || api.tag !== oneoff.Config?.Image) fail("target API oneoff immutable identity is invalid");
  }
  return Object.freeze({
    assertAllowedArgv: assertAllowedRefreshCommand,
    attachAttemptClaim(claim) {
      if (state.claim || claim?.implementationRevision === undefined || !validDigest(claim.sha256)) fail("attempt claim attachment is invalid");
      state.claim = claim;
    },
    async recollectFailure() {
      if (!state.facts.preflight) return { baseline: "not_applicable", recollection: "not_attempted", preservation: "not_applicable_pre_runtime", facts: { preflight: null, current: null, rollback: null } };
      try {
        const current = await collect();
        const preflight = projectSanitizedFacts(state.facts.preflight, { routeContract: "observed" }); const now = projectSanitizedFacts(current, { routeContract: "observed" });
        const stable = ["business", "media", "protected", "sequences", "volumes"].every((key) => factsEqual(preflight[key], now[key]));
        return { baseline: "applicable", recollection: "collected", preservation: stable ? "proved" : "unproved", facts: { preflight: factsSha256(preflight), current: factsSha256(now), rollback: state.facts.rollback ? factsSha256(projectSanitizedFacts(state.facts.rollback, { routeContract: "observed" })) : null } };
      } catch { return { baseline: "applicable", recollection: "failed", preservation: "unproved", facts: { preflight: factsSha256(projectSanitizedFacts(state.facts.preflight, { routeContract: "observed" })), current: null, rollback: null } }; }
    },
    currentPhase() { return state.phase; },
    async execute(phase, plan) {
      state.phase = phase;
      if (phase === "preflight") {
        state.phase = "local_docker_authority";
        tick(state.phase);
        if (enforceLocalAuthority) {
          buildMinimalChildEnvironment(ambientEnv);
          const context = cleanOutput(await run("docker", ["context", "show"]));
          const inspected = parseJson((await run("docker", ["context", "inspect", context])).stdout, "Docker context inspect");
          const authority = assertLocalDockerAuthority(context, inspected, { home: ambientEnv.HOME });
          await assertLocalDockerSocket(authority, evidenceFs);
        }
        state.phase = "preflight_collection";
        tick(state.phase);
        initializeCollectors();
        await assertEvidenceAbsent();
        state.facts.preflight = await collect(); assertFixedRuntimeAuthority(state.facts.preflight);
        if (state.facts.preflight.git.implementationRevision !== plan.revision || state.facts.preflight.git.lockfileSha256 !== plan.lockSha256) fail("preflight Git/lock authority does not match the claimed plan");
        for (const target of plan.targets) {
          const running = imageByService(state.facts.preflight, target.application);
          if (!validImageId(running?.Image) || typeof running.Config?.Image !== "string") fail("fixed seed image authority is missing");
          target.seedId = running.Image; target.seedReference = running.Config.Image; target.labels["io.blog-x.seed-image-id"] = running.Image;
          state.seeds[target.application] = { reference: running.Config.Image, inspectedId: running.Image };
          state.oldImages[target.application] = running.Image;
        }
        state.facts.preflight.seeds = structuredClone(state.seeds);
        if (!state.claim) state.claim = await claimStore.claimRefreshAttempt(plan.revision);
        return;
      }
      tick(PHASE_REPORT_STAGE[phase] ?? phase);
      if (!state.claim) fail("refresh attempt must be claimed before mutation");
      if (phase === "seed-prerequisites") {
        await validateSeedPrerequisites(plan);
        state.facts.preflight.seeds = structuredClone(state.seeds);
        return;
      }
      if (phase === "build-api" || phase === "build-web") {
        const target = plan.targets.find((item) => item.application === phase.slice(6));
        await run("docker", buildCommand(target, plan));
        state.targets[target.application] = (await inspectImages([target.tag]))[0];
        return;
      }
      if (phase === "inspect-target-images") {
        for (const target of plan.targets) { const image = state.targets[target.application]; validateTarget(image, target); state.targets[target.application].probe = await probe(target, image); }
        state.targetFacts = Object.fromEntries(["api", "web"].map((app) => [app, { id: state.targets[app].Id, labelsSha256: factsSha256(selectedLabels(state.targets[app].Config?.Labels)), filesystemSha256: state.targets[app].probe.filesystemSha256, storeSha256: state.targets[app].probe.storeSha256 }]));
        state.facts.preflight.targets = await sources.targets();
        return;
      }
      if (phase === "accept-v1.1") {
        const result = await run("node", ["scripts/local-delivery-acceptance.mjs"]);
        const records = String(result?.stdout ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.startsWith(ACCEPTANCE_RESULT_PREFIX));
        if (records.length !== 1) fail("acceptance output must contain exactly one result record");
        let decoded;
        try { decoded = JSON.parse(records[0].slice(ACCEPTANCE_RESULT_PREFIX.length)); }
        catch { fail("acceptance result record is invalid JSON"); }
        const record = parseLocalDeliveryAcceptanceRecord(decoded);
        state.acceptance = { record: structuredClone(record), sha256: digest(JSON.stringify(record)) };
        return;
      }
      if (phase === "migrate") {
        const api = plan.targets.find((item) => item.application === "api");
        state.migrationOneoff = `blogxlocal-api-refresh-${plan.revision.slice(0, 12)}`;
        try {
          await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "run", "--detach", "--no-deps", "--name", state.migrationOneoff, "api", "node", "-e", ONEOFF_PROGRAM], { env: { BLOG_X_API_IMAGE: api.tag } });
          await inspectTargetOneoff(plan);
          await run("docker", ["exec", state.migrationOneoff, "corepack", "pnpm", "--filter", "@blog-x/api", "db:migrate"]);
        } catch (error) {
          try { await run("docker", ["rm", "-f", state.migrationOneoff]); }
          finally { state.migrationOneoff = undefined; }
          throw error;
        }
        return;
      }
      if (phase === "schema-verify") {
        try { await inspectTargetOneoff(plan); await run("docker", ["exec", state.migrationOneoff, "corepack", "pnpm", "--filter", "@blog-x/api", "db:schema:verify"]); }
        finally { await run("docker", ["rm", "-f", state.migrationOneoff]); state.migrationOneoff = undefined; }
        state.facts.postMigration = await collect();
        assertPersistenceTransition(state.facts.preflight, state.facts.postMigration, { stage: "postMigration" }); return;
      }
      if (phase === "cutover-api-web") {
        state.cutover = true;
        await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"], { env: { BLOG_X_API_IMAGE: state.targets.api.Id, BLOG_X_WEB_IMAGE: state.targets.web.Id } });
        state.facts.postCutover = await collect();
        assertPersistenceTransition(state.facts.postMigration, state.facts.postCutover, { stage: "postCutover", targetImageIds: { api: state.targets.api.Id, web: state.targets.web.Id } }); return;
      }
      if (phase === "routes") { assertRouteFacts(state.facts.postCutover.routes); return; }
      if (phase === "release-blocked") { if (state.facts.postCutover.releaseState !== "BLOCKED") fail("release state changed"); return; }
      if (phase === "write-evidence") {
        const targetEvidence = Object.fromEntries(["api", "web"].map((app) => [app, { id: state.targets[app].Id, labels: selectedLabels(state.targets[app].Config?.Labels), probe: state.targets[app].probe }]));
        const preflight = projectSanitizedFacts(state.facts.preflight, { routeContract: "observed" });
        const postMigration = projectSanitizedFacts(state.facts.postMigration, { routeContract: "observed" });
        if (!factsEqual(preflight.routes, postMigration.routes)) fail("evidence pre-cutover route observations changed");
        const evidence = { format: LOCAL_DELIVERY_FORMAT, version: LOCAL_DELIVERY_VERSION, implementationRevision: plan.revision, lockfileSha256: plan.lockSha256, attemptClaim: { implementationRevision: plan.revision, sha256: state.claim.sha256 }, oldImages: state.oldImages, seeds: state.seeds, targets: targetEvidence, stages: { preflight, postMigration, postCutover: projectSanitizedFacts(state.facts.postCutover, { routeContract: "final" }) }, releaseState: "BLOCKED" };
        await publishEvidence(evidenceFs, evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, randomEvidenceHex); return;
      }
      if (phase === "rollback-api-web") {
        if (!state.cutover) return;
        if (state.migrationOneoff) { await run("docker", ["rm", "-f", state.migrationOneoff]); state.migrationOneoff = undefined; }
        await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"], { env: { BLOG_X_API_IMAGE: state.oldImages.api, BLOG_X_WEB_IMAGE: state.oldImages.web } }); return;
      }
      if (phase === "verify-rollback") {
        state.facts.rollback = await collect();
        assertPersistenceTransition(state.facts.postMigration, state.facts.rollback, { stage: "rollback", oldImageIds: state.oldImages, preflightRoutes: state.facts.preflight.routes });
        await assertEvidenceAbsent(); return;
      }
      fail(`unknown live refresh phase ${phase}`);
    },
  });
}

const EVIDENCE_KEYS = ["attemptClaim", "format", "implementationRevision", "lockfileSha256", "oldImages", "releaseState", "seeds", "stages", "targets", "version"];
const PROJECTION_KEYS = ["business", "containers", "database", "git", "ledger", "media", "protected", "releaseState", "routes", "seeds", "sequences", "targets", "topology", "volumes"];
const ROUTE_KEYS = ["/", "/api/health", "/api/public/articles/phase6-unknown/related", "/api/public/search?q=", "/archives", "/categories", "/tags"];
function assertProjectedDigest(value, label, extras = []) {
  exactKeys(value, ["count", ...extras, "sha256"], label);
  if (!Number.isSafeInteger(value.count) || value.count < 0 || !validDigest(value.sha256) || extras.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)) fail(`${label} digest/count is invalid`);
}
function assertProjectedRoutes(routes, label, routeContract) {
  exactKeys(routes, ROUTE_KEYS, `${label} routes`);
  const finalContracts = {
    "/": { status: 200 },
    "/categories": { status: 200 },
    "/tags": { status: 200 },
    "/archives": { status: 200 },
    "/api/health": { status: 200, contractSha256: factsSha256({ ok: true }) },
    "/api/public/search?q=": { status: 200, contractSha256: factsSha256({ state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] }) },
    "/api/public/articles/phase6-unknown/related": { status: 404, contractSha256: factsSha256({ error: "not_found" }) },
  };
  if (!["observed", "final"].includes(routeContract)) fail(`${label} route projection mode is invalid`);
  for (const path of ROUTE_KEYS) {
    const route = routes[path];
    exactKeys(route, path.startsWith("/api/") ? ["bodySha256", "contractSha256", "status"] : ["bodySha256", "status"], `${label} route ${path}`);
    if (!validDigest(route.bodySha256) || !Number.isSafeInteger(route.status) || route.status < 100 || route.status > 599 || route.status >= 300 && route.status < 400) fail(`${label} route ${path} projection is invalid`);
    if (path.startsWith("/api/") && route.contractSha256 !== null && !validDigest(route.contractSha256)) fail(`${label} route ${path} contract projection is invalid`);
    if (routeContract === "final" && (route.status !== finalContracts[path].status || path.startsWith("/api/") && route.contractSha256 !== finalContracts[path].contractSha256)) fail(`${label} route ${path} final contract is invalid`);
  }
}
function assertProjectionSchema(value, label, { routeContract = "final" } = {}) {
  exactKeys(value, PROJECTION_KEYS, label);
  for (const key of ["business", "protected", "sequences", "volumes"]) assertProjectedDigest(value[key], `${label} ${key}`);
  exactKeys(value.git, ["clean", "implementationRevision", "lockfileSha256", "ref"], `${label} Git`);
  if (value.git.clean !== true || !validRevision(value.git.implementationRevision) || !validDigest(value.git.lockfileSha256) || !validBranchRef(value.git.ref)) fail(`${label} Git projection is invalid`);
  exactKeys(value.database, ["name", "schemaRows", "schemaSha256", "systemIdentifier"], `${label} database`);
  exactKeys(value.seeds, ["api", "web"], `${label} seeds`); exactKeys(value.targets, ["api", "web"], `${label} targets`);
  assertProjectedDigest(value.media, `${label} media`, ["bytes"]);
  exactKeys(value.ledger, ["count", "rows", "stableSha256", "timestampSha256"], `${label} ledger`);
  if (!Number.isSafeInteger(value.ledger.count) || value.ledger.count < 1 || !validDigest(value.ledger.stableSha256) || !validDigest(value.ledger.timestampSha256)) fail(`${label} ledger projection is invalid`);
  if (!value.ledger.rows || Object.keys(value.ledger.rows).length !== value.ledger.count) fail(`${label} ledger rows are invalid`);
  for (const [scope, row] of Object.entries(value.ledger.rows)) { if (!scope || !row || !same(Object.keys(row).sort(), ["appliedAt", "stableSha256"]) || !validDigest(row.stableSha256) || new Date(row.appliedAt).toISOString() !== row.appliedAt) fail(`${label} ledger row is invalid`); }
  exactKeys(value.containers, ["api", "postgres", "web"], `${label} containers`);
  for (const service of ["api", "postgres", "web"]) {
    const container = value.containers[service];
    exactKeys(container, ["healthy", "id", "imageId", "labels"], `${label} ${service} container`);
    if (container.healthy !== true || typeof container.id !== "string" || !container.id || typeof container.imageId !== "string" || !container.imageId.startsWith("sha256:") || !container.labels || typeof container.labels !== "object" || Array.isArray(container.labels)) fail(`${label} ${service} container projection is invalid`);
  }
  assertProjectedRoutes(value.routes, label, routeContract);
  exactKeys(value.topology, ["containersHealthy", "fixedPortsExact", "portOwnerExact", "project", "servicesExact"], `${label} topology`);
  if (value.releaseState !== "BLOCKED" || value.topology.project !== PROJECT || [value.topology.containersHealthy, value.topology.fixedPortsExact, value.topology.portOwnerExact, value.topology.servicesExact].some((item) => item !== true)) fail(`${label} authority is not exact`);
}
function assertEvidenceSchema(evidence) {
  exactKeys(evidence, EVIDENCE_KEYS, "evidence");
  if (evidence.format !== LOCAL_DELIVERY_FORMAT || evidence.version !== LOCAL_DELIVERY_VERSION || evidence.releaseState !== "BLOCKED" || !validRevision(evidence.implementationRevision) || !validDigest(evidence.lockfileSha256)) fail("evidence is not a strict blocked v1.1 local delivery record");
  exactKeys(evidence.attemptClaim, ["implementationRevision", "sha256"], "evidence claim");
  exactKeys(evidence.oldImages, ["api", "web"], "evidence old images");
  exactKeys(evidence.seeds, ["api", "web"], "evidence seeds");
  exactKeys(evidence.targets, ["api", "web"], "evidence targets");
  exactKeys(evidence.stages, ["postCutover", "postMigration", "preflight"], "evidence stages");
  if (evidence.attemptClaim.implementationRevision !== evidence.implementationRevision || !validDigest(evidence.attemptClaim.sha256) || !Object.values(evidence.oldImages).every(validImageId)) fail("evidence immutable identity is invalid");
  for (const app of ["api", "web"]) { exactKeys(evidence.seeds[app], ["inspectedId", "reference"], `evidence ${app} seed`); if (!validImageId(evidence.seeds[app].inspectedId) || typeof evidence.seeds[app].reference !== "string") fail(`evidence ${app} seed is invalid`); }
  for (const app of ["api", "web"]) {
    const target = evidence.targets[app];
    exactKeys(target, ["id", "labels", "probe"], `evidence ${app} target`);
    exactKeys(target.labels, REQUIRED_IMAGE_LABELS, `evidence ${app} labels`);
    exactKeys(target.probe, ["filesystemExact", "filesystemSha256", "storeSha256"], `evidence ${app} probe`);
    if (!validImageId(target.id) || target.probe.filesystemExact !== true || !validDigest(target.probe.filesystemSha256) || !validDigest(target.probe.storeSha256) || target.labels["org.opencontainers.image.revision"] !== evidence.implementationRevision || target.labels["io.blog-x.lockfile-sha256"] !== evidence.lockfileSha256 || !validImageId(target.labels["io.blog-x.seed-image-id"]) || target.labels["io.blog-x.application"] !== app || target.labels["io.blog-x.public-origin"] !== ORIGIN || target.labels["io.blog-x.refresh-kind"] !== LOCAL_DELIVERY_REFRESH_KIND) fail(`evidence ${app} target provenance is invalid`);
  }
  for (const name of ["preflight", "postMigration"]) assertProjectionSchema(evidence.stages[name], `evidence ${name}`, { routeContract: "observed" });
  assertProjectionSchema(evidence.stages.postCutover, "evidence postCutover", { routeContract: "final" });
  if (!factsEqual(evidence.stages.preflight.routes, evidence.stages.postMigration.routes)) fail("evidence pre-cutover route observations changed");
  for (const key of ["business", "database", "git", "media", "protected", "seeds", "sequences", "targets", "volumes"]) if (!factsEqual(evidence.stages.preflight[key], evidence.stages.postMigration[key]) || !factsEqual(evidence.stages.postMigration[key], evidence.stages.postCutover[key])) fail(`evidence ${key} stages are inconsistent`);
  for (const stage of Object.values(evidence.stages)) {
    if (stage.git.clean !== true || stage.git.implementationRevision !== evidence.implementationRevision || stage.git.lockfileSha256 !== evidence.lockfileSha256 || !validBranchRef(stage.git.ref) || !factsEqual(stage.git.ref, evidence.stages.preflight.git.ref) || !factsEqual(stage.seeds, evidence.seeds)) fail("evidence Git/lock/seed linkage is invalid");
    for (const app of ["api", "web"]) {
      const expected = { id: evidence.targets[app].id, labelsSha256: factsSha256(evidence.targets[app].labels), filesystemSha256: evidence.targets[app].probe.filesystemSha256, storeSha256: evidence.targets[app].probe.storeSha256 };
      if (!factsEqual(stage.targets[app], expected)) fail(`evidence ${app} target linkage is invalid`);
    }
  }
  if (evidence.stages.preflight.ledger.stableSha256 !== evidence.stages.postMigration.ledger.stableSha256 || evidence.stages.postMigration.ledger.stableSha256 !== evidence.stages.postCutover.ledger.stableSha256 || evidence.stages.preflight.ledger.timestampSha256 === evidence.stages.postMigration.ledger.timestampSha256 || evidence.stages.postMigration.ledger.timestampSha256 !== evidence.stages.postCutover.ledger.timestampSha256) fail("evidence ledger stage transition is invalid");
  const beforeRows = evidence.stages.preflight.ledger.rows; const migratedRows = evidence.stages.postMigration.ledger.rows; const cutoverRows = evidence.stages.postCutover.ledger.rows;
  if (!same(Object.keys(beforeRows), Object.keys(migratedRows)) || !same(Object.keys(migratedRows), Object.keys(cutoverRows))) fail("evidence ledger scopes changed");
  for (const scope of Object.keys(beforeRows)) { if (beforeRows[scope].stableSha256 !== migratedRows[scope].stableSha256 || !same(migratedRows[scope], cutoverRows[scope]) || (scope === "phase1" ? !(Date.parse(migratedRows[scope].appliedAt) > Date.parse(beforeRows[scope].appliedAt)) : migratedRows[scope].appliedAt !== beforeRows[scope].appliedAt)) fail("evidence row-addressed ledger transition is invalid"); }
  for (const app of ["api", "web"]) {
    if (evidence.stages.preflight.containers[app].imageId !== evidence.oldImages[app] || evidence.stages.postMigration.containers[app].imageId !== evidence.oldImages[app] || evidence.stages.postCutover.containers[app].imageId !== evidence.targets[app].id) fail(`evidence ${app} image transition is invalid`);
  }
  const bytes = JSON.stringify(evidence);
  if (/Mountpoint|relativePath|migration_fingerprint|applied_at|environment|command|postgres:\/\//i.test(bytes)) fail("evidence contains forbidden raw facts");
  return true;
}

export async function verifyRawRefreshEvidence(path, { claimStore, fs, runArgv, fetch, root } = {}) {
  if (!claimStore || !fs || typeof runArgv !== "function" || typeof fetch !== "function" || typeof root !== "string") fail("raw evidence verification boundaries are incomplete");
  const before = await fs.readFile(path, "utf8");
  const evidence = parseJson(before, "evidence"); assertEvidenceSchema(evidence);
  const claim = await claimStore.assertPresent(evidence.implementationRevision);
  if (claim.sha256 !== evidence.attemptClaim.sha256) fail("evidence attempt claim digest mismatch");
  const run = async (command, args, options = {}) => { assertAllowedRefreshCommand(command, args, options); return runArgv(command, args, options); };
  let verifiedGit;
  {
    const status = cleanOutput(await run("git", ["status", "--porcelain"])); const ref = cleanOutput(await run("git", ["symbolic-ref", "--quiet", "HEAD"])); const head = cleanOutput(await run("git", ["rev-parse", "HEAD"]));
    if (status || !validBranchRef(ref) || !validRevision(head)) fail("verification Git worktree is not a clean branch-qualified revision");
    if (head !== evidence.implementationRevision) {
      await run("git", ["merge-base", "--is-ancestor", evidence.implementationRevision, head]);
      const changed = cleanOutput(await run("git", ["diff", "--name-only", `${evidence.implementationRevision}..${head}`, "--"])).split("\n").filter(Boolean);
      const allowed = new Set([LOCAL_DELIVERY_EVIDENCE_PATH, ".planning/phases/06-public-discovery-data/06-03-SUMMARY.md", ".planning/phases/06-public-discovery-data/06-10-SUMMARY.md", ".planning/phases/06-public-discovery-data/06-11-SUMMARY.md"]);
      if (changed.some((item) => !allowed.has(item))) fail("intervening Git paths exceed the evidence/docs-only allowlist");
    }
    const committedLock = (await run("git", ["show", `${evidence.implementationRevision}:pnpm-lock.yaml`])).stdout;
    if (digest(committedLock) !== evidence.lockfileSha256) fail("committed raw lockfile digest does not match evidence");
    if (ref !== evidence.stages.postCutover.git.ref) fail("verification Git branch ref drifted from evidence");
    verifiedGit = { clean: true, implementationRevision: evidence.implementationRevision, lockfileSha256: digest(committedLock), ref };
  }
  const verificationState = { seeds: structuredClone(evidence.seeds), targetFacts: {} };
  const reconstruct = () => collectRefreshFacts({ sources: createRawRefreshFactSources({ run, fetch, root, fs, state: verificationState }) });
  const probe = async (targets) => {
    for (const app of ["api", "web"]) {
      const target = targets[app];
      const seed = parseJson((await run("docker", ["image", "inspect", evidence.seeds[app].reference])).stdout, `verify ${app} seed`)[0];
      if (seed?.Id !== evidence.seeds[app].inspectedId) fail(`verified ${app} seed reference drifted`);
      const image = parseJson((await run("docker", ["image", "inspect", target.id])).stdout, `verify ${app} image`)[0];
      if (image?.Id !== target.id || image.Config?.WorkingDir !== "/refresh-workspace" || !factsEqual(selectedLabels(image.Config?.Labels), target.labels)) fail(`verified ${app} target image drifted`);
      const store = cleanOutput(await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "corepack", target.id, "pnpm", "--store-dir=/pnpm-store", "store", "path"]));
      if (digest(store) !== target.probe.storeSha256) fail(`verified ${app} target store drifted`);
      await run("docker", ["run", "--rm", "--network=none", "--entrypoint", "node", target.id, "-e", TARGET_FS_PROGRAM, app, store]);
      const filesystemSha256 = digest(`${app}:${image.Config.WorkingDir}:${JSON.stringify(image.Config.Cmd)}`);
      if (filesystemSha256 !== target.probe.filesystemSha256) fail(`verified ${app} target filesystem drifted`);
      verificationState.targetFacts[app] = { id: image.Id, labelsSha256: factsSha256(selectedLabels(image.Config?.Labels)), filesystemSha256, storeSha256: digest(store) };
    }
  };
  await probe(evidence.targets);
  const current = await reconstruct();
  current.git = verifiedGit;
  assertFixedRuntimeAuthority(current);
  if (!factsEqual(projectSanitizedFacts(current, { routeContract: "final" }), evidence.stages.postCutover)) fail("current runtime facts drifted from evidence");
  const after = await fs.readFile(path, "utf8");
  if (after !== before) fail("read-only evidence verification changed evidence");
  return evidence;
}

export function inspectRefreshAttemptClaimWithStore(revision, claimStore) { return claimStore.assertPresent(revision); }

const PHASE_REPORT_STAGE = Object.freeze({
  preflight: "preflight_collection",
  "inspect-target-images": "build-web",
});

export async function runRefreshCliBoundary({ argv, resolveRevision, attemptStore, adapterFactory, output, readLockfile, materializePlan, executeRefresh, verifyEvidence, probeOffline, stageBoundary = () => undefined }) {
  const evidenceOption = argv.find((item) => item.startsWith("--verify-evidence="));
  if (evidenceOption) {
    if (argv.length !== 1 || evidenceOption !== `--verify-evidence=${LOCAL_DELIVERY_EVIDENCE_PATH}`) fail("evidence verification accepts only the fixed evidence path");
    await verifyEvidence(); output.write("LOCAL REFRESH EVIDENCE VERIFIED; RELEASE BLOCKED\n"); return { releaseState: "BLOCKED" };
  }
  if (argv.includes("--probe-offline-builds")) {
    if (argv.length !== 1 || argv[0] !== "--probe-offline-builds") fail("offline probe option is not exact");
    const result = await probeOffline(); output.write(`OFFLINE REFRESH PROBES PASSED ${result.revision.slice(0, 12)}\n`); return result;
  }
  const claimOption = argv.find((item) => item.startsWith("--check-attempt-claim="));
  if (claimOption) {
    const modeValue = claimOption.slice("--check-attempt-claim=".length);
    const revision = argv[1]?.startsWith("--revision=") ? argv[1].slice("--revision=".length) : "";
    if (argv.length !== 2 || argv[0] !== `--check-attempt-claim=${modeValue}` || argv[1] !== `--revision=${revision}` || !["absent", "present"].includes(modeValue) || !validRevision(revision)) fail("attempt claim check requires one exact mode and one full revision");
    const result = modeValue === "absent" ? await attemptStore.assertAbsent(revision) : await attemptStore.assertPresent(revision);
    output.write(`LOCAL REFRESH ATTEMPT CLAIM ${modeValue.toUpperCase()} ${revision}\n`); return result;
  }
  const failureOption = argv.find((item) => item.startsWith("--check-failure-report="));
  if (failureOption) {
    const modeValue = failureOption.slice("--check-failure-report=".length);
    const revision = argv[1]?.startsWith("--revision=") ? argv[1].slice("--revision=".length) : "";
    if (argv.length !== 2 || argv[0] !== `--check-failure-report=${modeValue}` || argv[1] !== `--revision=${revision}` || !["absent", "present"].includes(modeValue) || !validRevision(revision)) fail("failure report check requires exact ordered mode and revision arguments");
    const result = modeValue === "absent" ? await attemptStore.assertFailureReportAbsent(revision) : await attemptStore.assertFailureReportPresent(revision);
    output.write(modeValue === "absent" ? `REFRESH FAILURE REPORT ABSENT ${revision}\n` : `REFRESH FAILURE REPORT PRESENT ${revision} ${result.sha256}\n`); return result;
  }
  if (argv.length) fail("unknown refresh CLI option");
  const revision = await resolveRevision();
  if (!validRevision(revision)) fail("revision must be a clean full Git SHA");
  await attemptStore.assertAbsent(revision);
  const claim = await attemptStore.claimRefreshAttempt(revision);
  let adapter; let failureStage = "adapter_construction";
  try {
    stageBoundary(failureStage);
    adapter = await adapterFactory();
    failureStage = "claim_attachment"; stageBoundary(failureStage);
    adapter.attachAttemptClaim(claim);
    failureStage = "lockfile_plan_materialization"; stageBoundary(failureStage);
    const plan = materializePlan(await readLockfile(), revision);
    failureStage = "preflight_collection";
    return await executeRefresh(adapter, plan);
  } catch (error) {
    const phase = error?.refreshStage ?? adapter?.currentPhase?.();
    if (phase && phase !== "constructed") failureStage = PHASE_REPORT_STAGE[phase] ?? phase;
    let detail = { baseline: "not_applicable", recollection: "not_attempted", preservation: "not_applicable_pre_runtime", facts: { preflight: null, current: null, rollback: null } };
    if (adapter?.recollectFailure && !["claim_attachment", "lockfile_plan_materialization"].includes(failureStage)) {
      try { stageBoundary("failure_recollection"); detail = await adapter.recollectFailure(error); }
      catch { failureStage = "failure_recollection"; detail = { baseline: "applicable", recollection: "failed", preservation: "unproved", facts: { preflight: null, current: null, rollback: null } }; }
    }
    const report = { format: "blog-x-local-refresh-failure", version: 1, implementationRevision: revision, claimSha256: claim.sha256, stage: failureStage, errorClass: String(error?.name ?? "error").toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "error", ...detail };
    try { stageBoundary("failure_report_publication"); await attemptStore.writeFailureReport(report); }
    catch (reportError) {
      const code = String(reportError?.code ?? "publication_failed").replace(/[^A-Za-z0-9_-]/g, "_");
      throw new Error(`UNRECOVERABLE_FAILURE_REPORT_INVARIANT:${code}`, { cause: error });
    }
    const classification = classifySeedPrerequisiteFailure(error);
    if (classification) output.write(`${formatSeedPrewarmInstruction(classification)}\n`);
    throw classification ? new Error(`local refresh: seed prerequisite ${classification}`) : error;
  }
}

export { CLAIM_ROOT, nativeFs };
