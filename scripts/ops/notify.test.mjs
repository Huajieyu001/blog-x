import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { notifyStatus } from "./notify.mjs";
import { evaluateCanonicalStatus } from "../ops-status.mjs";

const root = () => mkdtemp(join(tmpdir(), "blog-x-notify-"));
const status = (state = "FAIL", checks = [{ id: "backup", status: "FAIL" }]) => ({
  format: "blog-x-ops-status", version: 1, scope: "local", observedAt: "2032-01-01T00:00:00.000Z", status: state, checks,
});

test("notifier emits a redacted stdout envelope once, suppresses cooldown, and sends recovery", async () => {
  const stateRoot = await root();
  const output = [];
  const first = await notifyStatus({ status: status(), provider: { kind: "stdout" }, stateRoot, write: (line) => output.push(line), now: () => new Date("2032-01-01T00:00:00.000Z") });
  assert.equal(first.sent, true);
  const envelope = JSON.parse(output[0]);
  assert.deepEqual(Object.keys(envelope).sort(), ["failingChecks", "fingerprint", "observedAt", "scope", "status"]);
  assert.doesNotMatch(JSON.stringify(envelope), /secret|https?:\/\/|path/i);
  const repeated = await notifyStatus({ status: status(), provider: { kind: "stdout" }, stateRoot, write: () => assert.fail("cooldown must not send"), now: () => new Date("2032-01-01T00:01:00.000Z") });
  assert.equal(repeated.sent, false);
  const recovery = await notifyStatus({ status: status("PASS", [{ id: "backup", status: "PASS" }]), provider: { kind: "stdout" }, stateRoot, write: (line) => output.push(line), now: () => new Date("2032-01-01T00:02:00.000Z") });
  assert.equal(recovery.sent, true);
  assert.equal(JSON.parse(output[1]).status, "PASS");
});

test("file and webhook adapters retain only envelope data and reject unsafe authorities", async () => {
  const stateRoot = await root();
  const spoolRoot = await root();
  const sent = await notifyStatus({ status: status(), provider: { kind: "file", spoolRoot }, stateRoot, now: () => new Date("2032-01-01T00:00:00.000Z") });
  assert.equal(sent.sent, true);
  assert.doesNotMatch(await readFile(sent.path, "utf8"), /secret|postgres|https?:\/\//i);
  const calls = [];
  const webhook = await notifyStatus({ status: status("FAIL", [{ id: "ignored", status: "PASS" }]), provider: { kind: "webhook", urlEnv: "BLOG_X_NOTIFY_WEBHOOK_URL", authorizationEnv: "BLOG_X_NOTIFY_WEBHOOK_AUTHORIZATION" }, stateRoot: await root(), environment: { BLOG_X_NOTIFY_WEBHOOK_URL: "http://127.0.0.1:9999/fixture", BLOG_X_NOTIFY_WEBHOOK_AUTHORIZATION: "Bearer test-secret" }, allowInsecureTestWebhook: true, fetch: async (url, init) => { calls.push({ url, init }); return { ok: true }; } });
  assert.equal(webhook.sent, true);
  assert.equal(calls.length, 1);
  assert.doesNotMatch(JSON.stringify(calls[0].init.body), /test-secret|127\.0\.0\.1/i);
  await chmod(spoolRoot, 0o755);
  const unsafeStateRoot = await root();
  await assert.rejects(() => notifyStatus({ status: status(), provider: { kind: "file", spoolRoot }, stateRoot: unsafeStateRoot }), /unsafe/i);
});

test("generated aggregate failure sends once and its repaired projection sends recovery", async () => {
  const stateRoot = await root();
  const output = [];
  const facts = {
    composeConfig: { services: {} }, services: [], webHealth: { ok: false, status: 503 },
    cpu: { load1: 1, cores: 1 }, memory: { availableBytes: 1, totalBytes: 2 },
    filesystem: { availableBytes: 1, totalBytes: 2, availableInodes: 1, totalInodes: 2 },
    containers: { known: false }, volumes: { known: false }, tls: { status: "FAIL" },
    evidence: { backup: { status: "stale" }, retention: { status: "missing" }, "publish-due": { status: "failed" } },
  };
  const failed = evaluateCanonicalStatus(facts, { role: "local", now: new Date("2032-01-01T00:00:00.000Z") });
  assert.equal(failed.status, "FAIL");
  assert.deepEqual(failed.checks.filter((item) => item.status === "FAIL" && ["backup", "retention", "publish-due", "tls", "disk-inodes"].includes(item.id)).map((item) => item.id).sort(), ["backup", "disk-inodes", "publish-due", "retention", "tls"]);
  assert.equal((await notifyStatus({ status: failed, provider: { kind: "stdout" }, stateRoot, write: (line) => output.push(line), now: () => new Date("2032-01-01T00:00:00.000Z") })).sent, true);
  assert.equal((await notifyStatus({ status: failed, provider: { kind: "stdout" }, stateRoot, write: () => assert.fail("must suppress"), now: () => new Date("2032-01-01T00:01:00.000Z") })).suppressed, true);
  const recovered = { ...failed, observedAt: "2032-01-01T00:02:00.000Z", status: "PASS", checks: failed.checks.map((item) => ({ ...item, status: "PASS" })) };
  assert.equal((await notifyStatus({ status: recovered, provider: { kind: "stdout" }, stateRoot, write: (line) => output.push(line), now: () => new Date("2032-01-01T00:02:00.000Z") })).sent, true);
  assert.equal(JSON.parse(output.at(-1)).status, "PASS");
});
