import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { encryptBackupPayload } from "./encryption.mjs";
import { createMountedDirectoryTransport } from "./mounted-directory.mjs";
import { applySafeRetention } from "./retention.mjs";
import {
  recordAlertOutcome,
  recordProductionResult,
  validateAlertAuthority,
  validateResultAuthority,
} from "./results.mjs";
import { verifyProductionBackupSource } from "./source-authority.mjs";

function fail(message) {
  throw new Error(`production backup ${message}`);
}

function strictObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function parseInput(value) {
  if (!strictObject(value, ["alertAuthority", "createdAt", "destination", "keyAuthority", "resultAuthority", "retention", "sourceAuthority", "sourceRoot"])
    || typeof value.sourceRoot !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !strictObject(value.retention, ["minimumKnownGood", "policyId"])) fail("input is invalid");
  return value;
}

export async function runProductionBackup(value, dependencies = {}) {
  const input = parseInput(value);
  const sourceRoot = resolve(input.sourceRoot);
  const mountRoot = resolve(input.destination.mountRoot ?? "");
  if (mountRoot === sourceRoot || mountRoot.startsWith(`${sourceRoot}/`) || sourceRoot.startsWith(`${mountRoot}/`)) fail("mount authority overlaps the source authority");
  const source = await verifyProductionBackupSource(input.sourceRoot, input.sourceAuthority);
  await Promise.all([validateResultAuthority(input.resultAuthority), validateAlertAuthority(input.alertAuthority)]);
  const concreteTransport = await createMountedDirectoryTransport(input.destination, { inspectMount: dependencies.inspectMount });
  const transport = dependencies.transport ?? concreteTransport;
  if (!transport || typeof transport.transfer !== "function" || typeof transport.catalog !== "function" || typeof transport.deleteCatalogEntry !== "function") fail("transport is invalid");
  const encrypted = await encryptBackupPayload({
    sourceRoot: input.sourceRoot, manifest: source.manifest, marker: source.marker, createdAt: input.createdAt,
    retentionPolicyId: input.retention.policyId, destinationProfileId: concreteTransport.destinationProfileId, keyAuthority: input.keyAuthority,
  });
  const receipt = await transport.transfer({
    setId: source.manifest.setId, ciphertext: encrypted.ciphertext, ciphertextSha256: encrypted.ciphertextSha256,
    manifestSha256: encrypted.manifestSha256, aadSha256: encrypted.aadSha256, createdAt: input.createdAt,
  });
  if (!receipt || receipt.ciphertextSha256 !== encrypted.ciphertextSha256 || receipt.manifestSha256 !== encrypted.manifestSha256 || receipt.aadSha256 !== encrypted.aadSha256) fail("receipt binding mismatch");
  const retention = await applySafeRetention({ transport, retentionPolicyId: input.retention.policyId, minimumKnownGood: input.retention.minimumKnownGood });
  const scope = input.sourceAuthority.kind === "service" && concreteTransport.scope === "service-mounted-directory" && transport === concreteTransport
    ? "service-production-pipeline"
    : transport.scope ?? concreteTransport.scope;
  const receiptSha256 = receipt.receiptSha256 ?? createHash("sha256").update(JSON.stringify({ ...receipt, receiptSha256: undefined })).digest("hex");
  const buildResult = (alertOutcome) => ({
    format: "blog-x-production-backup-result", version: 1, status: "complete", scope, setId: source.manifest.setId,
    createdAt: input.createdAt, manifestSha256: encrypted.manifestSha256, ciphertextSha256: encrypted.ciphertextSha256,
    receiptSha256, destinationProfileId: concreteTransport.destinationProfileId, retention, alertOutcome,
  });
  const recordAlert = dependencies.recordAlert ?? ((authority, outcome) => recordAlertOutcome(authority, outcome));
  let alert;
  try {
    alert = await recordAlert(input.alertAuthority, { setId: source.manifest.setId, status: "recorded", createdAt: input.createdAt });
  } catch {
    await (dependencies.recordResult ?? recordProductionResult)(input.resultAuthority, buildResult("unconfirmed")).catch(() => undefined);
    fail("alert outcome is unconfirmed");
  }
  if (alert?.status !== "recorded") {
    await (dependencies.recordResult ?? recordProductionResult)(input.resultAuthority, buildResult("unconfirmed"));
    fail("alert outcome is unconfirmed");
  }
  const result = buildResult("recorded");
  return (dependencies.recordResult ?? recordProductionResult)(input.resultAuthority, result);
}
