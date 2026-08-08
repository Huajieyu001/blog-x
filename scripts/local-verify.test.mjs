import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditFiles } from "./check-boundaries.mjs";
import { redactText, validateNamespace } from "./local-verify.mjs";

test("verification namespaces are narrow and safe cleanup targets", () => {
  assert.equal(validateNamespace("blogxverify_a1b2c3d4"), "blogxverify_a1b2c3d4");
  for (const candidate of ["", "/", ".", "blogxverify", "blogxverify_A1B2C3D4", "blogxverify_a;rm", "other_a1b2c3d4"]) {
    assert.throws(() => validateNamespace(candidate), /namespace/i);
  }
});

test("captured output redacts credentials, session material, and database URLs", () => {
  const password = "runtime-password-value";
  const token = "runtime-cookie-value";
  const databaseUrl = "postgres://local_user:local_password@postgres:5432/local_database";
  const redacted = redactText([
    `password=${password}`,
    `Cookie: blog_x_session=${token}`,
    `Set-Cookie: blog_x_session=${token}; HttpOnly`,
    `DATABASE_URL=${databaseUrl}`,
  ].join("\n"), [password, token, databaseUrl]);

  assert.doesNotMatch(redacted, new RegExp(password));
  assert.doesNotMatch(redacted, new RegExp(token));
  assert.doesNotMatch(redacted, /postgres:\/\//);
  assert.match(redacted, /\[REDACTED\]/);
});

test("boundary audit rejects database ownership in Web, public server addresses, frozen-host commands, and tracked secrets", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "blog-x-boundary-"));
  context.after(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });
  await mkdir(join(fixtureRoot, "apps/web/app"), { recursive: true });
  await mkdir(join(fixtureRoot, "scripts"), { recursive: true });
  const frozenAddress = [47, 99, 80, 8].join(".");
  const secondaryAddress = [124, 222, 91, 230].join(".");
  const files = [
    "apps/web/app/leak.ts",
    "apps/web/app/direct-client.ts",
    "scripts/deploy.sh",
    ".env.production",
  ];
  await writeFile(join(fixtureRoot, files[0]), 'import { Pool } from "pg";\n');
  await writeFile(join(fixtureRoot, files[1]), `fetch("http://${secondaryAddress}:3001/health");\n`);
  await writeFile(join(fixtureRoot, files[2]), `ssh root@${frozenAddress} true\n`);
  await writeFile(join(fixtureRoot, files[3]), "ADMIN_PASSWORD=committed-secret\n");

  const issues = await auditFiles(fixtureRoot, files);
  assert.equal(issues.some((issue) => issue.code === "web_database_ownership"), true);
  assert.equal(issues.some((issue) => issue.code === "browser_server_address"), true);
  assert.equal(issues.some((issue) => issue.code === "frozen_host_command"), true);
  assert.equal(issues.some((issue) => issue.code === "tracked_secret_file"), true);
});
