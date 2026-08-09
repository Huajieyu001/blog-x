import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runProductionBackup } from "./production/adapter.mjs";
import { collectProductionBackupSet } from "./production/collector.mjs";
import { parseProductionPipelinePolicy } from "./production/policy.mjs";
import { validateProductionSourceBase, verifyProductionBackupSource } from "./production/source-authority.mjs";

function fail(message) {
  throw new Error(`production pipeline ${message}`);
}

async function inspectLocalMount(root) {
  const target = await stat(root);
  const parent = await stat(resolve(root, ".."));
  const isMountPoint = target.dev !== parent.dev || await new Promise((accept) => {
    execFile("mountpoint", ["-q", "--", root], (error) => accept(!error));
  });
  return { isMountPoint, root };
}

export async function runProductionPipeline(value, dependencies = {}) {
  const policy = parseProductionPipelinePolicy(value);
  const authority = validateProductionSourceBase(policy.sourceAuthority);
  const existing = await readdir(authority.sourceBase);
  if (existing.some((entry) => entry.startsWith(".") && entry.includes(".incomplete-"))) fail("source staging authority is not empty");
  const collected = await collectProductionBackupSet({
    format: "blog-x-production-backup-policy", version: 1, sourceAuthority: policy.sourceAuthority, collector: policy.collector,
  }, dependencies);
  const source = await verifyProductionBackupSource(collected.finalRoot, policy.sourceAuthority);
  const createdAt = source.manifest.createdAt;
  return runProductionBackup({
    sourceRoot: collected.finalRoot, sourceAuthority: policy.sourceAuthority, keyAuthority: policy.keyAuthority,
    destination: policy.destination, retention: policy.retention, resultAuthority: policy.resultAuthority,
    alertAuthority: policy.alertAuthority, createdAt,
  }, { inspectMount: dependencies.inspectMount ?? inspectLocalMount });
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const policyPath = option("policy");
  if (!policyPath || process.argv.slice(2).some((item) => !item.startsWith("--policy="))) {
    process.stderr.write("PRODUCTION BACKUP PIPELINE FAILED invalid arguments\n");
    process.exitCode = 1;
  } else {
    readFile(policyPath, "utf8").then(JSON.parse).then((policy) => runProductionPipeline(policy)).then((result) => {
      process.stdout.write(`PRODUCTION BACKUP PIPELINE COMPLETE ${result.setId}\n`);
    }).catch((error) => {
      process.stderr.write(`PRODUCTION BACKUP PIPELINE FAILED ${error instanceof Error ? error.message : "unknown"}\n`);
      process.exitCode = 1;
    });
  }
}
