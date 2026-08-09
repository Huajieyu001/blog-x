import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { readEvidenceArtifact, validateEvidenceBundleRoot } from "./bundle.mjs";
import { releaseEvidenceSchema, releaseSectionNames } from "./schema.mjs";

const expectedTypes = {
  authorization: ["blog-x-release-authorization"],
  hostBaselines: ["blog-x-release-host-baseline", "blog-x-release-host-baseline"],
  networkBoundary: ["blog-x-release-network-boundary"],
  backupRestore: ["blog-x-release-backup-restore"],
  operations: ["blog-x-release-operations"],
  rollback: ["blog-x-release-rollback"],
  postRelease: ["blog-x-release-post-release"],
};

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label}.shape`);
  return value;
}

function safeScalarScan(value) {
  const scalars = [];
  const visit = (item) => {
    if (typeof item === "string") scalars.push(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") Object.values(item).forEach(visit);
  };
  visit(value);
  for (const scalar of scalars) {
    if (/-----BEGIN|(?:password|passwd|cookie|token|secret)\s*[=:]|postgres(?:ql)?:\/\/[^\s/]+:[^\s@]+@/i.test(scalar)) throw new Error("evidence.secret_like");
    if (/(?:https?:\/\/(?:api|postgres)(?::\d+)?\b)|(?:^|[^0-9])(?:47\.99\.80\.8|124\.222\.91\.230)(?:[^0-9]|$)/i.test(scalar)) throw new Error("evidence.address_authority");
  }
}

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function isIso(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function digest(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function checksum(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function refs(value) { return typeof value === "string" && /^(?:approval|decision|authority|role):[a-z0-9-]+$/.test(value); }

function parseArtifact(value, expectedType) {
  strictObject(value, ["details", "format", "observedAt", "outcome", "version"], "artifact");
  if (value.format !== expectedType || value.version !== 1 || !["pass", "fail"].includes(value.outcome) || !isIso(value.observedAt)) throw new Error("artifact.format");
  safeScalarScan(value);
  const d = value.details;
  if (expectedType === "blog-x-release-authorization") {
    strictObject(d, ["authorizationRef", "scope", "windowEndsAt", "windowStartsAt"], "authorization");
    if (!refs(d.authorizationRef) || d.scope !== "web-api-release" || !isIso(d.windowStartsAt) || !isIso(d.windowEndsAt) || Date.parse(d.windowStartsAt) >= Date.parse(d.windowEndsAt)) throw new Error("authorization.semantic");
  } else if (expectedType === "blog-x-release-host-baseline") {
    strictObject(d, ["edgePreservedUntilRelease", "firewallReviewed", "osSupported", "portsReviewed", "resourcesReviewed", "role", "servicesReviewed"], "host baseline");
    if (!["main", "secondary"].includes(d.role) || [d.edgePreservedUntilRelease, d.firewallReviewed, d.osSupported, d.portsReviewed, d.resourcesReviewed, d.servicesReviewed].some((item) => item !== true)) throw new Error("host_baseline.semantic");
  } else if (expectedType === "blog-x-release-network-boundary") {
    strictObject(d, ["apiPublic", "browserSameOrigin", "encryptedPrivateLink", "postgresPublic"], "network boundary");
    if (d.browserSameOrigin !== true || d.apiPublic !== false || d.postgresPublic !== false || d.encryptedPrivateLink !== true) throw new Error("network_boundary.semantic");
  } else if (expectedType === "blog-x-release-backup-restore") {
    strictObject(d, ["completeBackup", "dailyScheduled", "encryptionKeyAuthorityRef", "isolatedRestorePassed", "knownGoodRetained", "lastCompleteBackupAt", "offHostDestinationRef", "retentionDecisionRef", "rpoDecisionRef", "rtoDecisionRef"], "backup restore");
    if ([d.completeBackup, d.dailyScheduled, d.isolatedRestorePassed, d.knownGoodRetained].some((item) => item !== true)
      || !isIso(d.lastCompleteBackupAt) || ![d.offHostDestinationRef, d.retentionDecisionRef, d.encryptionKeyAuthorityRef, d.rpoDecisionRef, d.rtoDecisionRef].every(refs)) throw new Error("backup_restore.semantic");
  } else if (expectedType === "blog-x-release-operations") {
    strictObject(d, ["alertRecipientRef", "boundedLogs", "renewalVerified", "resourceLimitsSelected", "restartVerified", "statusPassed", "tlsCurrent"], "operations");
    if ([d.boundedLogs, d.renewalVerified, d.resourceLimitsSelected, d.restartVerified, d.statusPassed, d.tlsCurrent].some((item) => item !== true) || !refs(d.alertRecipientRef)) throw new Error("operations.semantic");
  } else if (expectedType === "blog-x-release-rollback") {
    strictObject(d, ["edgeConfigSha256", "knownGoodBackup", "mediaPreserved", "migrationCompatible", "ownerRef", "priorApiDigest", "priorWebDigest", "stopCriteria", "validationPassed"], "rollback");
    if (!digest(d.priorApiDigest) || !digest(d.priorWebDigest) || !checksum(d.edgeConfigSha256) || !refs(d.ownerRef)
      || [d.knownGoodBackup, d.mediaPreserved, d.migrationCompatible, d.validationPassed].some((item) => item !== true)
      || !Array.isArray(d.stopCriteria) || d.stopCriteria.length < 2 || d.stopCriteria.some((item) => typeof item !== "string" || !item)) throw new Error("rollback.semantic");
  } else if (expectedType === "blog-x-release-post-release") {
    strictObject(d, ["decisionOwnerRef", "rollbackDecisionRecorded", "smokeChecks"], "post release");
    if (!refs(d.decisionOwnerRef) || d.rollbackDecisionRecorded !== true || !Array.isArray(d.smokeChecks) || d.smokeChecks.length < 3 || d.smokeChecks.some((item) => typeof item !== "string" || !item)) throw new Error("post_release.semantic");
  } else throw new Error("artifact.type");
  return value;
}

async function listBundleFiles(root, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const member = relative(root, path).split(sep).join("/");
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("bundle.link");
    if (info.isDirectory()) output.push(...await listBundleFiles(root, path));
    else if (info.isFile()) output.push(member);
    else throw new Error("bundle.member_type");
  }
  return output.sort();
}

function invalid(reason = "evidence.invalid") { return { status: "INVALID", exitCode: 2, reasons: [String(reason).split(/[\s:]/)[0] || "evidence.invalid"] }; }

export async function evaluateReleaseReadiness(input, options = {}) {
  try {
    const evidence = releaseEvidenceSchema.parse(input);
    safeScalarScan(evidence);
    const pending = releaseSectionNames.flatMap((name) => evidence[name].status === "pending" ? evidence[name].unresolved : []);
    if (evidence.state === "BLOCKED" || pending.length) {
      if (evidence.state === "BLOCKED" && releaseSectionNames.some((name) => evidence[name].status !== "pending")) return invalid("blocked.ready_reference");
      return { status: "BLOCKED", exitCode: options.expectBlocked ? 0 : 1, reasons: [...new Set(pending)].sort() };
    }
    if (evidence.state !== "READY") return invalid("evidence.state");
    const root = validateEvidenceBundleRoot(options.bundleRoot);
    const now = (options.now?.() ?? new Date()).getTime();
    const expectedFiles = new Set([options.evidencePath ?? "evidence.json"]);
    const parsed = {};
    for (const sectionName of releaseSectionNames) {
      const section = evidence[sectionName];
      const types = expectedTypes[sectionName];
      if (section.references.length !== types.length) return { status: "BLOCKED", exitCode: 1, reasons: [`${sectionName}.references`] };
      parsed[sectionName] = [];
      for (let index = 0; index < types.length; index += 1) {
        const reference = section.references[index];
        if (reference.type !== types[index]) throw new Error("reference.type");
        const observed = Date.parse(reference.observedAt), until = Date.parse(reference.validUntil);
        if (observed > now || until <= now || until <= observed) throw new Error("reference.time");
        const loaded = await readEvidenceArtifact(root, reference.artifact);
        expectedFiles.add(reference.artifact);
        if (sha(loaded.bytes) !== reference.sha256) throw new Error("reference.hash");
        const value = parseArtifact(JSON.parse(loaded.bytes.toString("utf8")), reference.type);
        if (value.observedAt !== reference.observedAt || value.outcome !== reference.outcome) throw new Error("reference.binding");
        if (value.outcome !== "pass") return { status: "BLOCKED", exitCode: 1, reasons: [`${sectionName}.outcome`] };
        parsed[sectionName].push(value);
      }
    }
    const roles = parsed.hostBaselines.map((item) => item.details.role).sort();
    if (JSON.stringify(roles) !== JSON.stringify(["main", "secondary"])) return { status: "BLOCKED", exitCode: 1, reasons: ["hostBaselines.roles"] };
    if (now - Date.parse(parsed.backupRestore[0].details.lastCompleteBackupAt) > 86_400_000 || Date.parse(parsed.backupRestore[0].details.lastCompleteBackupAt) > now) {
      return { status: "BLOCKED", exitCode: 1, reasons: ["backupRestore.daily"] };
    }
    const actualFiles = await listBundleFiles(root);
    const expected = [...expectedFiles].sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expected)) throw new Error("bundle.extra_or_missing");
    return { status: "READY", exitCode: 0, reasons: [] };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "evidence.invalid");
  }
}

export async function validateReleaseEvidence(input, options = {}) {
  const decision = await evaluateReleaseReadiness(input, options);
  if (options.expectBlocked && decision.status !== "BLOCKED") return invalid("expect_blocked.failed");
  if (options.expectBlocked && options.canonical !== true) return invalid("expect_blocked.canonical_required");
  return decision;
}

export function formatReleaseDecision(decision) {
  const prefix = `RELEASE ${decision.status}`;
  return decision.reasons?.length ? `${prefix} ${[...decision.reasons].sort().join(",")}` : prefix;
}
