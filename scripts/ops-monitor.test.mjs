import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runMonitor, runMonitorCli } from "./ops-monitor.mjs";

const fixedNow = () => new Date("2032-01-01T00:00:00.000Z");

function status(role, state = "PASS", checks = [{ id: "web-api", status: "PASS" }]) {
  return { format: "blog-x-ops-status", version: 1, scope: role, observedAt: fixedNow().toISOString(), status: state, checks };
}

async function authorities() {
  const root = await mkdtemp(join(tmpdir(), "blog-x-monitor-"));
  return {
    root,
    resultRoot: await mkdtemp(join(root, "results-")),
    stateRoot: await mkdtemp(join(root, "state-")),
    evidenceRoot: await mkdtemp(join(root, "evidence-")),
    jobResultsRoot: await mkdtemp(join(root, "jobs-")),
    backupResultsRoot: await mkdtemp(join(root, "backups-")),
    spoolRoot: await mkdtemp(join(root, "spool-")),
  };
}

function edgePolicy(roots, provider = { kind: "stdout" }) {
  return {
    format: "blog-x-monitor-policy", version: 1, role: "edge",
    resultRoot: roots.resultRoot, stateRoot: roots.stateRoot, provider,
    collection: { project: "blogxlocal", webOrigin: "http://127.0.0.1:3199", tlsEvidencePath: join(roots.evidenceRoot, "tls.json") },
  };
}

function dataPolicy(roots, provider = { kind: "stdout" }) {
  return {
    format: "blog-x-monitor-policy", version: 1, role: "data",
    resultRoot: roots.resultRoot, stateRoot: roots.stateRoot, provider,
    collection: { project: "blogxverify_a1b2c3d4", webOrigin: "http://127.0.0.1:3199", jobResultsRoot: roots.jobResultsRoot, backupResultsRoot: roots.backupResultsRoot },
  };
}

