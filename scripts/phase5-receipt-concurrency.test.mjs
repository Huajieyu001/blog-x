import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquirePhase5ReceiptWriterLock, releasePhase5ReceiptWriterLock } from "./phase5-receipt.mjs";

const workerPath = join(process.cwd(), "scripts/helpers/phase5-receipt-parent-worker.mjs");
const timeoutMs = 4000;

async function receiptRoot(context) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-phase5-receipt-"));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  return { root, receiptPath: join(root, "receipt.json"), lockPath: join(root, "receipt.json.lock"), recoveryPath: join(root, "receipt.json.lock.recovery") };
}

class Peer {
  constructor(action, receiptPath, observedEvent = "") {
    this.child = fork(workerPath, [action, receiptPath, observedEvent], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe", "ipc"] });
    this.queue = [];
    this.waiters = [];
    this.child.on("message", (message) => {
      const index = this.waiters.findIndex(({ predicate }) => predicate(message));
      if (index >= 0) this.waiters.splice(index, 1)[0].accept(message);
      else this.queue.push(message);
    });
  }
  wait(predicate, label) {
    const index = this.queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((accept, reject) => {
      const waiter = { predicate, accept: (value) => { clearTimeout(timer); accept(value); } };
      this.waiters.push(waiter);
      const timer = setTimeout(() => {
        const at = this.waiters.indexOf(waiter);
        if (at >= 0) this.waiters.splice(at, 1);
        this.child.kill("SIGKILL");
        reject(new Error(`deadlock guard expired waiting for ${label}`));
      }, timeoutMs);
    });
  }
  type(type) { return this.wait((message) => message?.type === type, type); }
  release(token) { this.child.send({ type: "release", token }); }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return { code: this.child.exitCode, signal: this.child.signalCode };
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error("deadlock guard expired waiting for process close")), timeoutMs);
      this.child.once("close", (code, signal) => { clearTimeout(timer); accept({ code, signal }); });
    });
  }
}

async function ready(peer) { await peer.type("ready"); }
async function start(peer) { peer.release("start"); }
async function finish(peer) { peer.release("action"); const done = await peer.type("done"); assert.ok(done.receiptBytes >= 0); assert.deepEqual(await peer.close(), { code: 0, signal: null }); }
async function fail(peer, pattern) { const error = await peer.type("error"); assert.match(error.message, pattern); const closed = await peer.close(); assert.notEqual(closed.code, 0); }

function lockRecord({ pid, birth, nonce = randomBytes(24).toString("hex") }) {
  return { format: "blog-x-phase5-receipt-writer-lock", version: 1, ownerPid: pid, ownerBirthIdentity: birth, ownerNonce: nonce, acquiredAt: "2026-08-14T12:00:00.000Z" };
}

async function writeLock(path, record) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
}

test("two barrier-released parents permit exactly one writer while the winner holds authority", async (context) => {
  const target = await receiptRoot(context);
  const peers = [new Peer("write", target.receiptPath), new Peer("write", target.receiptPath)];
  await Promise.all(peers.map(ready));
  peers.forEach(start);
  const winner = await Promise.race(peers.map(async (peer) => { await peer.type("acquired"); return peer; }));
  const loser = peers.find((peer) => peer !== winner);
  await fail(loser, /live owner|recovery.*live owner/i);
  await finish(winner);
  assert.ok((await readFile(target.receiptPath)).length > 0);
});

test("a live parent cannot be displaced or mutate lock/receipt bytes", async (context) => {
  const target = await receiptRoot(context);
  const owner = new Peer("hold", target.receiptPath);
  await ready(owner); start(owner); await owner.type("acquired");
  const before = await readFile(target.lockPath);
  const contender = new Peer("write", target.receiptPath);
  await ready(contender); start(contender); await fail(contender, /live owner|recovery.*live owner/i);
  assert.deepEqual(await readFile(target.lockPath), before);
  await finish(owner);
  await assert.rejects(readFile(target.receiptPath), /ENOENT/);
});

test("a SIGKILLed owner closes before one successor recovers and writes", async (context) => {
  const target = await receiptRoot(context);
  const owner = new Peer("hold", target.receiptPath);
  await ready(owner); start(owner); await owner.type("acquired");
  owner.child.kill("SIGKILL");
  const closed = await owner.close();
  assert.equal(closed.signal, "SIGKILL");
  const successor = new Peer("write", target.receiptPath);
  await ready(successor); start(successor); await successor.type("acquired"); await finish(successor);
  assert.ok((await readFile(target.receiptPath)).length > 0);
});

