import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, X509Certificate } from "node:crypto";
import { chmod, copyFile, link, lstat, mkdtemp, mkdir, open, readFile, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectLocalStatus, evaluateStatus } from "../ops-status.mjs";
import { parseTlsEvidenceArgs, produceTlsEvidence } from "./tls-evidence.mjs";

const fixture = fileURLToPath(new URL("./fixtures/tls-public-certificate.pem", import.meta.url));
const script = fileURLToPath(new URL("./tls-evidence.mjs", import.meta.url));
const observedAt = new Date("2026-09-20T00:00:00.000Z");
const fixtureText = await readFile(fixture, "utf8");
const sensitiveMarker = "TLS_EVIDENCE_SYNTHETIC_SECRET_MARKER";

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-tls-evidence-"));
  await chmod(root, 0o700);
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

function errorsWithoutAuthority(run) {
  return assert.rejects(run, (error) => {
    assert.match(error.message, /^tls evidence (arguments|certificate|output|publish) rejected$/);
    assert.doesNotMatch(error.message, /BEGIN|Certificate|fixture|secret|path|\/|\\/i);
    return true;
  });
}

function defaultFs(overrides = {}) {
  return { chmod, copyFile, link, lstat, mkdir, open, readFile, realpath, rename, unlink, writeFile, ...overrides };
}

function localStatusDependencies(now) {
  const composeConfig = { services: { postgres: { init: true, restart: "unless-stopped", pull_policy: "never", healthcheck: {}, logging: { driver: "local", options: { "max-size": "10m", "max-file": "3" } } }, api: { init: true, restart: "unless-stopped", pull_policy: "never", healthcheck: {}, logging: { driver: "local", options: { "max-size": "10m", "max-file": "3" } }, build: { network: "none" }, ports: [] }, web: { init: true, restart: "unless-stopped", pull_policy: "never", healthcheck: {}, logging: { driver: "local", options: { "max-size": "10m", "max-file": "3" } }, build: { network: "none" }, ports: [{ host_ip: "127.0.0.1" }] } } };
  return {
    now: () => now,
    fetch: async () => ({ ok: true, status: 200 }),
    host: { loadavg: () => [0], cpus: () => [{}, {}], freemem: () => 4, totalmem: () => 8 },
    statfs: async () => ({ bavail: 2, blocks: 4, bsize: 4096, ffree: 2, files: 4 }),
    run: async (name, args) => {
      const words = args.join(" ");
      if (name === "docker-compose" && words.includes("config")) return { stdout: JSON.stringify(composeConfig) };
      if (name === "docker-compose" && words.includes("ps")) return { stdout: JSON.stringify([{ Service: "postgres", Health: "healthy", ID: "postgres" }, { Service: "api", Health: "healthy", ID: "api" }, { Service: "web", Health: "healthy", ID: "web" }]) };
      if (name === "docker" && args[0] === "inspect") return { stdout: "postgres|/postgres|0\napi|/api|0\nweb|/web|0\n" };
      if (name === "docker" && args[0] === "stats") return { stdout: '{"CPUPerc":"0.1%","MemUsage":"1MiB / 8MiB"}\n' };
      if (name === "docker" && args[0] === "system") return { stdout: '{"Type":"Local Volumes","TotalCount":"2","Size":"1MiB"}\n' };
      throw new Error("unexpected local collector command");
    },
  };
}