test("scheduled CLI collects an edge policy before canonical evaluation", async () => {
  const roots = await authorities();
  const collectionCalls = [];
  const evaluationCalls = [];
  const notificationCalls = [];
  const lines = [];
  const facts = { secret: "postgres://must-not-escape" };
  const result = await runMonitorCli(["--policy=/etc/blog-x/monitor-edge.json"], {
    readPolicy: async (path) => { assert.equal(path, "/etc/blog-x/monitor-edge.json"); return edgePolicy(roots); },
    collect: async (options) => { collectionCalls.push(options); return facts; },
    evaluate: (received, options) => { evaluationCalls.push({ received, options }); return status("edge"); },
    notify: async (options) => { notificationCalls.push(options); return { sent: true }; },
    now: fixedNow,
    write: (line) => lines.push(line),
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(collectionCalls, [{ project: "blogxlocal", webOrigin: "http://127.0.0.1:3199", tlsEvidencePath: join(roots.evidenceRoot, "tls.json") }]);
  assert.deepEqual(evaluationCalls, [{ received: facts, options: { role: "edge", now: fixedNow() } }]);
  assert.deepEqual(notificationCalls[0].provider, { kind: "stdout" });
  assert.equal(notificationCalls[0].stateRoot, roots.stateRoot);
  assert.deepEqual(JSON.parse(lines[0]).failingCheckIds, []);
  assert.doesNotMatch(lines.join(""), /postgres|http/i);
});

test("role-aware monitor policy routes only data evidence authorities", async () => {
  const roots = await authorities();
  const calls = [];
  const result = await runMonitor({
    policy: dataPolicy(roots),
    collect: async (options) => { calls.push(options); return {}; },
    evaluate: (_facts, { role }) => status(role),
    notify: async () => ({ sent: true }),
    now: fixedNow,
    write: () => {},
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(calls, [{ project: "blogxverify_a1b2c3d4", webOrigin: "http://127.0.0.1:3199", jobResultsRoot: roots.jobResultsRoot, backupResultsRoot: roots.backupResultsRoot }]);
  assert.equal("composeFile" in calls[0], false);
  assert.equal("tlsEvidencePath" in calls[0], false);
});

test("role-aware monitor policy rejects unsafe and noncanonical authority before collection", async () => {
  const roots = await authorities();
  const invalidPolicies = [
    { ...edgePolicy(roots), ignored: true },
    { ...edgePolicy(roots), collection: { project: "blogxlocal", webOrigin: "http://127.0.0.1:3199" } },
    { ...edgePolicy(roots), collection: { ...edgePolicy(roots).collection, composeFile: "/tmp/compose.yaml" } },
    { ...edgePolicy(roots), collection: { ...edgePolicy(roots).collection, jobResultsRoot: roots.jobResultsRoot } },
    { ...edgePolicy(roots), collection: { ...edgePolicy(roots).collection, webOrigin: "http://localhost:3199" } },
    { ...edgePolicy(roots), collection: { ...edgePolicy(roots).collection, webOrigin: "http://user:password@127.0.0.1:3199" } },
    { ...edgePolicy(roots), collection: { ...edgePolicy(roots).collection, project: "production" } },
    { ...edgePolicy(roots), provider: { kind: "webhook", urlEnv: "BLOG_X_OTHER_URL" } },
    { ...edgePolicy(roots), provider: { kind: "file", spoolRoot: "relative" } },
  ];
  for (const policy of invalidPolicies) {
    let collected = false;
    await assert.rejects(() => runMonitor({ policy, collect: async () => { collected = true; return {}; } }), /policy|authority|invalid/i);
    assert.equal(collected, false);
  }
  await chmod(roots.evidenceRoot, 0o755);
  await assert.rejects(() => runMonitor({ policy: edgePolicy(roots), collect: async () => assert.fail("must not collect") }), /unsafe/i);
  await chmod(roots.evidenceRoot, 0o700);
  const linkedEvidence = join(roots.root, "linked-evidence");
  await symlink(roots.evidenceRoot, linkedEvidence);
  const linkedPolicy = { ...edgePolicy(roots), collection: { ...edgePolicy(roots).collection, tlsEvidencePath: join(linkedEvidence, "tls.json") } };
  await assert.rejects(() => runMonitor({ policy: linkedPolicy }), /unsafe/i);
  await chmod(roots.spoolRoot, 0o755);
  await assert.rejects(() => runMonitor({ policy: edgePolicy(roots, { kind: "file", spoolRoot: roots.spoolRoot }) }), /unsafe/i);
});

test("collection and evaluator failures notify and persist one secret-free aggregate outcome", async () => {
  for (const failure of ["collect", "evaluate"]) {
    const roots = await authorities();
    const received = [];
    const lines = [];
    const result = await runMonitor({
      policy: edgePolicy(roots, { kind: "webhook", urlEnv: "BLOG_X_NOTIFY_WEBHOOK_URL", authorizationEnv: "BLOG_X_NOTIFY_WEBHOOK_AUTHORIZATION" }),
      collect: async () => { if (failure === "collect") throw new Error("postgres://user:secret@example.test/hidden"); return { raw: "must-not-escape" }; },
      evaluate: () => { throw new Error("postgres://user:secret@example.test/hidden"); },
      notify: async (options) => { received.push(options); return { sent: true }; },
      now: fixedNow,
      write: (line) => lines.push(line),
    });
    assert.equal(result.exitCode, 1);
    assert.deepEqual(received[0].provider, { kind: "webhook", urlEnv: "BLOG_X_NOTIFY_WEBHOOK_URL", authorizationEnv: "BLOG_X_NOTIFY_WEBHOOK_AUTHORIZATION" });
    assert.deepEqual(received[0].status.checks, [{ id: "collection", status: "FAIL" }]);
    const terminal = JSON.parse(lines[0]);
    assert.deepEqual(terminal.failingCheckIds, ["collection"]);
    assert.doesNotMatch(JSON.stringify({ terminal, notified: received[0].status }), /secret|postgres|example\.test|must-not-escape/i);
    assert.doesNotMatch(await readFile(join(roots.resultRoot, `outcome-${terminal.runId}.json`), "utf8"), /secret|postgres|example\.test/i);
  }
});

test("notification failure remains terminal without running a provider", async () => {
  const roots = await authorities();
  const lines = [];
  const result = await runMonitor({
    policy: edgePolicy(roots),
    collect: async () => ({}),
    evaluate: (_facts, { role }) => status(role),
    notify: async () => { throw new Error("webhook token=must-not-escape"); },
    now: fixedNow,
    write: (line) => lines.push(line),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(JSON.parse(lines[0]).notificationOutcome, "failed");
  assert.doesNotMatch(lines.join(""), /token|webhook/i);
});
