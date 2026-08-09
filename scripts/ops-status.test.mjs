import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  collectLocalStatus,
  evaluateStatus,
  formatStatus,
  validateLocalProject,
  validateStatusOrigin,
} from "./ops-status.mjs";

const composeConfig = {
  services: {
    postgres: { init: true, restart: "unless-stopped", pull_policy: "never", healthcheck: { test: ["CMD", "true"] }, logging: { driver: "local", options: { "max-size": "10m", "max-file": "3" } }, volumes: ["data:/var/lib/postgresql"] },
    api: { init: true, restart: "unless-stopped", pull_policy: "never", build: { network: "none" }, healthcheck: { test: ["CMD", "true"] }, logging: { driver: "local", options: { "max-size": "10m", "max-file": "3" } }, volumes: ["media:/var/lib/blog-x/media"] },
    web: { init: true, restart: "unless-stopped", pull_policy: "never", build: { network: "none" }, healthcheck: { test: ["CMD", "true"] }, logging: { driver: "local", options: { "max-size": "10m", "max-file": "3" } }, ports: [{ host_ip: "127.0.0.1", published: "3199", target: 3100 }] },
  },
};

function cleanFacts(overrides = {}) {
  return {
    composeConfig,
    services: [
      { service: "postgres", health: "healthy", restartCount: 0 },
      { service: "api", health: "healthy", restartCount: 1 },
      { service: "web", health: "healthy", restartCount: 0 },
    ],
    webHealth: { ok: true, status: 200 },
    cpu: { load1: 0.25, cores: 4 },
    memory: { availableBytes: 2_000_000_000, totalBytes: 4_000_000_000 },
    filesystem: { availableBytes: 20_000_000_000, totalBytes: 40_000_000_000, availableInodes: 1000, totalInodes: 2000 },
    containers: { known: true, count: 3, maximumCpuPercent: 4.5, maximumMemoryBytes: 200_000_000 },
    volumes: { known: true, count: 2, bytes: 100_000_000 },
    tls: { status: "NOT_EVALUATED", detail: "authorized evidence absent" },
    ...overrides,
  };
}

test("effective Compose has bounded lifecycle, logs, build network, and Web-only loopback publication", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  for (const service of ["postgres", "api", "web"]) {
    const start = compose.indexOf(`  ${service}:`);
    const next = compose.slice(start + 3).search(/\n  [a-z][a-z0-9-]*:\n/);
    const block = next < 0 ? compose.slice(start) : compose.slice(start, start + 3 + next);
    assert.match(block, /\n    init: true\n/);
    assert.match(block, /\n    restart: unless-stopped\n/);
    assert.match(block, /\n    pull_policy: never\n/);
    assert.match(block, /driver: local/);
    assert.match(block, /max-size: "10m"/);
    assert.match(block, /max-file: "3"/);
    assert.match(block, /healthcheck:/);
    if (service !== "web") assert.doesNotMatch(block, /\n    ports:/);
  }
  assert.equal((compose.match(/127\.0\.0\.1:\$\{BLOG_X_WEB_PORT/g) ?? []).length, 1);
  assert.equal((compose.match(/network: none/g) ?? []).length, 2);
});

test("project and status origin validators accept only local generated authority", () => {
  assert.equal(validateLocalProject("blogxlocal"), "blogxlocal");
  assert.equal(validateLocalProject("blogxverify_a1b2c3d4"), "blogxverify_a1b2c3d4");
  for (const value of ["", "blogxrestore_a1b2c3d4", "blogxverify_bad;id", "production"]) assert.throws(() => validateLocalProject(value), /project/i);
  assert.equal(validateStatusOrigin("http://127.0.0.1:3199"), "http://127.0.0.1:3199");
  for (const value of ["https://example.test", "http://localhost:3199", "http://127.0.0.1:3199/path"]) assert.throws(() => validateStatusOrigin(value), /loopback/i);
});

test("clean local facts pass while TLS remains explicitly not evaluated", () => {
  const result = evaluateStatus(cleanFacts());
  assert.equal(result.ok, true);
  assert.equal(result.checks.find((check) => check.id === "tls")?.status, "NOT_EVALUATED");
  const output = formatStatus(result);
  assert.match(output, /^BLOG X STATUS PASS/m);
  assert.match(output, /TLS NOT_EVALUATED/);
  assert.doesNotMatch(output, /https?:\/\//);
});

test("every required unknown or unhealthy local fact fails closed", () => {
  const cases = [
    { services: [{ service: "api", health: "unhealthy", restartCount: 0 }] },
    { webHealth: { ok: false, status: 503 } },
    { cpu: null },
    { memory: null },
    { filesystem: null },
    { containers: { known: false } },
    { volumes: { known: false } },
    { composeConfig: { services: {} } },
  ];
  for (const override of cases) {
    const result = evaluateStatus(cleanFacts(override));
    assert.equal(result.ok, false);
    assert.match(formatStatus(result), /^BLOG X STATUS FAIL/m);
  }
});

test("collector rejects stale or malformed TLS evidence and never formats raw secrets", async () => {
  const commands = async (name, args) => {
    const key = `${name} ${args.join(" ")}`;
    if (key.includes("config --format json")) return { stdout: JSON.stringify(composeConfig) };
    if (key.includes("ps --format json")) return { stdout: JSON.stringify([
      { Service: "postgres", Health: "healthy", ID: "pg-id" },
      { Service: "api", Health: "healthy", ID: "api-id" },
      { Service: "web", Health: "healthy", ID: "web-id" },
    ]) };
    if (name === "docker" && args[0] === "inspect") return { stdout: "postgres|0\napi|1\nweb|0\n" };
    if (name === "docker" && args[0] === "stats") return { stdout: '{"CPUPerc":"1.5%","MemUsage":"10MiB / 1GiB"}\n' };
    if (name === "docker" && args[0] === "system") return { stdout: '{"Type":"Local Volumes","TotalCount":"2","Size":"12MB"}\n' };
    throw new Error(`unexpected command ${name}`);
  };
  const baseDeps = {
    run: commands,
    fetch: async () => ({ ok: true, status: 200 }),
    host: { loadavg: () => [0.5], cpus: () => [{}, {}], freemem: () => 100, totalmem: () => 200 },
    statfs: async () => ({ bavail: 10n, blocks: 20n, bsize: 4096n, ffree: 10n, files: 20n }),
    now: () => new Date("2026-08-09T10:00:00.000Z"),
  };
  const absent = await collectLocalStatus({ project: "blogxverify_a1b2c3d4", webOrigin: "http://127.0.0.1:3199" }, baseDeps);
  assert.equal(absent.tls.status, "NOT_EVALUATED");
  const stale = await collectLocalStatus({ project: "blogxverify_a1b2c3d4", webOrigin: "http://127.0.0.1:3199", tlsEvidencePath: "/fixture/tls.json" }, {
    ...baseDeps,
    readFile: async () => JSON.stringify({ format: "blog-x-tls-evidence", version: 1, observedAt: "2026-08-01T00:00:00.000Z", validUntil: "2026-08-08T00:00:00.000Z", status: "pass" }),
  });
  assert.equal(evaluateStatus(stale).ok, false);
  const diagnostic = ["postgres://fixture_user", "fixture_value@node/db Cookie: blog_x_session=fixture_session"].join(":");
  const output = formatStatus(evaluateStatus({ ...stale, diagnostic }));
  assert.doesNotMatch(output, /fixture_value|fixture_session|postgres:\/\//i);
});