test("dead and PID-reused records recover, but matching live PID and birth refuses", async (context) => {
  const target = await receiptRoot(context);
  await writeLock(target.lockPath, lockRecord({ pid: 999999, birth: "dead-owner-birth" }));
  const deadInspector = async (pid) => pid === process.pid
    ? { alive: true, birthIdentity: "current-process-birth" }
    : { alive: false, birthIdentity: null };
  let authority = await acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector: deadInspector });
  await releasePhase5ReceiptWriterLock(authority);

  await writeLock(target.lockPath, lockRecord({ pid: process.pid, birth: "old-process-birth" }));
  const reusedInspector = async () => ({ alive: true, birthIdentity: "current-process-birth" });
  authority = await acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector: reusedInspector });
  await releasePhase5ReceiptWriterLock(authority);

  await writeLock(target.lockPath, lockRecord({ pid: process.pid, birth: "current-process-birth" }));
  await assert.rejects(acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector: reusedInspector }), /live owner/i);
});

test("one authenticated recovery guard blocks a second recovery parent", async (context) => {
  const target = await receiptRoot(context);
  await writeLock(target.lockPath, lockRecord({ pid: 999999, birth: "dead-owner-birth" }));
  const first = new Peer("write", target.receiptPath, "recovery-guard-acquired");
  await ready(first); start(first);
  const event = await first.type("event");
  assert.equal(event.name, "recovery-guard-acquired");
  const writerBefore = await readFile(target.lockPath);
  const guardBefore = await readFile(target.recoveryPath);
  const second = new Peer("write", target.receiptPath);
  await ready(second); start(second); await fail(second, /recovery.*live owner/i);
  assert.deepEqual(await readFile(target.lockPath), writerBefore);
  assert.deepEqual(await readFile(target.recoveryPath), guardBefore);
  first.release(event.token);
  await first.type("acquired");
  await finish(first);
});

for (const mode of ["inode replacement", "same-inode nonce mutation"]) {
  test(`release preserves ${mode} when ownership changes at the explicit barrier`, async (context) => {
    const target = await receiptRoot(context);
    const owner = new Peer("hold", target.receiptPath, "lock-release-before-ownership-check");
    await ready(owner); start(owner); await owner.type("acquired");
    owner.release("action");
    const event = await owner.type("event");
    assert.equal(event.name, "lock-release-before-ownership-check");
    let replacement;
    if (mode === "inode replacement") {
      await rename(target.lockPath, `${target.lockPath}.held`);
      replacement = Buffer.from(JSON.stringify(lockRecord({ pid: process.pid, birth: "replacement-birth" })));
      await writeFile(target.lockPath, replacement, { mode: 0o600 });
    } else {
      const current = JSON.parse(await readFile(target.lockPath, "utf8"));
      current.ownerNonce = "f".repeat(48);
      replacement = Buffer.from(JSON.stringify(current));
      await writeFile(target.lockPath, replacement);
    }
    owner.release(event.token);
    await fail(owner, /ownership changed/i);
    assert.deepEqual(await readFile(target.lockPath), replacement);
  });
}

test("partial-create cleanup preserves a replacement installed before readback", async (context) => {
  const target = await receiptRoot(context);
  const owner = new Peer("hold", target.receiptPath, "lock-created-before-readback");
  await ready(owner); start(owner);
  const event = await owner.type("event");
  assert.equal(event.name, "lock-created-before-readback");
  await rename(target.lockPath, `${target.lockPath}.held`);
  const replacement = Buffer.from(JSON.stringify(lockRecord({ pid: process.pid, birth: "replacement-birth" })));
  await writeFile(target.lockPath, replacement, { mode: 0o600 });
  owner.release(event.token);
  await fail(owner, /readback differs|ownership changed/i);
  assert.deepEqual(await readFile(target.lockPath), replacement);
});

test("observer is wait-only, closed-event, generated-target-only, and fail-closed", async (context) => {
  const target = await receiptRoot(context);
  const verdict = async () => "owner-is-dead";
  const currentInspector = async () => ({ alive: true, birthIdentity: "current-process-birth" });
  let generatedAuthority;
  let generatedError;
  try { generatedAuthority = await acquirePhase5ReceiptWriterLock({ receiptPath: target.receiptPath, processInspector: currentInspector, testLifecycleObserver: verdict }); } catch (error) { generatedError = error; }
  if (generatedAuthority) await releasePhase5ReceiptWriterLock(generatedAuthority);
  assert.match(generatedError?.message ?? "observer was not rejected", /observer|undefined|verdict/i);
  await assert.rejects(lstat(target.lockPath), /ENOENT/);

  const unknown = new Peer("hold", target.receiptPath, "lock-created-before-readback");
  await ready(unknown); start(unknown); await unknown.type("event");
  unknown.release("unknown-token");
  await unknown.type("protocol-error");
  await fail(unknown, /unknown|duplicated/i);

  const canonical = join(process.cwd(), "ops/phase5-full-gate-receipt.json");
  let canonicalAuthority;
  let canonicalError;
  try { canonicalAuthority = await acquirePhase5ReceiptWriterLock({ receiptPath: canonical, processInspector: currentInspector, testLifecycleObserver: async () => undefined }); } catch (error) { canonicalError = error; }
  if (canonicalAuthority) await releasePhase5ReceiptWriterLock(canonicalAuthority);
  assert.match(canonicalError?.message ?? "canonical observer was not rejected", /observer|generated/i);
});
