#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = new URL("../", import.meta.url).pathname;
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, value = "true"] = argument.replace(/^--/, "").split("=", 2);
  return [key, value];
}));
const scope = args.get("scope") ?? "all";
const baselineRef = args.get("baseline-ref");
const revisionPattern = /^[a-f0-9]{40}$/;

if (!["web", "api", "all"].includes(scope)) throw new Error("--scope must be web, api, or all");
if (baselineRef !== "e7f4814e7f8faa2111c1c937f3d99910fbcc7100") throw new Error("--baseline-ref must be the fixed 40-character production baseline");
if (!revisionPattern.test(baselineRef)) throw new Error("baseline revision is invalid");

const runId = `blogx-hardening-${process.pid}-${Date.now().toString(36)}`;
const names = {
  network: `${runId}-network`, postgres: `${runId}-postgres`, api: `${runId}-api`, web: `${runId}-web`,
  baselineWeb: `${runId}-web-baseline`, candidateWeb: `${runId}-web-candidate`,
  baselineApi: `${runId}-api-baseline`, candidateApi: `${runId}-api-candidate`,
  media: `${runId}-media`,
};
const created = { containers: new Set(), networks: new Set(), volumes: new Set(), images: new Set() };

async function command(commandName, commandArgs, options = {}) {
  const result = await execFile(commandName, commandArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  return String(result.stdout ?? "").trim();
}

async function docker(commandArgs, options) { return command("docker", commandArgs, options); }

async function archiveRevision(ref, destination) {
  const tarPath = `${destination}.tar`;
  const result = await execFile("git", ["archive", "--format=tar", ref], { cwd: root, encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
  await writeFile(tarPath, result.stdout);
  await command("mkdir", ["-p", destination]);
  await command("tar", ["-xf", tarPath, "-C", destination]);
  await rm(tarPath, { force: true });
}

async function inspectSize(tag) {
  const bytes = Number(await docker(["image", "inspect", "--format", "{{.Size}}", tag]));
  assert.ok(Number.isSafeInteger(bytes) && bytes > 0, `could not read image size for ${tag}`);
  return bytes;
}

async function build(context, dockerfile, tag, revision) {
  await docker(["build", "--pull=false", "--build-arg", `BLOG_X_REVISION=${revision}`, "--build-arg", "PUBLIC_ORIGIN=http://hardening.test", "-f", dockerfile, "-t", tag, context]);
  created.images.add(tag);
}

async function waitFor(commandArgs, description) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await docker(commandArgs); return; } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  throw new Error(`${description} did not become ready: ${lastError?.stderr ?? lastError}`);
}

async function assertNoPaths(tag, paths) {
  for (const path of paths) {
    await docker(["run", "--rm", "--entrypoint", "/bin/sh", tag, "-ec", `test ! -e ${JSON.stringify(path)}`]);
  }
}

async function assertNoDirectDevDependencies(tag, packagePath) {
  const manifest = JSON.parse(await readFile(join(root, packagePath), "utf8"));
  const dependencies = Object.keys(manifest.devDependencies ?? {});
  for (const dependency of dependencies) {
    const probe = "const {createRequire}=require('node:module');const r=createRequire(process.cwd()+'/x.js');try{r.resolve(process.argv[1]+'/package.json');process.exit(1)}catch{process.exit(0)}";
    await docker(["run", "--rm", "--entrypoint", "node", tag, "-e", probe, dependency]);
  }
}

function restrictedRun(name, image, extra = []) {
  return ["run", "-d", "--name", name, "--user", "1000:1000", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--tmpfs", "/tmp:rw,noexec,nosuid,uid=1000,gid=1000,size=64m", "--tmpfs", "/workspace/apps/web/.next/cache:rw,nosuid,uid=1000,gid=1000,size=64m", ...extra, image];
}

async function startWebFixture(candidateContext) {
  await docker(["network", "create", "--label", `blog-x.hardening=${runId}`, names.network]);
  created.networks.add(names.network);
  await docker(["run", "-d", "--name", names.postgres, "--network", names.network, "--network-alias", "postgres", "--label", `blog-x.hardening=${runId}`, "-e", "POSTGRES_DB=blog_x", "-e", "POSTGRES_USER=blog_x", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:18-alpine"]);
  created.containers.add(names.postgres);
  await waitFor(["exec", names.postgres, "pg_isready", "-U", "blog_x", "-d", "blog_x"], "isolated PostgreSQL");
  const fixtureApi = `${runId}-fixture-api`;
  await build(candidateContext, "apps/api/Dockerfile", fixtureApi, "0".repeat(40));
  await docker(["run", "-d", "--name", names.api, "--network", names.network, "--network-alias", "api", "--label", `blog-x.hardening=${runId}`, "-e", "DATABASE_URL=postgres://blog_x@postgres:5432/blog_x", "-e", "PUBLIC_ORIGIN=http://hardening.test", "-e", "API_HOST=0.0.0.0", "-e", "API_PORT=3001", "-e", "TRUSTED_PROXY_CIDRS=0.0.0.0/0", "-e", "MEDIA_ROOT=/tmp/media", fixtureApi]);
  created.containers.add(names.api);
  await waitFor(["exec", names.api, "node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], "isolated API");
}

async function verifyWeb(candidateContext) {
  const baselineContext = join(temporaryRoot, "baseline");
  await build(baselineContext, "apps/web/Dockerfile", names.baselineWeb, baselineRef);
  await build(candidateContext, "apps/web/Dockerfile", names.candidateWeb, "f".repeat(40));
  const [baselineBytes, candidateBytes] = await Promise.all([inspectSize(names.baselineWeb), inspectSize(names.candidateWeb)]);
  console.log(`web image bytes baseline=${baselineBytes} candidate=${candidateBytes}`);
  assert.ok(candidateBytes < baselineBytes, `Web candidate (${candidateBytes}) must be smaller than baseline (${baselineBytes})`);
  await assertNoDirectDevDependencies(names.candidateWeb, "apps/web/package.json");
  await assertNoPaths(names.candidateWeb, ["/workspace/apps/web/app", "/workspace/apps/web/e2e", "/workspace/apps/web/tsconfig.json", "/workspace/tsconfig.base.json"]);
  assert.equal(await docker(["image", "inspect", "--format", "{{.Config.User}}", names.candidateWeb]), "node");
  await startWebFixture(candidateContext);
  await docker(restrictedRun(names.web, names.candidateWeb, ["--network", names.network, "-e", "NODE_ENV=production", "-e", "HOST=0.0.0.0", "-e", "PORT=3100", "-e", "PUBLIC_ORIGIN=http://hardening.test", "-e", "INTERNAL_API_ORIGIN=http://api:3001", "-e", "BLOG_X_INGRESS_AUTH_SECRET=01234567890123456789012345678901"]));
  created.containers.add(names.web);
  await waitFor(["exec", names.web, "node", "-e", "fetch('http://127.0.0.1:3100/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], "hardened Web");
  const request = "fetch('http://127.0.0.1:3100/api/health',{headers:{'x-blog-x-client-ip':'127.0.0.1','x-blog-x-ingress-auth':'01234567890123456789012345678901'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";
  await docker(["exec", "--user", "1000:1000", names.web, "node", "-e", request]);
  const marker = "const fs=require('node:fs/promises');const path=process.argv[1];fs.writeFile(path,'ok').then(()=>fs.readFile(path)).then(()=>fs.rm(path)).catch(e=>{console.error(e);process.exit(1)})";
  await docker(["exec", "--user", "1000:1000", names.web, "node", "-e", marker, "/tmp/blog-x-write-probe"]);
  await docker(["exec", "--user", "1000:1000", names.web, "node", "-e", marker, "/workspace/apps/web/.next/cache/blog-x-write-probe"]);
  await assert.rejects(() => docker(["exec", "--user", "1000:1000", names.web, "node", "-e", "require('node:fs').writeFileSync('/workspace/blog-x-write-probe','no')"]));
  assert.equal(await docker(["diff", names.web]), "", "hardened Web must not mutate its container filesystem");
  return { baselineBytes, candidateBytes };
}

async function cleanup() {
  for (const name of created.containers) await docker(["rm", "-f", name]).catch(() => {});
  for (const name of created.networks) await docker(["network", "rm", name]).catch(() => {});
  for (const name of created.volumes) await docker(["volume", "rm", name]).catch(() => {});
  for (const tag of created.images) await docker(["image", "rm", "-f", tag]).catch(() => {});
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "blog-x-production-hardening-"));
try {
  await archiveRevision(baselineRef, join(temporaryRoot, "baseline"));
  await archiveRevision("HEAD", join(temporaryRoot, "candidate"));
  if (scope === "web") await verifyWeb(join(temporaryRoot, "candidate"));
  if (scope === "api") throw new Error("API hardening acceptance is not installed yet");
  if (scope === "all") throw new Error("full hardening acceptance is not installed yet");
} finally {
  await cleanup();
  await rm(temporaryRoot, { recursive: true, force: true });
}
