import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import { assertPhase6CleanupAcknowledgement } from "./local-delivery-acceptance.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const composeFile = `${root}/compose.yaml`;
const activeDockerRegression = process.env.BLOG_X_ACTIVE_DOCKER_CLEANUP_REGRESSION === "1";

function generatedNamespace() {
  return `blogxverify_${randomBytes(6).toString("hex")}`;
}

async function docker(args, { allowFailure = false, env = process.env } = {}) {
  try {
    return await execFileAsync(args[0], args.slice(1), { cwd: root, env, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    if (allowFailure) return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", failed: true };
    throw error;
  }
}

async function canonicalSnapshot() {
  const [containers, volumes] = await Promise.all([
    docker(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=blogxlocal"]),
    docker(["docker", "volume", "ls", "-q", "--filter", "label=com.docker.compose.project=blogxlocal"]),
  ]);
  return { containers: containers.stdout.trim().split("\n").filter(Boolean).sort(), volumes: volumes.stdout.trim().split("\n").filter(Boolean).sort() };
}

async function exactAuthorityState(namespace) {
  assert.match(namespace, /^blogxverify_[a-z0-9]{12}$/);
  const containers = await docker(["docker", "ps", "-aq", "--filter", `label=com.docker.compose.project=${namespace}`]);
  const volumes = [];
  for (const name of [`${namespace}_postgres-data`, `${namespace}_media-data`]) {
    const inspected = await docker(["docker", "volume", "inspect", name], { allowFailure: true });
    if (!inspected.failed) volumes.push(name);
  }
  return { containers: containers.stdout.trim().split("\n").filter(Boolean), volumes };
}

async function cleanupExactAuthority(namespace) {
  assert.match(namespace, /^blogxverify_[a-z0-9]{12}$/);
  await docker(["docker-compose", "-p", namespace, "-f", composeFile, "down", "--remove-orphans", "--volumes"], { allowFailure: true });
  const state = await exactAuthorityState(namespace);
  assert.deepEqual(state, { containers: [], volumes: [] });
}

function startPhase6(namespace) {
  const child = spawn(process.execPath, ["scripts/local-verify.mjs", "--phase6-data", "--skip-build", `--namespace=${namespace}`], {
    cwd: root,
    env: { ...process.env, LANG: "C" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const closed = new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => accept({ exitCode, signal }));
  });
  return { child, closed, output: () => output };
}

async function waitForActiveAuthority(namespace, runtime, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) {
      throw new Error(`Phase 6 child exited before its generated authority became active\n${runtime.output()}`);
    }
    const state = await exactAuthorityState(namespace);
    if (state.containers.length && state.volumes.length === 2) return state;
    await new Promise((accept) => setTimeout(accept, 250));
  }
  throw new Error(`timed out waiting for active generated Phase 6 authority\n${runtime.output()}`);
}

function signalTree(child, signal) {
  if (process.platform === "win32") return child.kill(signal);
  process.kill(-child.pid, signal);
}

async function waitBounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("active generated Phase 6 authority acknowledges exact cleanup after TERM", {
  skip: !activeDockerRegression || process.platform === "win32",
  timeout: 150_000,
}, async () => {
  const namespace = generatedNamespace();
  const canonicalBefore = await canonicalSnapshot();
  const runtime = startPhase6(namespace);
  try {
    const active = await waitForActiveAuthority(namespace, runtime);
    assert.ok(active.containers.length > 0);
    assert.deepEqual(active.volumes.sort(), [`${namespace}_media-data`, `${namespace}_postgres-data`].sort());
    signalTree(runtime.child, "SIGTERM");
    const closed = await waitBounded(runtime.closed, 20_000, "cooperative Phase 6 cleanup");
    assert.equal(closed.exitCode, 1);
    const acknowledgement = assertPhase6CleanupAcknowledgement(runtime.output());
    assert.deepEqual(acknowledgement.namespaces.map((authority) => authority.namespace), [namespace]);
    assert.deepEqual(await exactAuthorityState(namespace), { containers: [], volumes: [] });
  } finally {
    if (runtime.child.exitCode === null && runtime.child.signalCode === null) signalTree(runtime.child, "SIGKILL");
    await cleanupExactAuthority(namespace);
    assert.deepEqual(await canonicalSnapshot(), canonicalBefore, "active cleanup regression changed canonical blogxlocal authority");
  }
});

test("forced kill never emits a generated Phase 6 cleanup acknowledgement", {
  skip: !activeDockerRegression || process.platform === "win32",
  timeout: 150_000,
}, async () => {
  const namespace = generatedNamespace();
  const canonicalBefore = await canonicalSnapshot();
  const runtime = startPhase6(namespace);
  try {
    await waitForActiveAuthority(namespace, runtime);
    signalTree(runtime.child, "SIGKILL");
    const closed = await waitBounded(runtime.closed, 10_000, "forced Phase 6 termination");
    assert.equal(closed.signal, "SIGKILL");
    assert.throws(() => assertPhase6CleanupAcknowledgement(runtime.output()), /exactly one/i);
  } finally {
    if (runtime.child.exitCode === null && runtime.child.signalCode === null) signalTree(runtime.child, "SIGKILL");
    await cleanupExactAuthority(namespace);
    assert.deepEqual(await canonicalSnapshot(), canonicalBefore, "forced cleanup regression changed canonical blogxlocal authority");
  }
});
