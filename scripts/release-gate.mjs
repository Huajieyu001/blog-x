import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvidenceArtifact, validateEvidenceBundleRoot } from "./release-gate/bundle.mjs";
import { formatReleaseDecision, validateReleaseEvidence } from "./release-gate/validate.mjs";

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const evidencePath = option("evidence");
  const expectBlocked = process.argv.includes("--expect-blocked");
  if (!evidencePath) throw new Error("evidence.path");
  const canonical = evidencePath === "ops/release-evidence.blocked.json";
  const root = validateEvidenceBundleRoot(option("bundle-root") ?? process.cwd());
  const loaded = await readEvidenceArtifact(root, evidencePath);
  const evidence = JSON.parse(loaded.bytes.toString("utf8"));
  const decision = await validateReleaseEvidence(evidence, { bundleRoot: root, evidencePath, expectBlocked, canonical });
  process.stdout.write(`${formatReleaseDecision(decision)}\n`);
  process.exitCode = decision.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stdout.write("RELEASE INVALID evidence.invalid\n");
    process.exitCode = 2;
  });
}
