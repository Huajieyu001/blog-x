import { createHash, randomBytes } from "node:crypto";
import {
  chmod, lstat, link, mkdir, open, readFile, realpath, rename, rm, stat, unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const CLAIM_ROOT = "/private/tmp/blog-x-refresh-attempts";
const EVIDENCE_PATH = "ops/phase6-local-refresh-evidence.json";
const COMPOSE_FILE = "compose.yaml";
const PROJECT = "blogxlocal";
const ORIGIN = "http://127.0.0.1:3100";
const SERVICES = ["api", "web"];
const CONTAINERS = ["blogxlocal-postgres-1", "blogxlocal-api-1", "blogxlocal-web-1"];
const VOLUMES = ["blogxlocal_postgres-data", "blogxlocal_media-data"];

function fail(message) { throw new Error(`local refresh: ${message}`); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function validRevision(revision) { return typeof revision === "string" && /^[a-f0-9]{40}$/.test(revision); }
function canonical(value) { return JSON.stringify(value, Object.keys(value).sort()); }
function canonicalClaim(revision) {
  if (!validRevision(revision)) fail("attempt claim revision must be lowercase full SHA");
  return `${JSON.stringify({ format: "blog-x-local-refresh-attempt", version: 1, implementationRevision: revision })}\n`;
}

const nativeFs = { chmod, lstat, link, mkdir, open, readFile, realpath, rename, rm, stat, unlink };

function assertClaimRoot(root) {
  if (typeof root !== "string" || !isAbsolute(root) || root === "/" || basename(root) !== "blog-x-refresh-attempts") fail("attempt claim root is unsafe");
}

export function createRefreshAttemptStore({ root = CLAIM_ROOT, fs = nativeFs } = {}) {
  assertClaimRoot(root);
  const pathFor = (revision) => {
    if (!validRevision(revision)) fail("attempt claim revision must be lowercase full SHA");
    return resolve(root, `${revision}.json`);
  };
  async function missing(path) {
    try { await fs.lstat(path); return false; } catch (error) { if (error?.code === "ENOENT") return true; throw error; }
  }
  async function assertDirectory({ create = false } = {}) {
    if (create) await fs.mkdir(root, { recursive: true, mode: 0o700 });
    if (await missing(root)) return false;
    const entry = await fs.lstat(root);
    if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o777) !== 0o700) fail("attempt claim root must be a real mode-0700 directory");
    // macOS commonly exposes /private/tmp through a symlinked parent; lstat on the
    // final fixed directory is the portable boundary we can enforce here.
    return true;
  }
  return Object.freeze({
    root,
    pathFor,
    async assertAbsent(revision) {
      const path = pathFor(revision);
      if (!(await assertDirectory())) return { present: false };
      if (!(await missing(path))) fail("refresh attempt is already claimed");
      return { present: false };
    },
    async assertPresent(revision) {
      const path = pathFor(revision);
      if (!(await assertDirectory()) || await missing(path)) fail("refresh attempt claim is absent");
      const bytes = await fs.readFile(path, "utf8");
      if (bytes !== canonicalClaim(revision)) fail("refresh attempt claim bytes are not canonical");
      return { present: true, bytes, sha256: digest(bytes) };
    },
    async claimRefreshAttempt(revision) {
      const finalPath = pathFor(revision);
      await assertDirectory({ create: true });
      if (!(await missing(finalPath))) fail("refresh attempt is already claimed");
      const bytes = canonicalClaim(revision);
      const tempPath = resolve(root, `.${revision}.${randomBytes(12).toString("hex")}.tmp`);
      let handle;
      try {
        handle = await fs.open(tempPath, "wx", 0o600);
        await handle.writeFile(bytes, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        try { await fs.link(tempPath, finalPath); } catch (error) {
          if (error?.code === "EEXIST") fail("refresh attempt is already claimed");
          throw error;
        }
        const directory = await fs.open(root, "r");
        await directory.sync();
        await directory.close();
        return { implementationRevision: revision, bytes, sha256: digest(bytes) };
      } finally {
        await handle?.close().catch(() => undefined);
        await fs.unlink(tempPath).catch(() => undefined);
      }
    },
  });
}

function composePrefix(args) {
  return args[0] === "-p" && args[1] === PROJECT && args[2] === "-f" && args[3] === COMPOSE_FILE;
}

/** Positive command allowlist: all stateful actions below remain fixed to blogxlocal. */
export function assertAllowedRefreshArgv(command, args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) fail("command argv is invalid");
  if (command === "git") {
    if (["status --porcelain", "rev-parse HEAD", "hash-object pnpm-lock.yaml"].includes(args.join(" "))) return;
  }
  if (command === "docker") {
    if (args[0] === "build" && args.includes("--network=none") && args.includes("--pull=false") && args.includes("--file") && args.includes("--tag") && args.at(-1) === "." && !args.some((arg) => /network=host|buildx|pull$/.test(arg))) return;
    if (["container", "image", "volume"].includes(args[0]) && args[1] === "inspect") return;
    if (args[0] === "run" && args.includes("--network=none") && args.includes("--rm")) return;
  }
  if (command === "docker-compose" && composePrefix(args)) {
    const tail = args.slice(4);
    if (["config", "ps"].includes(tail[0])) return;
    if (tail[0] === "exec" && tail[1] === "-T" && ["postgres", "api", "web"].includes(tail[2])) return;
    if (tail[0] === "run" && tail[1] === "--rm" && tail[2] === "--no-deps" && tail[3] === "api") return;
    if (tail[0] === "up" && tail.slice(1, 5).join(" ") === "-d --wait --no-build --no-deps" && tail.slice(5).join(" ") === "api web") return;
  }
  if (command === "node" && args[0] === "scripts/release-gate.mjs" && args.includes("--expect-blocked")) return;
  fail(`command is not allowlisted: ${command} ${args.join(" ")}`);
}

