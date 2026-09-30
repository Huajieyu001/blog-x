import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("API production image keeps its operational runtime while excluding development tooling", async () => {
  const [dockerfile, manifest, lockfile] = await Promise.all([
    read("apps/api/Dockerfile"),
    read("apps/api/package.json").then(JSON.parse),
    read("pnpm-lock.yaml"),
  ]);

  assert.equal(manifest.scripts.start, "tsx src/app.ts");
  assert.equal(manifest.dependencies.tsx, "4.23.7");
  assert.equal(manifest.devDependencies.tsx, undefined);
  assert.match(lockfile, /dependencies:\n(?:.|\n)*?tsx:\n\s+specifier: 4\.23\.7/);
  assert.match(dockerfile, /install --prod --frozen-lockfile/);
  assert.match(dockerfile, /COPY --chown=1000:1000 apps\/api\/drizzle apps\/api\/drizzle/);
  assert.match(dockerfile, /COPY --from=production-dependencies --chown=1000:1000 \/corepack-cache \/home\/node\/\.cache\/node\/corepack/);
  assert.match(dockerfile, /USER node\s+EXPOSE 3001\s+CMD \["corepack", "pnpm", "--filter", "@blog-x\/api", "start"\]/s);
  assert.doesNotMatch(dockerfile, /COPY --chown=1000:1000 apps\/api\/test/);
});

test("local compose explicitly preserves root-owned development volumes", async () => {
  const compose = await read("compose.yaml");
  const apiService = compose.match(/\n  api:\n([\s\S]*?)\n  web:\n/)?.[1] ?? "";
  assert.match(apiService, /\n    user: "0:0"\n/);
  assert.doesNotMatch(apiService, /read_only:/);
});

test("hardening acceptance covers API operations, media and isolated all-scope cleanup", async () => {
  const harness = await read("scripts/production-container-hardening.mjs");
  for (const command of ["db:migrate", "db:schema:verify", "publish:due", "retention"]) {
    assert.match(harness, new RegExp(JSON.stringify(command).slice(1, -1).replace(":", "\\:")));
  }
  assert.match(harness, /tar -tf \/tmp\/media\.tar \| grep -Fx marker/);
  assert.ok(harness.includes('if (scope === "all") {\n    await verifyApi(join(temporaryRoot, "candidate"));\n    await cleanup();\n    await verifyWeb(join(temporaryRoot, "candidate"));'));
});
