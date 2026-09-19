import assert from "node:assert/strict";
import test from "node:test";
import { collectProductionReadiness, formatProductionReadinessReport, runProductionReadinessCli } from "./production-readiness.mjs";
import { assertLocalDeliveryEvidenceSchema } from "../refresh-local-runtime-core.mjs";

const sha = (character) => character.repeat(40);
const receiptRevision = "509b75c23e0e0af22272493cc8df32280444057d";

function gitFixture({ branch = "refs/heads/dev", clean = true, ancestor = true, deployChanged = false, receipt = receiptRevision } = {}) {
  const calls = [];
  return {
    calls,
    run: async (command, args) => {
      calls.push({ command, args: [...args] });
      assert.equal(command, "git");
      const joined = args.join(" ");
      if (joined === "symbolic-ref --quiet HEAD") return { stdout: `${branch}\n` };
      if (joined === "rev-parse HEAD") return { stdout: `${sha("b")}\n` };
      if (joined === "status --porcelain") return { stdout: clean ? "" : " M hostile-secret.txt\n" };
      if (joined === "log --format=%H --diff-filter=A --name-only -- ops/local-deliveries") return { stdout: `${receipt}\nops/local-deliveries/${receipt}.json\n` };
      if (args[0] === "ls-files" && args[1] === "-z") return { stdout: "deploy/primary/deploy.sh\0deploy/secondary/deploy.sh\0" };
      if (args[0] === "ls-files") return { stdout: "" };
      if (args[0] === "merge-base") { if (ancestor) return { stdout: "" }; throw new Error("not ancestor"); }
      if (args[0] === "diff") { if (deployChanged) throw new Error("changed"); return { stdout: "" }; }
      throw new Error("unexpected git call");
    },
  };
}

function baseOptions(overrides = {}) {
  const fixture = gitFixture(overrides);
  const revision = receiptRevision;
  return {
    root: process.cwd(),
    run: fixture.run,
    readFile: async (path, encoding) => {
      if (String(path).endsWith(`${revision}.json`)) return await import("node:fs/promises").then(({ readFile }) => readFile(`ops/local-deliveries/${revision}.json`, encoding));
      if (String(path).endsWith("release-evidence.blocked.json")) return JSON.stringify({ format: "blog-x-release-evidence", version: 2, state: "BLOCKED", authorization: { status: "pending", unresolved: ["authorization.change_window"] }, hostBaselines: { status: "pending", unresolved: ["host.main_baseline"] }, networkBoundary: { status: "pending", unresolved: ["network.private_link"] }, backupRestore: { status: "pending", unresolved: ["backup.collector"] }, operations: { status: "pending", unresolved: ["operations.tls"] }, rollback: { status: "pending", unresolved: ["rollback.owner"] } });
      return "#!/bin/sh\n";
    },
    lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 1 }),
    fixture,
  };
}

test("strict local delivery assertion remains exported", async () => {
  const { readFile } = await import("node:fs/promises");
  const receipt = JSON.parse(await readFile("ops/local-deliveries/509b75c23e0e0af22272493cc8df32280444057d.json", "utf8"));
  assert.equal(assertLocalDeliveryEvidenceSchema(receipt), true);
});

test("canonical blocked readiness binds local inputs and returns sanitized STOP", async () => {
  const options = baseOptions();
  const report = await collectProductionReadiness(options);
  assert.equal(report.decision, "STOP");
  assert.equal(report.productionEvidence.status, "BLOCKED");
  assert.equal(report.prerequisites.backupRestore.status, "PENDING");
  assert.equal(report.prerequisites.rollback.status, "PENDING");
  assert.equal(report.repository.branch, "refs/heads/dev");
  assert.match(report.localDelivery.receiptSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.localDelivery.implementationAncestor, true);
  assert.equal(report.deployArtifacts.changedSinceImplementation, false);
  assert.equal(report.deployArtifacts.files.length, 2);
  const output = formatProductionReadinessReport(report);
  assert.deepEqual(JSON.parse(output), report);
  assert.doesNotMatch(output, /hostile-secret|private\/|http|47\.99|124\.222/i);
});

test("local readiness fails closed without falling back to an older receipt", async () => {
  const options = baseOptions({ clean: false });
  const report = await collectProductionReadiness(options);
  assert.equal(report.decision, "STOP");
  assert.equal(report.repository.clean, false);
  assert.ok(report.reasons.includes("repository.dirty"));
  assert.doesNotMatch(JSON.stringify(report), /hostile-secret/);
});

test("expect-stop changes only the exit code for a valid STOP", async () => {
  const output = [];
  const result = await runProductionReadinessCli({ argv: ["--expect-stop"], output: { write: (line) => output.push(line) }, collect: async () => ({ format: "blog-x-production-rollout-readiness", version: 1, decision: "STOP", repository: { branch: "refs/heads/dev", branchMatched: true, head: sha("b"), clean: true }, localDelivery: { receipt: `ops/local-deliveries/${sha("a")}.json`, receiptSha256: "c".repeat(64), implementationRevision: sha("a"), implementationAncestor: true, targets: { api: "sha256:" + "a".repeat(64), web: "sha256:" + "b".repeat(64) } }, deployArtifacts: { files: [], manifestSha256: "d".repeat(64), changedSinceImplementation: false }, productionEvidence: { source: "canonical", sha256: "e".repeat(64), status: "BLOCKED", reasons: ["authorization.change_window"] }, prerequisites: { backupRestore: { status: "PENDING", unresolved: ["backup.collector"] }, rollback: { status: "PENDING", unresolved: ["rollback.owner"] } }, reasons: ["authorization.change_window"] }) });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(output.join("")), result.report);
});
