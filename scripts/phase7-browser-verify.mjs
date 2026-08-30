import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, cp, lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installCooperativeShutdown } from "./local-delivery-child-tree.mjs";
import { PACKAGE_TEST_INVENTORY } from "./test-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const maximumCapturedBytes = 8 * 1024 * 1024;
const playwrightTimeoutMs = 300_000;
const forcedPlaywrightTimeoutMs = 1_500;
const exactProcessGroups = process.platform !== "win32";
let shutdownSignal;
let signalCleanupPromise;

export const PHASE7_BROWSER_RESULT_FORMAT = "blog-x-phase7-browser-result";
const PHASE7_BROWSER_RESULT_PREFIX = "BLOG X PHASE7 BROWSER RESULT ";

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function phase7BrowserSelection() {
  const inventory = PACKAGE_TEST_INVENTORY
    .filter((entry) => entry.scope === "integration" && entry.fixtureOwner === "phase7-browser")
    .map((entry) => entry.path)
    .sort();
  if (inventory.length !== 1 || new Set(inventory).size !== 1 || inventory[0] !== "apps/web/e2e/public-discovery.spec.ts") {
    throw new Error("Phase 7 manifest ownership is not exactly one path");
  }
  return Object.freeze({
    inventory: Object.freeze(inventory),
    manifestSha256: hashText(JSON.stringify(PACKAGE_TEST_INVENTORY)),
  });
}

function exactPassOnlyCounts(counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)
    || Object.keys(counts).sort().join(",") !== "cancelled,failed,passed,skipped,tests,todo") {
    throw new Error("Phase 7 counts are incomplete");
  }
  for (const key of ["tests", "passed", "failed", "cancelled", "skipped", "todo"]) {
    if (!Number.isSafeInteger(counts[key]) || counts[key] < 0) throw new Error("Phase 7 counts are invalid");
  }
  if (!counts.tests || counts.tests !== counts.passed + counts.failed + counts.cancelled + counts.skipped + counts.todo
    || counts.failed || counts.cancelled || counts.skipped || counts.todo || counts.passed !== counts.tests) {
    throw new Error("Phase 7 counts must be nonzero and pass-only");
  }
  return { ...counts };
}

function exactCleanup(cleanup) {
  if (!cleanup || typeof cleanup !== "object" || Array.isArray(cleanup)
    || Object.keys(cleanup).sort().join(",") !== "childrenAbsent,originsAbsent,webRootAbsent"
    || cleanup.childrenAbsent !== true || cleanup.originsAbsent !== true || cleanup.webRootAbsent !== true) {
    throw new Error("Phase 7 cleanup acknowledgement is incomplete");
  }
  return { ...cleanup };
}

export function createPhase7BrowserResult({ inventory, counts, cleanup }) {
  const selection = phase7BrowserSelection();
  if (!Array.isArray(inventory) || inventory.length !== selection.inventory.length
    || inventory.some((path, index) => path !== selection.inventory[index])) {
    throw new Error("Phase 7 result inventory is not exact");
  }
  const body = {
    format: PHASE7_BROWSER_RESULT_FORMAT,
    version: 2,
    manifestSha256: selection.manifestSha256,
    inventory: [...selection.inventory],
    counts: exactPassOnlyCounts(counts),
    cleanup: exactCleanup(cleanup),
    releaseState: "BLOCKED",
  };
  return { ...body, resultSha256: hashText(JSON.stringify(body)) };
}

export function validatePhase7BrowserResult(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)
    || Object.keys(record).sort().join(",") !== "cleanup,counts,format,inventory,manifestSha256,releaseState,resultSha256,version") {
    throw new Error("Phase 7 result schema is invalid");
  }
  const canonical = createPhase7BrowserResult({ inventory: record.inventory, counts: record.counts, cleanup: record.cleanup });
  if (record.format !== canonical.format || record.version !== canonical.version || record.manifestSha256 !== canonical.manifestSha256
    || record.releaseState !== canonical.releaseState || record.resultSha256 !== canonical.resultSha256) {
    throw new Error("Phase 7 result digest or manifest drifted");
  }
  return canonical;
}

async function createIsolatedWebRoot(forceSetupFailure = false) {
  const source = resolve(root, "apps/web");
  const isolated = await mkdtemp(resolve(root, "apps/.phase7-web-"));
  try {
    if (forceSetupFailure) throw new Error("forced isolated Web setup failure");
    for (const file of ["next.config.ts", "package.json", "tsconfig.json", "next-env.d.ts", "proxy.ts"]) {
      await copyFile(resolve(source, file), resolve(isolated, file));
    }
    await cp(resolve(source, "app"), resolve(isolated, "app"), { recursive: true });
    await cp(resolve(source, "lib"), resolve(isolated, "lib"), { recursive: true });
    await symlink(resolve(source, "node_modules"), resolve(isolated, "node_modules"), "dir");
    return isolated;
  } catch (error) {
    try {
      await rm(isolated, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `failed to clean incomplete Phase 7 Web root: ${isolated}`);
    }
    throw error;
  }
}

