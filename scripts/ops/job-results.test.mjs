import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixedSecondaryCommand, parseSecondaryJobArguments, runSecondaryJob } from "./run-secondary-job.mjs";
import { writeJobReceipt } from "./job-results.mjs";

const temporaryRoot = () => mkdtemp(join(tmpdir(), "blog-x-ops-"));

test("secondary runner accepts only fixed jobs and fixed compose invocations", () => {
  assert.deepEqual(parseSecondaryJobArguments(["retention", "--results-root=/tmp/results"]), { ok: true, job: "retention", resultRoot: "/tmp/results" });
  for (const args of [[], ["shell", "--results-root=/tmp/results"], ["retention"], ["retention", "--results-root=relative"], ["retention", "--results-root=/tmp/results", "--limit=1"]]) {
    assert.deepEqual(parseSecondaryJobArguments(args), { ok: false });
  }
  assert.deepEqual(fixedSecondaryCommand("retention"), [
    "compose", "--project-name", "blog-x-secondary", "--env-file", "/etc/blog-x/secondary.env", "--file", "/opt/blog-x/deploy/secondary/compose.yaml",
    "exec", "-T", "api", "corepack", "pnpm", "--filter", "@blog-x/api", "retention", "--views-limit=100", "--sessions-limit=100",
  ]);
  assert.deepEqual(fixedSecondaryCommand("publish-due").slice(-2), ["publish:due", "--limit=100"]);
});

test("success stores sanitized aggregate receipt rather than child output", async () => {
  const root = await temporaryRoot();
  const result = await runSecondaryJob({
    job: "retention", resultRoot: root,
    execute: async () => ({ exitCode: 0, stdout: JSON.stringify({
      format: "blog-x-operational-retention", version: 1, command: "retention", observedAt: "2032-01-01T00:00:00.000Z",
      views: { limit: 100, retainedFromDay: "2030-12-31", deleted: 2 },
      sessions: { limit: 100, deleted: 3, expiredBefore: "2032-01-01T00:00:00.000Z", revokedBefore: "2031-12-18T00:00:00.000Z" },
      secret: "must-reject",
    }), stderr: "DATABASE_URL=secret" }),
  });
  assert.equal(result.exitCode, 1);
  const failed = JSON.parse(await readFile(result.receiptPath, "utf8"));
  assert.deepEqual({ status: failed.status, code: failed.code, counts: failed.counts }, { status: "failed", code: "invalid_output", counts: {} });
  assert.doesNotMatch(JSON.stringify(failed), /DATABASE_URL|secret|retainedFromDay/i);

  const good = await runSecondaryJob({
    job: "retention", resultRoot: root,
    execute: async () => ({ exitCode: 0, stdout: JSON.stringify({
      format: "blog-x-operational-retention", version: 1, command: "retention", observedAt: "2032-01-01T00:00:00.000Z",
      views: { limit: 100, retainedFromDay: "2030-12-31", deleted: 2 },
      sessions: { limit: 100, deleted: 3, expiredBefore: "2032-01-01T00:00:00.000Z", revokedBefore: "2031-12-18T00:00:00.000Z" },
    }), stderr: "hidden" }),
  });
  assert.equal(good.exitCode, 0);
  const receipt = JSON.parse(await readFile(good.receiptPath, "utf8"));
  assert.deepEqual({ status: receipt.status, code: receipt.code, counts: receipt.counts }, { status: "succeeded", code: "ok", counts: { viewsDeleted: 2, sessionsDeleted: 3 } });
  assert.doesNotMatch(JSON.stringify(receipt), /hidden|retainedFromDay|expiredBefore/i);
});

test("all terminal failures receive receipts and collisions fail closed", async () => {
  const root = await temporaryRoot();
  const failure = await runSecondaryJob({ job: "publish-due", resultRoot: root, execute: async () => ({ exitCode: 1, stdout: "article-id", stderr: "password=secret" }) });
  assert.equal(failure.exitCode, 1);
  const receipt = JSON.parse(await readFile(failure.receiptPath, "utf8"));
  assert.deepEqual({ status: receipt.status, code: receipt.code, counts: receipt.counts }, { status: "failed", code: "command_failed", counts: {} });
  assert.doesNotMatch(JSON.stringify(receipt), /article|password|secret/i);

  const timeout = await runSecondaryJob({ job: "retention", resultRoot: root, execute: async () => ({ exitCode: null, signal: "SIGKILL", timedOut: true, stdout: "", stderr: "" }) });
  assert.equal(JSON.parse(await readFile(timeout.receiptPath, "utf8")).code, "timeout");
  const signaled = await runSecondaryJob({ job: "retention", resultRoot: root, execute: async () => ({ exitCode: null, signal: "SIGTERM", stdout: "", stderr: "" }) });
  assert.equal(JSON.parse(await readFile(signaled.receiptPath, "utf8")).code, "signaled");

  const collisionId = "00000000-0000-4000-8000-000000000017";
  const first = { format: "blog-x-job-receipt", version: 1, job: "retention", runId: collisionId, observedAt: "2032-01-01T00:00:00.000Z", completedAt: "2032-01-01T00:00:01.000Z", status: "failed", code: "timeout", counts: {} };
  await writeJobReceipt(root, first);
  await assert.rejects(() => writeJobReceipt(root, first), /receipt target already exists/);
  const racing = { ...first, runId: "00000000-0000-4000-8000-000000000019" };
  const concurrent = await Promise.allSettled([writeJobReceipt(root, racing), writeJobReceipt(root, racing)]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
});

test("unsafe result roots fail closed", async () => {
  const root = await temporaryRoot();
  await chmod(root, 0o755);
  await assert.rejects(() => writeJobReceipt(root, { format: "blog-x-job-receipt", version: 1, job: "retention", runId: "00000000-0000-4000-8000-000000000018", observedAt: "2032-01-01T00:00:00.000Z", completedAt: "2032-01-01T00:00:01.000Z", status: "failed", code: "timeout", counts: {} }), /unsafe result root/);
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "unused"), "");
});
