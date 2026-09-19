import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const cooldownMs = 30 * 60 * 1000;
const maximumWebhookResponseBytes = 4096;

function strictStatus(value) {
  const keys = Object.keys(value ?? {}).sort();
  if (keys.join(",") !== "checks,format,observedAt,scope,status,version" || value.format !== "blog-x-ops-status" || value.version !== 1 || !["PASS", "FAIL"].includes(value.status) || !["local", "edge", "data"].includes(value.scope) || !Array.isArray(value.checks)) throw new Error("notification status is invalid");
  if (!value.checks.every((item) => item && typeof item.id === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(item.id) && ["PASS", "FAIL", "NOT_EVALUATED"].includes(item.status) && Object.keys(item).length === 2)) throw new Error("notification status is invalid");
  return value;
}

async function restrictiveRoot(root) {
  if (typeof root !== "string" || !isAbsolute(root)) throw new Error("unsafe notification root");
  const info = await lstat(root).catch(() => null);
  if (!info || !info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error("unsafe notification root");
  return root;
}

function envelopeFor(status) {
  strictStatus(status);
  const failingChecks = status.checks.filter((item) => item.status === "FAIL").map((item) => item.id).sort();
  const fingerprint = createHash("sha256").update(JSON.stringify({ scope: status.scope, status: status.status, failingChecks })).digest("hex");
  return { scope: status.scope, status: status.status, failingChecks, observedAt: status.observedAt, fingerprint };
}

async function acquireLock(root, now, maximumAgeMs) {
  const path = join(root, ".notify.lock");
  try {
    const handle = await open(path, "wx", 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }));
    return { path, handle };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let stale = false;
    try {
      const lock = JSON.parse(await readFile(path, "utf8"));
      const age = now.getTime() - Date.parse(lock.startedAt ?? "");
      try { process.kill(lock.pid, 0); } catch (cause) { stale = cause?.code === "ESRCH" && age > maximumAgeMs; }
    } catch { stale = false; }
    if (!stale) throw new Error("notification lock is active");
    await unlink(path);
    return acquireLock(root, now, maximumAgeMs);
  }
}

async function saveAtomic(root, state) {
  const temporary = join(root, `.notify-state-${randomUUID()}.tmp`);
  const target = join(root, "notify-state.json");
  try {
    const handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify(state));
    await handle.sync();
    await handle.close();
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => undefined); }
}

async function loadState(root) {
  try {
    const value = JSON.parse(await readFile(join(root, "notify-state.json"), "utf8"));
    return typeof value?.fingerprint === "string" && typeof value?.sentAt === "string" ? value : null;
  } catch { return null; }
}

async function deliver(provider, envelope, options) {
  const payload = JSON.stringify(envelope);
  if (provider.kind === "stdout") { (options.write ?? process.stdout.write.bind(process.stdout))(`${payload}\n`); return {}; }
  if (provider.kind === "file") {
    const root = await restrictiveRoot(provider.spoolRoot);
    const target = join(root, `notification-${randomUUID()}.json`);
    const temporary = join(root, `.${randomUUID()}.notification.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(`${payload}\n`);
      await handle.sync();
      await handle.close();
      await rename(temporary, target);
    } finally { await unlink(temporary).catch(() => undefined); }
    return { path: target };
  }
  if (provider.kind !== "webhook" || !/^BLOG_X_[A-Z0-9_]{3,80}$/.test(provider.urlEnv ?? "") || (provider.authorizationEnv !== undefined && !/^BLOG_X_[A-Z0-9_]{3,80}$/.test(provider.authorizationEnv))) throw new Error("notification provider is invalid");
  const url = options.environment?.[provider.urlEnv] ?? process.env[provider.urlEnv];
  const authorization = provider.authorizationEnv ? (options.environment?.[provider.authorizationEnv] ?? process.env[provider.authorizationEnv]) : undefined;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("notification provider is invalid"); }
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && !(options.allowInsecureTestWebhook && parsed.protocol === "http:" && parsed.hostname === "127.0.0.1"))) throw new Error("notification provider is invalid");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(parsed, { method: "POST", redirect: "error", signal: controller.signal, headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body: payload });
    const body = await response.arrayBuffer?.();
    if (!response.ok || (body?.byteLength ?? 0) > maximumWebhookResponseBytes) throw new Error("notification delivery failed");
    return {};
  } finally { clearTimeout(timer); }
}

/** Deliver one canonical status transition while serializing state updates by owner-only lock. */
export async function notifyStatus({ status, provider, stateRoot, cooldown = cooldownMs, now = () => new Date(), ...options }) {
  const observed = now();
  const root = await restrictiveRoot(stateRoot);
  const lock = await acquireLock(root, observed, 10 * 60 * 1000);
  try {
    const envelope = envelopeFor(status);
    const previous = await loadState(root);
    if (previous?.fingerprint === envelope.fingerprint && observed.getTime() - Date.parse(previous.sentAt) < cooldown) return { sent: false, suppressed: true };
    const delivery = await deliver(provider, envelope, options);
    await saveAtomic(root, { fingerprint: envelope.fingerprint, sentAt: observed.toISOString() });
    return { sent: true, ...delivery };
  } finally {
    await lock.handle.close().catch(() => undefined);
    await unlink(lock.path).catch(() => undefined);
  }
}