async function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("unable to allocate local port"));
      server.close(() => accept(address.port));
    });
  });
}

function start(label, command, args, env) {
  shutdownSignal?.throwIfAborted();
  process.stdout.write(`[phase7-browser] ${label}\n`);
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: exactProcessGroups,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  children.push(child);
  return child;
}

function exactTreeIsAlive(child) {
  if (!exactProcessGroups || !child.pid) return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

function signalExactTree(child, signal) {
  if (!exactProcessGroups || !child.pid) return child.kill(signal);
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForTreeClose(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (exactTreeIsAlive(child) && Date.now() < deadline) {
    await new Promise((accept) => setTimeout(accept, 50));
  }
  return !exactTreeIsAlive(child);
}

async function stopExactChild(child) {
  if (!exactTreeIsAlive(child)) return;
  signalExactTree(child, "SIGTERM");
  if (await waitForTreeClose(child, 3_000)) return;
  signalExactTree(child, "SIGKILL");
  if (!await waitForTreeClose(child, 3_000)) throw new Error(`managed child tree ${child.pid ?? "unknown"} did not terminate`);
}

async function stopExactChildren() {
  const active = children.splice(0).reverse();
  for (const child of active) if (exactTreeIsAlive(child)) signalExactTree(child, "SIGTERM");
  await Promise.all(active.map((child) => waitForTreeClose(child, 2_000)));
  const remaining = active.filter(exactTreeIsAlive);
  for (const child of remaining) signalExactTree(child, "SIGKILL");
  const closed = await Promise.all(remaining.map((child) => waitForTreeClose(child, 2_000)));
  if (closed.some((value) => !value)) throw new Error("generated Phase 7 child tree cleanup was not confirmed");
}

async function waitForHttp(url, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    shutdownSignal?.throwIfAborted();
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The bounded local child is still starting.
    }
    await new Promise((accept) => setTimeout(accept, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

export function assertPlaywrightResult(output) {
  const text = stripAnsi(output);
  const discovered = /Running\s+(\d+)\s+tests?\s+using\s+\d+\s+workers?/i.exec(text);
  if (!discovered || Number(discovered[1]) < 1) throw new Error("Phase 7 Playwright discovered zero tests");
  if (/\b\d+\s+(?:failed|flaky|skipped|todo|did not run)\b/i.test(text)) {
    throw new Error("Phase 7 Playwright reported a non-pass, skip, TODO or incomplete acceptance");
  }
  const passMatches = [...text.matchAll(/\b(\d+)\s+passed\b/gi)];
  const passed = Number(passMatches.at(-1)?.[1] ?? 0);
  if (passed !== Number(discovered[1])) {
    throw new Error(`Phase 7 Playwright result mismatch: discovered ${discovered[1]}, passed ${passed}`);
  }
  const counts = { tests: Number(discovered[1]), passed, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
  process.stdout.write(`[phase7-browser] RESULT ${passed}/${discovered[1]} tests passed; 0 skipped/TODO\n`);
  return counts;
}

async function assertAcceptanceSpecEnabled() {
  const source = await readFile(resolve(root, "apps/web/e2e/public-discovery.spec.ts"), "utf8");
  if (!source.includes('test.describe("phase 7 edge and privacy matrix"')) {
    throw new Error("Phase 7 exact edge and privacy matrix is missing");
  }
  if (/\btest(?:\.describe)?\.(?:skip|fixme|only)\s*\(/.test(source)) {
    throw new Error("Phase 7 acceptance cannot contain skip, fixme or only controls");
  }
}

async function runPlaywright(args, env, timeoutMs = playwrightTimeoutMs) {
  return new Promise((accept, reject) => {
    shutdownSignal?.throwIfAborted();
    const child = spawn("corepack", args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: exactProcessGroups,
    });
    children.push(child);
    let output = "";
    let terminationPromise;
    let terminationError;
    let timedOut = false;
    const terminateBounded = () => {
      if (timedOut) return;
      timedOut = true;
      terminationPromise = stopExactChild(child).catch((error) => {
        terminationError = error;
      });
    };
    const capture = (chunk, destination) => {
      destination.write(chunk);
      output += chunk;
      if (Buffer.byteLength(output) > maximumCapturedBytes) terminateBounded();
    };
    child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
    child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
    const timeout = setTimeout(terminateBounded, timeoutMs);
    const abort = () => terminateBounded();
    shutdownSignal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      clearTimeout(timeout);
      shutdownSignal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.once("close", async (code, signal) => {
      clearTimeout(timeout);
      shutdownSignal?.removeEventListener("abort", abort);
      await terminationPromise;
      if (terminationError) return reject(terminationError);
      if (timedOut) return reject(new Error("Phase 7 Playwright exceeded its bounded time or output"));
      if (code !== 0 || signal !== null) return reject(new Error(`corepack exited with ${code ?? signal}`));
      try {
        accept(assertPlaywrightResult(output));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseOptions(argv) {
  const options = { forceFailure: false, forceSetupFailure: false, forceSetupWait: false, forceTimeout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--force-failure") options.forceFailure = true;
    else if (value === "--force-setup-failure") options.forceSetupFailure = true;
    else if (value === "--force-setup-wait") options.forceSetupWait = true;
    else if (value === "--force-timeout") options.forceTimeout = true;
    else throw new Error(`unsupported Phase 7 runner argument: ${value}`);
  }
  return options;
}

function playwrightArgs() {
  return ["pnpm", "exec", "playwright", "test", phase7BrowserSelection().inventory[0], "--workers=1"];
}

async function expectHttpClosed(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) });
  } catch {
    return;
  }
  throw new Error(`managed local origin remained reachable after cleanup: ${url}`);
}

async function expectPathAbsent(path) {
  try { await lstat(path); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
  throw new Error(`generated Phase 7 Web root remained after cleanup: ${path}`);
}

async function waitForShutdownSignal() {
  shutdownSignal?.throwIfAborted();
  await new Promise((accept) => {
    const keepAlive = setInterval(() => undefined, 1_000);
    const aborted = () => {
      clearInterval(keepAlive);
      accept();
    };
    shutdownSignal?.addEventListener("abort", aborted, { once: true });
  });
  shutdownSignal?.throwIfAborted();
}

async function main() {
  shutdownSignal?.throwIfAborted();
  const options = parseOptions(process.argv.slice(2));
  await assertAcceptanceSpecEnabled();
  let isolatedWebRoot;
  let fixtureOrigin;
  let webOrigin;
  let counts;
  let cleanup;
  try {
    isolatedWebRoot = await createIsolatedWebRoot(options.forceSetupFailure);
    process.stdout.write(`[phase7-browser] AUTHORITY WEB_ROOT ${isolatedWebRoot}\n`);
    if (options.forceSetupWait) await waitForShutdownSignal();
    shutdownSignal?.throwIfAborted();
    const [fixturePort, webPort] = await Promise.all([freePort(), freePort()]);
    fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
    webOrigin = `http://127.0.0.1:${webPort}`;
    const fixtureEnv = { ...process.env, DISCOVERY_FIXTURE_PORT: String(fixturePort) };
    const webEnv = {
      ...process.env,
      INTERNAL_API_ORIGIN: fixtureOrigin,
      PUBLIC_ORIGIN: webOrigin,
      NEXT_TELEMETRY_DISABLED: "1",
    };
    start("start strict discovery fixture", process.execPath,
      ["--import", "tsx", "apps/web/e2e/public-discovery-fixture.ts"], fixtureEnv);
    await waitForHttp(`${fixtureOrigin}/health`);
    start("start generated-port Next Web", process.execPath,
      ["apps/web/node_modules/next/dist/bin/next", "dev", isolatedWebRoot, "-p", String(webPort)], webEnv);
    await waitForHttp(webOrigin);
    if (options.forceFailure) throw new Error("forced failure after local children became healthy");
    counts = await runPlaywright(playwrightArgs(), {
      ...process.env,
      E2E_WEB_ORIGIN: webOrigin,
      E2E_DISCOVERY_FIXTURE_ORIGIN: fixtureOrigin,
    }, options.forceTimeout ? forcedPlaywrightTimeoutMs : playwrightTimeoutMs);
  } finally {
    await signalCleanupPromise;
    await stopExactChildren();
    if (fixtureOrigin && webOrigin) await Promise.all([expectHttpClosed(`${fixtureOrigin}/health`), expectHttpClosed(webOrigin)]);
    if (isolatedWebRoot) {
      if (!isolatedWebRoot.startsWith(resolve(root, "apps/.phase7-web-"))) {
        throw new Error("refusing to clean an unexpected Phase 7 Web root");
      }
      await rm(isolatedWebRoot, { recursive: true, force: true });
      await expectPathAbsent(isolatedWebRoot);
      const record = {
        format: "blog-x-phase7-cleanup-ack",
        version: 1,
        webRoot: isolatedWebRoot,
        origins: fixtureOrigin && webOrigin ? [fixtureOrigin, webOrigin] : [],
        childrenAbsent: true,
        rootAbsent: true,
        releaseState: "BLOCKED",
      };
      process.stdout.write(`BLOG X PHASE7 CLEANUP ACK ${JSON.stringify(record)}\n`);
      cleanup = { childrenAbsent: true, originsAbsent: true, webRootAbsent: true };
    }
    process.stdout.write("[phase7-browser] CLEANUP PASS\n");
  }
  const result = createPhase7BrowserResult({ inventory: phase7BrowserSelection().inventory, counts, cleanup });
  process.stdout.write(`${PHASE7_BROWSER_RESULT_PREFIX}${JSON.stringify(result)}\n`);
  process.stdout.write("[phase7-browser] PASS; RELEASE BLOCKED\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  shutdownSignal = controller.signal;
  const shutdown = installCooperativeShutdown(async (signal) => {
    controller.abort(new Error(`Phase 7 browser verification received ${signal}`));
    signalCleanupPromise ??= stopExactChildren();
    await signalCleanupPromise;
  });
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }).finally(async () => {
    await shutdown.wait();
    shutdown.dispose();
  });
}
