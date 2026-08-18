import { spawn } from "node:child_process";
import { copyFile, cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

async function createIsolatedWebRoot() {
  const source = resolve(root, "apps/web");
  const isolated = await mkdtemp(resolve(root, "apps/.phase7-web-"));
  for (const file of ["next.config.ts", "package.json", "tsconfig.json", "next-env.d.ts"]) {
    await copyFile(resolve(source, file), resolve(isolated, file));
  }
  await cp(resolve(source, "app"), resolve(isolated, "app"), { recursive: true });
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

async function stopExactChildren() {
  const active = children.splice(0).reverse();
  await Promise.all(active.map((child) => new Promise((accept) => {
    if (child.exitCode !== null || child.signalCode !== null) return accept();
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 3_000);
    timeout.unref();
    child.once("close", () => {
      clearTimeout(timeout);
      accept();
    });
    child.kill("SIGTERM");
  })));
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

async function run(command, args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) accept();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function playwrightArgs(argv) {
  const args = ["pnpm", "exec", "playwright", "test", "apps/web/e2e/public-discovery.spec.ts", "--workers=1"];
  const grepIndex = argv.indexOf("--grep");
  if (grepIndex >= 0) {
    const value = argv[grepIndex + 1];
    if (!value) throw new Error("--grep requires a value");
    args.push("--grep", value);
  }
  return args;
}

async function main() {
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
    if (process.argv.includes("--force-failure")) throw new Error("forced failure after local children became healthy");
    await run("corepack", playwrightArgs(process.argv.slice(2)), {
      ...process.env,
      E2E_WEB_ORIGIN: webOrigin,
      E2E_DISCOVERY_FIXTURE_ORIGIN: fixtureOrigin,
    });
    process.stdout.write("[phase7-browser] PASS\n");
  } finally {
    await stopExactChildren();
    if (!isolatedWebRoot.startsWith(resolve(root, "apps/.phase7-web-"))) {
      throw new Error("refusing to clean an unexpected Phase 7 Web root");
    }
    await rm(isolatedWebRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
