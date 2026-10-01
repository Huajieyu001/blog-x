import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  FAST_LOCAL_PREVIEW_READY,
  assertFastPreviewArgv,
  buildFastPreviewEnvironment,
  runFastLocalPreview,
} from "./refresh-local-preview.mjs";

const SHA = (letter) => `sha256:${letter.repeat(64)}`;
const REVISION = "a".repeat(40);
const LOCK = createHash("sha256").update("lockfile fixture\n").digest("hex");
const ambient = Object.freeze({ PATH: "/safe/bin", HOME: "/Users/test", TMPDIR: "/safe/tmp", LANG: "C", LC_ALL: "C" });
const origin = "http://127.0.0.1:3100";

function image(application, id, { lock = LOCK, workingDir = "/refresh-workspace", seed = id, kind = "v1.1-offline-local-delivery" } = {}) {
  return {
    Id: id,
    Config: {
      WorkingDir: workingDir,
      Labels: application ? {
        "org.opencontainers.image.revision": REVISION,
        "io.blog-x.lockfile-sha256": lock,
        "io.blog-x.seed-image-id": seed,
        "io.blog-x.application": application,
        "io.blog-x.public-origin": origin,
        "io.blog-x.refresh-kind": kind,
      } : {},
    },
  };
}

function fixture({ fail = () => false, mutate = () => undefined, context = "colima" } = {}) {
  const calls = [];
  const output = [];
  const seeds = { api: image("api", SHA("b")), web: image("web", SHA("c")) };
  const targets = { api: image("api", SHA("d"), { seed: SHA("b") }), web: image("web", SHA("e"), { seed: SHA("c") }) };
  mutate({ seeds, targets });
  return {
    calls,
    output,
    async runCommand(command, args, options) {
      const call = { command, args, options };
      calls.push(call);
      if (fail(call)) throw new Error(`injected failure: ${command} ${args.join(" ")}`);
      if (command === "git") return { stdout: `${REVISION}\n` };
      if (command === "docker" && args[0] === "context" && args[1] === "show") return { stdout: `${context}\n` };
      if (command === "docker" && args[0] === "context" && args[1] === "inspect") return { stdout: JSON.stringify([{ Name: context, Endpoints: { docker: { Host: "unix:///Users/test/.colima/default/docker.sock" } } }]) };
      if (command === "docker" && args[0] === "image" && args[1] === "inspect") {
        const ref = args[2];
        if (ref === "node:24.15.0-alpine") return { stdout: JSON.stringify([image(null, SHA("f"))]) };
        if (ref === "blog-x-api-local") return { stdout: JSON.stringify([seeds.api]) };
        if (ref === "blog-x-web-local") return { stdout: JSON.stringify([seeds.web]) };
        if (ref === seeds.api.Id) return { stdout: JSON.stringify([seeds.api]) };
        if (ref === seeds.web.Id) return { stdout: JSON.stringify([seeds.web]) };
        if (ref === "blog-x-api-preview:current") return { stdout: JSON.stringify([targets.api]) };
        if (ref === "blog-x-web-preview:current") return { stdout: JSON.stringify([targets.web]) };
      }
      return { stdout: "" };
    },
    async run() {
      return runFastLocalPreview({ ambientEnv: ambient, readLockfile: async () => "lockfile fixture\n", runCommand: this.runCommand.bind(this), write: (line) => output.push(line) });
    },
  };
}

function commandCalls(f, command, prefix) {
  return f.calls.filter((call) => call.command === command && (!prefix || call.args.slice(0, prefix.length).every((part, index) => part === prefix[index])));
}