test("synthetic fixture is exactly one public certificate with a fixed test-only validity window", () => {
  assert.match(fixtureText, /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\n$/);
  assert.equal((fixtureText.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length, 1);
  assert.doesNotMatch(fixtureText, /PRIVATE KEY|huajieyu|47\.99|124\.222|https?:\/\//i);
  const certificate = new X509Certificate(fixtureText);
  assert.equal(certificate.validFrom, "Sep 19 19:31:18 2026 GMT");
  assert.equal(certificate.validTo, "Sep 16 19:31:18 2036 GMT");
  assert.ok(Date.parse(certificate.validFrom) < observedAt.getTime());
  assert.ok(Date.parse(certificate.validTo) > observedAt.getTime());
});

test("argument grammar accepts exactly two non-empty absolute local authorities", () => {
  assert.deepEqual(parseTlsEvidenceArgs(["--certificate=/tmp/cert.pem", "--output=/tmp/evidence.json"]), { certificatePath: "/tmp/cert.pem", outputPath: "/tmp/evidence.json" });
  for (const argv of [[], ["--certificate=/tmp/a"], ["--output=/tmp/b"], ["--certificate=", "--output=/tmp/b"], ["--certificate=cert.pem", "--output=/tmp/b"], ["--certificate=https://invalid", "--output=/tmp/b"], ["--certificate=/tmp/a", "--output=/tmp/b", "extra"], ["--certificate=/tmp/a", "--certificate=/tmp/b", "--output=/tmp/c"], ["--certificate=/tmp/a", "--output=/tmp/b", "--output=/tmp/c"]]) {
    assert.throws(() => parseTlsEvidenceArgs(argv), /^tls evidence arguments rejected$/);
  }
});

test("authorized certificate publishes exact strict evidence accepted by the existing TLS consumer", async () => withRoot(async (root) => {
  const certificatePath = join(root, "certificate.pem");
  const outputPath = join(root, "tls.json");
  await copyFile(fixture, certificatePath);
  await chmod(certificatePath, 0o600);
  const evidence = await produceTlsEvidence({ certificatePath, outputPath }, { now: () => observedAt });
  assert.deepEqual(evidence, { format: "blog-x-tls-evidence", version: 1, observedAt: observedAt.toISOString(), validUntil: "2036-09-16T19:31:18.000Z", status: "pass" });
  const bytes = await readFile(outputPath, "utf8");
  assert.equal(bytes, `${JSON.stringify(evidence)}\n`);
  assert.equal((await lstat(outputPath)).mode & 0o777, 0o600);
  const facts = await collectLocalStatus({ project: "blogxverify_a1b2c3d4", webOrigin: "http://127.0.0.1:3199", tlsEvidencePath: outputPath }, localStatusDependencies(observedAt));
  assert.equal(facts.tls.status, "PASS");
  assert.equal(evaluateStatus(facts).checks.find((item) => item.id === "tls")?.status, "PASS");
}));

test("certificate validity and PEM parsing failures preserve a previous safe evidence target", async () => withRoot(async (root) => {
  const certificatePath = join(root, "certificate.pem");
  const outputPath = join(root, "tls.json");
  const previous = '{"previous":"bytes"}\n';
  await copyFile(fixture, certificatePath); await chmod(certificatePath, 0o600);
  await writeFile(outputPath, previous, { mode: 0o600 }); await chmod(outputPath, 0o600);
  for (const [contents, now] of [["not a certificate", observedAt], [`${fixtureText}${fixtureText}`, observedAt], [fixtureText, new Date("2026-09-19T19:31:17.999Z")], [fixtureText, new Date("2036-09-16T19:31:18.000Z")]]) {
    await writeFile(certificatePath, contents, { mode: 0o600 }); await chmod(certificatePath, 0o600);
    await errorsWithoutAuthority(() => produceTlsEvidence({ certificatePath, outputPath }, { now: () => now }));
    assert.equal(await readFile(outputPath, "utf8"), previous);
  }
}));

test("untrusted certificate and output filesystem authorities fail closed", async () => withRoot(async (root) => {
  const certificatePath = join(root, "certificate.pem");
  const outputPath = join(root, "tls.json");
  await copyFile(fixture, certificatePath); await chmod(certificatePath, 0o600);
  const cases = [
    async () => { const linked = join(root, "linked.pem"); await symlink(certificatePath, linked); return { certificatePath: linked, outputPath }; },
    async () => { await chmod(certificatePath, 0o622); return { certificatePath, outputPath }; },
    async () => { const linked = join(root, "hardlinked.pem"); await link(certificatePath, linked); return { certificatePath, outputPath }; },
    async () => { const parent = join(root, "open-parent"); await mkdir(parent, { mode: 0o755 }); await chmod(parent, 0o755); return { certificatePath, outputPath: join(parent, "tls.json") }; },
    async () => { const parent = join(root, "parent-link-source"); await mkdir(parent, { mode: 0o700 }); const linked = join(root, "parent-link"); await symlink(parent, linked); return { certificatePath, outputPath: join(linked, "tls.json") }; },
  ];
  for (const prepare of cases) {
    await chmod(certificatePath, 0o600).catch(() => undefined);
    const options = await prepare();
    await errorsWithoutAuthority(() => produceTlsEvidence(options, { now: () => observedAt }));
  }
  await copyFile(fixture, certificatePath); await chmod(certificatePath, 0o600);
  await writeFile(outputPath, "previous\n", { mode: 0o644 }); await chmod(outputPath, 0o644);
  await errorsWithoutAuthority(() => produceTlsEvidence({ certificatePath, outputPath }, { now: () => observedAt }));
  assert.equal(await readFile(outputPath, "utf8"), "previous\n");
  const outputLink = join(root, "tls-linked.json"); await symlink(outputPath, outputLink);
  await errorsWithoutAuthority(() => produceTlsEvidence({ certificatePath, outputPath: outputLink }, { now: () => observedAt }));
}));

test("foreign ownership shape, publication faults, and CLI failures do not disclose authority or corrupt the target", async () => withRoot(async (root) => {
  const certificatePath = join(root, "certificate.pem");
  const outputPath = join(root, "tls.json");
  const previous = `${sensitiveMarker}\n`;
  await copyFile(fixture, certificatePath); await chmod(certificatePath, 0o600);
  await writeFile(outputPath, previous, { mode: 0o600 }); await chmod(outputPath, 0o600);
  const actualLstat = lstat;
  await errorsWithoutAuthority(() => produceTlsEvidence({ certificatePath, outputPath }, { now: () => observedAt, fs: defaultFs({ lstat: async (path) => ({ ...(await actualLstat(path)), uid: process.getuid() + 1 }) }) }));
  assert.equal(await readFile(outputPath, "utf8"), previous);
  await errorsWithoutAuthority(() => produceTlsEvidence({ certificatePath, outputPath }, { now: () => observedAt, fs: defaultFs({ rename: async () => { throw new Error(`rename ${sensitiveMarker}`); } }) }));
  assert.equal(await readFile(outputPath, "utf8"), previous);
  const leftovers = (await (await import("node:fs/promises")).readdir(root)).filter((name) => name.startsWith(".tls-evidence-"));
  assert.deepEqual(leftovers, []);
  const failure = spawnSync(process.execPath, [script, `--certificate=${join(root, `${sensitiveMarker}.pem`)}`, `--output=${join(root, "out.json")}`], { encoding: "utf8" });
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, "BLOG X TLS EVIDENCE FAIL\n");
  assert.equal(failure.stderr, "");
  assert.doesNotMatch(`${failure.stdout}${failure.stderr}`, new RegExp(sensitiveMarker));
}));