function parseJson(stdout, label) { try { return JSON.parse(stdout); } catch { fail(`${label} returned invalid JSON`); } }
function normalizeVolume(volumes) {
  return volumes.map(({ Name, Driver, Mountpoint, CreatedAt, Scope, Labels, Options }) => ({ Name, Driver, Mountpoint, CreatedAt, Scope, Labels: Labels ?? {}, Options: Options ?? {} })).sort((a, b) => a.Name.localeCompare(b.Name));
}
function redactError(error) { return String(error?.message ?? error).replace(/postgres:\/\/\S+/g, "[redacted]"); }

export function createLiveRefreshAdapter({ runArgv, claimStore = createRefreshAttemptStore(), fetch = globalThis.fetch, now = () => new Date().toISOString(), root = process.cwd(), evidenceFs = nativeFs } = {}) {
  if (typeof runArgv !== "function" || typeof fetch !== "function") fail("live adapter requires argv runner and loopback fetch");
  const state = { preflight: undefined, claim: undefined, targets: {}, cutover: false, evidence: undefined };
  const run = async (command, args, options) => { assertAllowedRefreshArgv(command, args); return runArgv(command, args, options); };
  const inspect = async (kind, refs) => parseJson((await run("docker", [kind, "inspect", ...refs])).stdout, `${kind} inspect`);
  const snapshot = async () => {
    const containers = await inspect("container", CONTAINERS);
    const volumes = normalizeVolume(await inspect("volume", VOLUMES));
    return { containers: containers.map((item) => ({ id: item.Id, image: item.Image, reference: item.Config?.Image, name: item.Name, health: item.State?.Health?.Status, ports: item.NetworkSettings?.Ports ?? {} })).sort((a, b) => a.name.localeCompare(b.name)), volumes, volumeSha256: digest(JSON.stringify(volumes)) };
  };
  const assertAuthority = (snap) => {
    if (snap.containers.length !== 3 || snap.containers.some((item) => !CONTAINERS.includes(item.name.slice(1)) || item.health !== "healthy")) fail("fixed runtime is not exactly healthy");
    const web = snap.containers.find((item) => item.name === "/blogxlocal-web-1");
    const api = snap.containers.find((item) => item.name === "/blogxlocal-api-1");
    const postgres = snap.containers.find((item) => item.name === "/blogxlocal-postgres-1");
    if (!web || !api || !postgres || Object.keys(api.ports).length || Object.keys(postgres.ports).length || JSON.stringify(web.ports["3100/tcp"]) !== JSON.stringify([{ HostIp: "127.0.0.1", HostPort: "3100" }])) fail("fixed port topology is invalid");
  };
  const route = async (path, expected, body) => {
    const response = await fetch(`${ORIGIN}${path}`);
    if (response.status !== expected) fail(`route ${path} returned ${response.status}`);
    if (body) {
      const actual = await response.json();
      for (const [key, value] of Object.entries(body)) if (actual[key] !== value) fail(`route ${path} contract ${key}`);
    }
  };
  return Object.freeze({
    assertAllowedArgv: assertAllowedRefreshArgv,
    async execute(phase, plan) {
      if (phase === "preflight") {
        state.preflight = await snapshot(); assertAuthority(state.preflight);
        for (const target of plan.targets) {
          const current = state.preflight.containers.find((entry) => entry.name === `/blogxlocal-${target.application}-1`);
          if (!current?.image?.startsWith("sha256:") || !current.reference) fail("fixed seed image authority is missing");
          target.seedId = current.image;
          target.seedReference = current.reference;
          target.labels["io.blog-x.seed-image-id"] = current.image;
        }
        state.claim = await claimStore.claimRefreshAttempt(plan.revision);
        return;
      }
      if (!state.claim) fail("refresh attempt must be claimed before mutation");
      if (phase === "build-api" || phase === "build-web") {
        const target = plan.targets.find((entry) => entry.application === phase.slice(6));
        const args = ["build", "--network=none", "--pull=false", "--file", target.dockerfile, "--tag", target.tag, "--build-arg", `SEED_IMAGE=${target.seedReference}`, "--build-arg", `SEED_IMAGE_ID=${target.seedId}`, "--build-arg", `REFRESH_REVISION=${plan.revision}`, "--build-arg", `LOCKFILE_SHA256=${plan.lockSha256}`, "--build-arg", `PUBLIC_ORIGIN=${ORIGIN}`, "."];
        await run("docker", args); state.targets[target.application] = (await inspect("image", [target.tag]))[0]; return;
      }
      if (phase === "inspect-target-images") {
        for (const target of plan.targets) {
          const image = state.targets[target.application]; const labels = image?.Config?.Labels ?? {};
          if (!image?.Id?.startsWith("sha256:") || Object.entries(target.labels).some(([key, value]) => labels[key] !== value) || image.Config?.WorkingDir !== "/refresh-workspace" || image.Config?.Cmd?.some((part) => String(part).includes("/workspace"))) fail("target provenance or filesystem configuration is invalid");
        }
        return;
      }
      if (phase === "migrate" || phase === "schema-verify") {
        const command = phase === "migrate" ? "db:migrate" : "db:schema:verify";
        await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "run", "--rm", "--no-deps", "api", "corepack", "pnpm", "--filter", "@blog-x/api", command]); return;
      }
      if (phase === "cutover-api-web") {
        state.cutover = true;
        await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"], { env: { BLOG_X_API_IMAGE: plan.targets.find((target) => target.application === "api").tag, BLOG_X_WEB_IMAGE: plan.targets.find((target) => target.application === "web").tag } });
        const current = await snapshot(); assertAuthority(current);
        for (const target of plan.targets) if (current.containers.find((entry) => entry.name === `/blogxlocal-${target.application}-1`)?.image !== state.targets[target.application].Id) fail("cutover image ID mismatch");
        return;
      }
      if (phase === "routes") { await route("/", 200); await route("/categories", 200); await route("/tags", 200); await route("/archive", 200); await route("/api/health", 200); await route("/api/public/search?q=", 200, { state: "empty_query" }); await route("/api/public/articles/phase6-unknown/related", 404, { error: "not_found" }); return; }
      if (phase === "release-blocked") { await run("node", ["scripts/release-gate.mjs", "--evidence=ops/release-evidence.blocked.json", "--expect-blocked"]); return; }
      if (phase === "write-evidence") {
        const after = await snapshot(); assertAuthority(after);
        if (after.volumeSha256 !== state.preflight.volumeSha256 || after.containers.find((item) => item.name === "/blogxlocal-postgres-1").id !== state.preflight.containers.find((item) => item.name === "/blogxlocal-postgres-1").id) fail("persistence authority changed");
        const evidence = { format: "blog-x-phase6-local-refresh-evidence", version: 2, implementationRevision: plan.revision, lockfileSha256: plan.lockSha256, releaseState: "BLOCKED", createdAt: now(), attemptClaim: { implementationRevision: state.claim.implementationRevision, sha256: state.claim.sha256 }, targets: Object.fromEntries(Object.entries(state.targets).map(([key, image]) => [key, { id: image.Id, labels: image.Config?.Labels ?? {}, workdir: image.Config?.WorkingDir, cmd: image.Config?.Cmd ?? [] }])), runtime: { before: state.preflight, after } };
        const bytes = `${JSON.stringify(evidence, null, 2)}\n`; const finalPath = resolve(root, EVIDENCE_PATH); const temp = resolve(dirname(finalPath), `.${basename(finalPath)}.${randomBytes(8).toString("hex")}.tmp`);
        const handle = await evidenceFs.open(temp, "wx", 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await evidenceFs.rename(temp, finalPath); state.evidence = evidence; return;
      }
      if (phase === "rollback-api-web") {
        if (!state.cutover) return;
        await run("docker-compose", ["-p", PROJECT, "-f", COMPOSE_FILE, "up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"], { env: { BLOG_X_API_IMAGE: state.preflight.containers.find((entry) => entry.name === "/blogxlocal-api-1").reference, BLOG_X_WEB_IMAGE: state.preflight.containers.find((entry) => entry.name === "/blogxlocal-web-1").reference } });
        return;
      }
      if (phase === "verify-rollback") { const restored = await snapshot(); assertAuthority(restored); for (const old of state.preflight.containers) if (old.name !== "/blogxlocal-postgres-1" && restored.containers.find((entry) => entry.name === old.name)?.image !== old.image) fail("rollback image ID mismatch"); return; }
      fail(`unknown live refresh phase ${phase}`);
    },
  });
}

export async function verifyLiveRefreshEvidence(path, { claimStore = createRefreshAttemptStore(), fs = nativeFs } = {}) {
  const before = await fs.readFile(path, "utf8"); const evidence = parseJson(before, "evidence");
  if (evidence?.format !== "blog-x-phase6-local-refresh-evidence" || evidence.version !== 2 || evidence.releaseState !== "BLOCKED" || !validRevision(evidence.implementationRevision) || evidence.attemptClaim?.implementationRevision !== evidence.implementationRevision) fail("evidence is not a strict blocked local refresh record");
  const claim = await claimStore.assertPresent(evidence.implementationRevision);
  if (claim.sha256 !== evidence.attemptClaim.sha256) fail("evidence attempt claim digest mismatch");
  const after = await fs.readFile(path, "utf8"); if (after !== before) fail("read-only evidence verification changed evidence");
  return evidence;
}

export { CLAIM_ROOT, EVIDENCE_PATH };