test("fast preview uses one local Unix authority, offline two-image builds, immutable cutover, then smoke", async () => {
  const f = fixture();
  await f.run();
  assert.deepEqual(buildFastPreviewEnvironment(ambient), ambient);
  assert.deepEqual(commandCalls(f, "corepack").map((call) => call.args), [
    ["pnpm", "--offline", "-r", "typecheck"],
    ["pnpm", "--offline", "exec", "playwright", "test", "--config=scripts/local-preview.playwright.config.ts", "scripts/local-preview-smoke.spec.ts", "--workers=1"],
  ]);
  assert.deepEqual(commandCalls(f, "docker", ["build"]).map((call) => call.args), [
    ["build", "--network=none", "--pull=false", "--file", "apps/api/Dockerfile.refresh", "--tag", "blog-x-api-preview:current", "--build-arg", `SEED_IMAGE=${SHA("b")}`, "--build-arg", `SEED_IMAGE_ID=${SHA("b")}`, "--build-arg", `REFRESH_REVISION=${REVISION}`, "--build-arg", `LOCKFILE_SHA256=${LOCK}`, "--build-arg", `PUBLIC_ORIGIN=${origin}`, "."],
    ["build", "--network=none", "--pull=false", "--file", "apps/web/Dockerfile.refresh", "--tag", "blog-x-web-preview:current", "--build-arg", `SEED_IMAGE=${SHA("c")}`, "--build-arg", `SEED_IMAGE_ID=${SHA("c")}`, "--build-arg", `REFRESH_REVISION=${REVISION}`, "--build-arg", `LOCKFILE_SHA256=${LOCK}`, "--build-arg", `PUBLIC_ORIGIN=${origin}`, "."],
  ]);
  const cutover = commandCalls(f, "docker-compose")[0];
  assert.deepEqual(cutover.args, ["-p", "blogxlocal", "-f", "compose.yaml", "up", "-d", "--wait", "--no-build", "--no-deps", "api", "web"]);
  assert.deepEqual(cutover.options.env, { ...ambient, BLOG_X_API_IMAGE: SHA("d"), BLOG_X_WEB_IMAGE: SHA("e") });
  assert.ok(f.calls.findIndex((call) => call.args?.[2] === "blog-x-web-preview:current") < f.calls.indexOf(cutover));
  assert.deepEqual(f.output, [`${FAST_LOCAL_PREVIEW_READY}\n`]);
});

test("fast preview rejects ambient Docker routing and arguments", () => {
  assert.throws(() => buildFastPreviewEnvironment({ ...ambient, DOCKER_HOST: "tcp://outside" }), /DOCKER_HOST|override/i);
  assert.doesNotThrow(() => assertFastPreviewArgv(["node", "scripts/refresh-local-preview.mjs"]));
  assert.throws(() => assertFastPreviewArgv(["node", "scripts/refresh-local-preview.mjs", "--remote"]), /accepts no arguments/);
});

for (const [name, options] of [
  ["disallowed Docker authority", { context: "remote" }],
  ["missing Node base", { fail: (call) => call.command === "docker" && call.args[2] === "node:24.15.0-alpine" }],
  ["missing seed", { fail: (call) => call.command === "docker" && call.args[2] === "blog-x-api-local" }],
  ["mutable seed id", { mutate: ({ seeds }) => { seeds.api.Id = "sha256:not-an-id"; } }],
  ["application origin workdir or lock drift", { mutate: ({ seeds }) => { seeds.web.Config.WorkingDir = "/workspace"; } }],
  ["empty store or cache", { fail: (call) => call.command === "docker" && call.args[0] === "run" && call.args.includes(SHA("b")) }],
]) {
  test(`fast preview stops before either build for ${name}`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(commandCalls(f, "docker", ["build"]).length, 0);
    assert.equal(commandCalls(f, "docker-compose").length, 0);
    assert.deepEqual(f.output, []);
  });
}

for (const [name, options] of [
  ["the API build", { fail: (call) => call.command === "docker" && call.args[0] === "build" && call.args.includes("apps/api/Dockerfile.refresh") }],
  ["the Web build", { fail: (call) => call.command === "docker" && call.args[0] === "build" && call.args.includes("apps/web/Dockerfile.refresh") }],
  ["malformed target labels", { mutate: ({ targets }) => { targets.web.Config.Labels["io.blog-x.public-origin"] = "http://outside"; } }],
]) {
  test(`fast preview does not cut over after ${name} fails`, async () => {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(commandCalls(f, "docker-compose").length, 0);
    assert.deepEqual(f.output, []);
  });
}

test("fast preview suppresses readiness on cutover or smoke failure", async () => {
  for (const fail of [
    (call) => call.command === "docker-compose",
    (call) => call.command === "corepack" && call.args.includes("playwright"),
  ]) {
    const f = fixture({ fail });
    await assert.rejects(f.run());
    assert.deepEqual(f.output, []);
  }
});
