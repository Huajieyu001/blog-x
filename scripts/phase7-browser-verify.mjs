import { spawn } from "node:child_process";
import { copyFile, cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const maximumCapturedBytes = 8 * 1024 * 1024;
const playwrightTimeoutMs = 300_000;

async function createIsolatedWebRoot() {
  const source = resolve(root, "apps/web");
  const isolated = await mkdtemp(resolve(root, "apps/.phase7-web-"));
  for (const file of ["next.config.ts", "package.json", "tsconfig.json", "next-env.d.ts", "proxy.ts"]) {
    await copyFile(resolve(source, file), resolve(isolated, file));
  }
  await cp(resolve(source, "app"), resolve(isolated, "app"), { recursive: true });
  await cp(resolve(source, "lib"), resolve(isolated, "lib"), { recursive: true });
  await symlink(resolve(source, "node_modules"), resolve(isolated, "node_modules"), "dir");
  return isolated;
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
  process.stdout.write(`[phase7-browser] ${label}\n`);
  const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  children.push(child);
  return child;
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((accept) => {
    const onClose = () => {
      clearTimeout(timeout);
      accept(true);
    };
    const timeout = setTimeout(() => {
      child.off("close", onClose);
      accept(false);
    }, timeoutMs);
    child.once("close", onClose);
  });
}

async function stopExactChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForClose(child, 3_000)) return;
  child.kill("SIGKILL");
  if (!await waitForClose(child, 3_000)) throw new Error(`managed child ${child.pid ?? "unknown"} did not terminate`);
}

async function stopExactChildren() {
  const active = children.splice(0).reverse();
  for (const child of active) await stopExactChild(child);
}

async function waitForHttp(url, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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

function assertPlaywrightResult(output) {
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
  process.stdout.write(`[phase7-browser] RESULT ${passed}/${discovered[1]} tests passed; 0 skipped/TODO\n`);
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

async function runPlaywright(args, env) {
  return new Promise((accept, reject) => {
    const child = spawn("corepack", args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let output = "";
    let terminationTimer;
    let timedOut = false;
    const terminateBounded = () => {
      if (timedOut) return;
      timedOut = true;
      child.kill("SIGTERM");
      terminationTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, 3_000);
    };
    const capture = (chunk, destination) => {
      destination.write(chunk);
      output += chunk;
      if (Buffer.byteLength(output) > maximumCapturedBytes) terminateBounded();
    };
    child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
    child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
    const timeout = setTimeout(terminateBounded, playwrightTimeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(terminationTimer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(terminationTimer);
      if (timedOut) return reject(new Error("Phase 7 Playwright exceeded its bounded time or output"));
      if (code !== 0 || signal !== null) return reject(new Error(`corepack exited with ${code ?? signal}`));
      try {
        assertPlaywrightResult(output);
        accept();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseOptions(argv) {
  const options = { forceFailure: false, grep: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--force-failure") options.forceFailure = true;
    else if (value === "--grep" && options.grep === undefined) {
      options.grep = argv[index + 1];
      if (!options.grep) throw new Error("--grep requires a value");
      index += 1;
    } else throw new Error(`unsupported Phase 7 runner argument: ${value}`);
  }
  return options;
}

function playwrightArgs(grep) {
  const args = ["pnpm", "exec", "playwright", "test", "apps/web/e2e/public-discovery.spec.ts", "--workers=1"];
  if (grep) args.push("--grep", grep);
  return args;
}

async function expectHttpClosed(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) });
  } catch {
    return;
  }
  throw new Error(`managed local origin remained reachable after cleanup: ${url}`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  await assertAcceptanceSpecEnabled();
  const [fixturePort, webPort] = await Promise.all([freePort(), freePort()]);
  const isolatedWebRoot = await createIsolatedWebRoot();
  const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const fixtureEnv = { ...process.env, DISCOVERY_FIXTURE_PORT: String(fixturePort) };
  const webEnv = {
    ...process.env,
    INTERNAL_API_ORIGIN: fixtureOrigin,
    PUBLIC_ORIGIN: webOrigin,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  try {
    start("start strict discovery fixture", process.execPath,
      ["--import", "tsx", "apps/web/e2e/public-discovery-fixture.ts"], fixtureEnv);
    await waitForHttp(`${fixtureOrigin}/health`);
    start("start generated-port Next Web", process.execPath,
      ["apps/web/node_modules/next/dist/bin/next", "dev", isolatedWebRoot, "-p", String(webPort)], webEnv);
    await waitForHttp(webOrigin);
    if (options.forceFailure) throw new Error("forced failure after local children became healthy");
    await runPlaywright(playwrightArgs(options.grep), {
      ...process.env,
      E2E_WEB_ORIGIN: webOrigin,
      E2E_DISCOVERY_FIXTURE_ORIGIN: fixtureOrigin,
    });
    process.stdout.write("[phase7-browser] PASS\n");
  } finally {
    await stopExactChildren();
    await Promise.all([expectHttpClosed(`${fixtureOrigin}/health`), expectHttpClosed(webOrigin)]);
    if (!isolatedWebRoot.startsWith(resolve(root, "apps/.phase7-web-"))) {
      throw new Error("refusing to clean an unexpected Phase 7 Web root");
    }
    await rm(isolatedWebRoot, { recursive: true, force: true });
    process.stdout.write("[phase7-browser] CLEANUP PASS\n");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
