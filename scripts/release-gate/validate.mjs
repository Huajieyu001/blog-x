import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { readEvidenceArtifact, validateEvidenceBundleRoot } from "./bundle.mjs";
import { postReleaseEvidenceSchema, preReleaseEvidenceSchema, preReleaseSectionNames, releaseEvidenceSchema } from "./schema.mjs";
import { parseProductionReleaseEvidence, productionBackupResultSchema } from "../backup/production/results.mjs";

const expectedTypes = {
  authorization: ["blog-x-release-authorization"],
  hostBaselines: ["blog-x-release-host-baseline", "blog-x-release-host-baseline"],
  networkBoundary: ["blog-x-release-network-boundary"],
  backupRestore: ["blog-x-release-backup-restore"],
  operations: ["blog-x-release-operations"],
  rollback: ["blog-x-release-rollback"],
};

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label}.shape`);
  return value;
}

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function isIso(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function digest(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function checksum(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function refs(value) { return typeof value === "string" && /^(?:approval|decision|authority|role):[a-z0-9-]+$/.test(value); }

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
    if (/\bhttps?:\/\/|\b(?:\d{1,3}\.){3}\d{1,3}\b/i.test(scalar)) throw new Error("evidence.address_authority");
  }
}

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
    strictObject(d, ["alert", "collector", "independentRestore", "mounted", "productionResult", "retention"], "backup restore");
    strictObject(d.collector, ["collectedAt", "configImageMigrationInventory", "database", "derivativeMedia", "portableExport", "scope", "sourceMedia"], "collector");
    strictObject(d.independentRestore, ["manifestSha256", "passed"], "independent restore");
    strictObject(d.mounted, ["authenticatedCiphertext", "receiptBound", "receiptSha256"], "mounted ciphertext");
    strictObject(d.retention, ["safe"], "retention");
    strictObject(d.alert, ["confirmed"], "alert");
    if (!isIso(d.collector.collectedAt) || !checksum(d.independentRestore.manifestSha256) || !checksum(d.mounted.receiptSha256)
      || [d.collector.database, d.collector.portableExport, d.collector.sourceMedia, d.collector.derivativeMedia, d.collector.configImageMigrationInventory, d.independentRestore.passed, d.mounted.authenticatedCiphertext, d.mounted.receiptBound, d.retention.safe, d.alert.confirmed].some((item) => item !== true)
      || typeof d.collector.scope !== "string") throw new Error("backup_restore.semantic");
    productionBackupResultSchema.parse(d.productionResult);
    if (d.collector.scope !== "service-production-pipeline" || d.productionResult.scope !== "service-production-pipeline") return { ...value, generatedScope: true };
    parseProductionReleaseEvidence(d.productionResult);
  } else if (expectedType === "blog-x-release-operations") {
    strictObject(d, ["alertRecipientRef", "boundedLogs", "renewalVerified", "resourceLimitsSelected", "restartVerified", "statusPassed", "tlsCurrent"], "operations");
    if ([d.boundedLogs, d.renewalVerified, d.resourceLimitsSelected, d.restartVerified, d.statusPassed, d.tlsCurrent].some((item) => item !== true) || !refs(d.alertRecipientRef)) throw new Error("operations.semantic");
  } else if (expectedType === "blog-x-release-rollback") {
    strictObject(d, ["edgeConfigSha256", "knownGoodBackup", "mediaPreserved", "migrationCompatible", "ownerRef", "priorApiDigest", "priorWebDigest", "stopCriteria", "validationPassed"], "rollback");
    if (!digest(d.priorApiDigest) || !digest(d.priorWebDigest) || !checksum(d.edgeConfigSha256) || !refs(d.ownerRef)
      || [d.knownGoodBackup, d.mediaPreserved, d.migrationCompatible, d.validationPassed].some((item) => item !== true)
      || !Array.isArray(d.stopCriteria) || d.stopCriteria.length < 2 || d.stopCriteria.some((item) => typeof item !== "string" || !item)) throw new Error("rollback.semantic");
  } else if (expectedType === "blog-x-release-post-release") {
    strictObject(d, ["continueOrRollback", "deployedApiDigest", "deployedWebDigest", "smoke"], "post release");
    strictObject(d.smoke, ["adminLogin", "homepage", "media", "publicArticle"], "post release smoke");
    if (!["continue", "rollback"].includes(d.continueOrRollback) || !digest(d.deployedApiDigest) || !digest(d.deployedWebDigest)
      || [d.smoke.adminLogin, d.smoke.homepage, d.smoke.media, d.smoke.publicArticle].some((item) => typeof item !== "boolean")) throw new Error("post_release.semantic");
  } else throw new Error("artifact.type");
  return value;
}

function pendingReasons(evidence) {
  return preReleaseSectionNames.flatMap((name) => evidence[name].status === "pending" ? evidence[name].unresolved : []);
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

function invalid(reason = "evidence.invalid") {
  return { status: "INVALID", exitCode: 2, reasons: [String(reason).split(/[\s:]/)[0] || "evidence.invalid"] };
}

function blocked(reasons) {
  return { status: "BLOCKED", exitCode: 1, reasons: [...new Set(reasons)].sort() };
}

function currentTime(options) { return (options.now?.() ?? new Date()).getTime(); }

async function loadReference(root, reference, expectedType, now, expectedFiles) {
  if (reference.type !== expectedType) throw new Error("reference.type");
  const observed = Date.parse(reference.observedAt);
  const until = Date.parse(reference.validUntil);
  if (observed > now || until <= now || until <= observed) throw new Error("reference.time");
  const loaded = await readEvidenceArtifact(root, reference.artifact);
  expectedFiles.add(reference.artifact);
  if (sha(loaded.bytes) !== reference.sha256) throw new Error("reference.hash");
  const value = parseArtifact(JSON.parse(loaded.bytes.toString("utf8")), expectedType);
  if (value.observedAt !== reference.observedAt || value.outcome !== reference.outcome) throw new Error("reference.binding");
  return { bytes: loaded.bytes, value };
}

async function inputEvidenceDigest(input, options, expectedFiles) {
  if (!options.bundleRoot || !options.evidencePath) return sha(JSON.stringify(input));
  const loaded = await readEvidenceArtifact(options.bundleRoot, options.evidencePath);
  expectedFiles.add(options.evidencePath);
  const loadedInput = JSON.parse(loaded.bytes.toString("utf8"));
  if (JSON.stringify(loadedInput) !== JSON.stringify(input)) throw new Error("evidence.binding");
  return sha(loaded.bytes);
}

function preDecisionId(evidenceSha256) {
  return `pre-release-${evidenceSha256.slice(0, 24)}`;
}

export async function evaluatePreReleaseReadiness(input, options = {}) {
  try {
    const evidence = releaseEvidenceSchema.parse(input);
    safeScalarScan(evidence);
    const pending = pendingReasons(evidence);
    if (pending.length) {
      if (evidence.state === "PRE_RELEASE_READY") return blocked(pending);
      if (preReleaseSectionNames.some((name) => evidence[name].status !== "pending")) return invalid("blocked.ready_reference");
      return blocked(pending);
    }
    if (evidence.state !== "PRE_RELEASE_READY") return invalid("evidence.state");
    const root = validateEvidenceBundleRoot(options.bundleRoot);
    const now = currentTime(options);
    const expectedFiles = new Set();
    const evidenceSha256 = await inputEvidenceDigest(evidence, { ...options, bundleRoot: root }, expectedFiles);
    const parsed = {};
    for (const sectionName of preReleaseSectionNames) {
      const section = evidence[sectionName];
      const types = expectedTypes[sectionName];
      if (section.references.length !== types.length) return blocked([`${sectionName}.references`]);
      parsed[sectionName] = [];
      for (let index = 0; index < types.length; index += 1) {
        const loaded = await loadReference(root, section.references[index], types[index], now, expectedFiles);
        if (loaded.value.outcome !== "pass") return blocked([`${sectionName}.outcome`]);
        parsed[sectionName].push(loaded.value);
      }
    }
    const roles = parsed.hostBaselines.map((item) => item.details.role).sort();
    if (JSON.stringify(roles) !== JSON.stringify(["main", "secondary"])) return blocked(["hostBaselines.roles"]);
    const backup = parsed.backupRestore[0];
    if (backup.generatedScope) return blocked(["backupRestore.generated_scope"]);
    if (now - Date.parse(backup.details.collector.collectedAt) > 86_400_000 || Date.parse(backup.details.collector.collectedAt) > now) return blocked(["backupRestore.freshness"]);
    if (options.enforceExactFiles !== false) {
      const actualFiles = await listBundleFiles(root);
      const expected = [...expectedFiles].sort();
      if (JSON.stringify(actualFiles) !== JSON.stringify(expected)) throw new Error("bundle.extra_or_missing");
    }
    return { status: "PRE_RELEASE_READY", exitCode: 0, reasons: [], decisionId: preDecisionId(evidenceSha256), evidenceSha256, expectedFiles: [...expectedFiles].sort() };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "evidence.invalid");
  }
}

function parsePreDecision(value) {
  strictObject(value, ["decisionId", "evidenceSha256", "format", "issuedAt", "state", "validUntil", "version"], "pre-release decision");
  if (value.format !== "blog-x-pre-release-decision" || value.version !== 1 || value.state !== "PRE_RELEASE_READY"
    || !/^pre-release-[a-f0-9]{24}$/.test(value.decisionId) || !checksum(value.evidenceSha256) || !isIso(value.issuedAt) || !isIso(value.validUntil)) throw new Error("predecessor.decision");
  return value;
}

async function loadPredecessor(root, reference, now, expectedFiles) {
  if (reference.type !== "blog-x-release-evidence") throw new Error("reference.type");
  const observed = Date.parse(reference.observedAt);
  const until = Date.parse(reference.validUntil);
  if (observed > now || until <= now || until <= observed) throw new Error("reference.time");
  const loaded = await readEvidenceArtifact(root, reference.artifact);
  expectedFiles.add(reference.artifact);
  if (sha(loaded.bytes) !== reference.sha256) throw new Error("reference.hash");
  const value = releaseEvidenceSchema.parse(JSON.parse(loaded.bytes.toString("utf8")));
  return { bytes: loaded.bytes, value };
}

async function loadPreDecision(root, reference, now, expectedFiles) {
  if (reference.type !== "blog-x-pre-release-decision") throw new Error("reference.type");
  const observed = Date.parse(reference.observedAt);
  const until = Date.parse(reference.validUntil);
  if (observed > now || until <= now || until <= observed) throw new Error("reference.time");
  const loaded = await readEvidenceArtifact(root, reference.artifact);
  expectedFiles.add(reference.artifact);
  if (sha(loaded.bytes) !== reference.sha256) throw new Error("reference.hash");
  const value = parsePreDecision(JSON.parse(loaded.bytes.toString("utf8")));
  return { bytes: loaded.bytes, value };
}

export async function evaluatePostReleaseVerification(input, options = {}) {
  try {
    const evidence = postReleaseEvidenceSchema.parse(input);
    safeScalarScan(evidence);
    if (evidence.predecessor.status === "pending" || evidence.postRelease.status === "pending") {
      return blocked([...(evidence.predecessor.status === "pending" ? evidence.predecessor.unresolved : []), ...(evidence.postRelease.status === "pending" ? evidence.postRelease.unresolved : [])]);
    }
    const root = validateEvidenceBundleRoot(options.bundleRoot);
    const now = currentTime(options);
    const expectedFiles = new Set();
    await inputEvidenceDigest(evidence, { ...options, bundleRoot: root }, expectedFiles);
    const predecessor = await loadPredecessor(root, evidence.predecessor.evidence, now, expectedFiles);
    const pre = await evaluatePreReleaseReadiness(predecessor.value, { bundleRoot: root, evidencePath: evidence.predecessor.evidence.artifact, enforceExactFiles: false, now: options.now });
    if (pre.status === "BLOCKED") return blocked(pre.reasons.map((reason) => `predecessor.${reason}`));
    if (pre.status !== "PRE_RELEASE_READY") return invalid("predecessor.invalid");
    for (const path of pre.expectedFiles) expectedFiles.add(path);
    const decisionLoaded = await loadPreDecision(root, evidence.predecessor.decision, now, expectedFiles);
    const decision = decisionLoaded.value;
    if (Date.parse(decision.issuedAt) > now || Date.parse(decision.validUntil) <= now || Date.parse(decision.issuedAt) >= Date.parse(decision.validUntil)
      || decision.evidenceSha256 !== pre.evidenceSha256 || decision.decisionId !== pre.decisionId) throw new Error("predecessor.binding");
    if (evidence.postRelease.references.length !== 1) return blocked(["postRelease.references"]);
    const post = await loadReference(root, evidence.postRelease.references[0], "blog-x-release-post-release", now, expectedFiles);
    const failedSmoke = post.value.outcome !== "pass" || post.value.details.continueOrRollback !== "continue"
      || Object.values(post.value.details.smoke).some((item) => item !== true);
    if (failedSmoke) return { status: "POST_RELEASE_FAILED", exitCode: 1, reasons: ["postRelease.smoke"], predecessorDecisionId: decision.decisionId };
    const actualFiles = await listBundleFiles(root);
    const expected = [...expectedFiles].sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expected)) throw new Error("bundle.extra_or_missing");
    return { status: "POST_RELEASE_VERIFIED", exitCode: 0, reasons: [], predecessorDecisionId: decision.decisionId };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "evidence.invalid");
  }
}

export async function evaluateReleaseReadiness(input, options = {}) {
  return evaluatePreReleaseReadiness(input, options);
}

export async function validateReleaseEvidence(input, options = {}) {
  let decision;
  if (input?.format === "blog-x-post-release-evidence") decision = await evaluatePostReleaseVerification(input, options);
  else decision = await evaluatePreReleaseReadiness(input, options);
  const expectations = [options.expectBlocked && "BLOCKED", options.expectPreReleaseReady && "PRE_RELEASE_READY", options.expectPostReleaseVerified && "POST_RELEASE_VERIFIED"].filter(Boolean);
  if (expectations.length > 1) return invalid("expectation.multiple");
  if (options.expectBlocked && options.canonical !== true) return invalid("expect_blocked.canonical_required");
  if (expectations.length && decision.status !== expectations[0]) return invalid("expectation.failed");
  if (expectations.length) return { ...decision, exitCode: 0 };
  return decision;
}

export function formatReleaseDecision(decision) {
  const prefix = `RELEASE ${decision.status}`;
  return decision.reasons?.length ? `${prefix} ${[...decision.reasons].sort().join(",")}` : prefix;
}
