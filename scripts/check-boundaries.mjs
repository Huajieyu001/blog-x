import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { hashPhase5Receipt, verifyPhase5Receipt } from "./phase5-receipt.mjs";

const execFileAsync = promisify(execFile);
const serverAddresses = [
  [47, 99, 80, 8].join("."),
  [124, 222, 91, 230].join("."),
];
const frozenAddress = serverAddresses[0];
const legacyAuditSha256 = "9b6191dd45837f5e7f5045ef865460a16f714287b5825e5a1f8cc98af4d9b2d8";
const legacyReceiptSha256 = "9c0aa9943017604ce4b25a25546355890afbbc0a0a8ba5289a7055918df79ee4";

function operationalSurface(path) {
  return path === "README.md"
    || path === "package.json"
    || path === "compose.yaml"
    || path === ".env.example"
    || path === ".dockerignore"
    || path === "ops/production-config.names.json"
    || path === "ops/topology-policy.json"
    || path === "ops/release-evidence.blocked.json"
    || path.startsWith("scripts/")
    || /^apps\/(?:api|web)\/Dockerfile$/.test(path)
    || path.startsWith("apps/web/");
}

function releaseArtifactSurface(path) {
  return path === "ops/release-evidence.blocked.json"
    || path === "ops/phase5-full-gate-receipt.json"
    || ["docs/RELEASE-GATE.md", "docs/ROLLBACK.md", "docs/OPERATIONS.md"].includes(path)
    || path === "scripts/release-gate.mjs"
    || (path.startsWith("scripts/release-gate/") && !path.endsWith(".test.mjs"));
}

function auditFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(content);
  if (!match) return null;
  return Object.fromEntries(match[1].split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf(":");
    return index > 0 ? [[line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

export async function auditMilestoneReceipt(root, content, options = {}) {
  const frontmatter = auditFrontmatter(content);
  if (!frontmatter || frontmatter.status !== "passed") return [];
  const issues = [];
  const expectedPath = "ops/phase5-full-gate-receipt.json";
  if (frontmatter.full_gate_receipt_path !== expectedPath) return [issue("phase5_audit_receipt_missing", ".planning/v1.0-MILESTONE-AUDIT.md", "passed audit requires the fixed Phase 5 receipt path")];
  const receiptPath = options.receiptPath ?? resolve(root, expectedPath);
  let verified;
  try { verified = await verifyPhase5Receipt(receiptPath); } catch { return [issue("phase5_audit_receipt_missing", ".planning/v1.0-MILESTONE-AUDIT.md", "passed audit requires a strict verified Phase 5 receipt")]; }
  const contentSha256 = createHash("sha256").update(content).digest("hex");
  const legacyMigrationPair = contentSha256 === legacyAuditSha256 && verified.sha256 === legacyReceiptSha256;
  const declaredVersion = frontmatter.full_gate_receipt_version;
  if (declaredVersion !== undefined && declaredVersion !== "2") {
    issues.push(issue("phase5_audit_receipt_version", ".planning/v1.0-MILESTONE-AUDIT.md", "a migrated passed audit requires receipt version 2"));
  }
  if (declaredVersion === "2" && (verified.legacy || verified.receipt.version !== 2)) {
    issues.push(issue("phase5_audit_receipt_version", ".planning/v1.0-MILESTONE-AUDIT.md", "a v2 audit cannot cite a legacy receipt"));
  }
  if (frontmatter.full_gate_receipt_sha256 !== verified.sha256 || frontmatter.implementation_revision !== verified.receipt.implementationRevision) {
    issues.push(issue("phase5_audit_receipt_mismatch", ".planning/v1.0-MILESTONE-AUDIT.md", "passed audit receipt digest and implementation revision must match verified bytes"));
  }
  if (!legacyMigrationPair) {
    const section = /(?:^|\n)## Receipt-Bound Full Gate\s*\n([\s\S]*?)(?=\n## |$)/u.exec(content)?.[1] ?? "";
    const revisions = [...section.matchAll(/implementation revision\s+`([a-f0-9]{40})`/giu)].map((match) => match[1]);
    if (frontmatter.audit_body_revision_contract !== "1" || revisions.length !== 1
      || revisions[0] !== frontmatter.implementation_revision || revisions[0] !== verified.receipt.implementationRevision) {
      issues.push(issue("phase5_audit_body_revision", ".planning/v1.0-MILESTONE-AUDIT.md", "passed audit body must cite exactly one receipt-derived implementation revision"));
    }
  }
  if (!isIsoAuditTimestamp(frontmatter.audited) || Date.parse(frontmatter.audited) < Date.parse(verified.receipt.completedAt)) {
    issues.push(issue("phase5_audit_timestamp", ".planning/v1.0-MILESTONE-AUDIT.md", "passed audit must follow receipt completion"));
  }
  const isAncestor = options.isAncestor ?? (async (revision) => {
    try { await execFileAsync("git", ["merge-base", "--is-ancestor", revision, "HEAD"], { cwd: root }); return true; } catch { return false; }
  });
  if (!await isAncestor(verified.receipt.implementationRevision)) issues.push(issue("phase5_audit_revision", ".planning/v1.0-MILESTONE-AUDIT.md", "receipt implementation revision must be an ancestor of audit HEAD"));
  const actualSha256 = await hashPhase5Receipt(receiptPath);
  if (actualSha256 !== verified.sha256) issues.push(issue("phase5_audit_receipt_mismatch", ".planning/v1.0-MILESTONE-AUDIT.md", "receipt bytes changed during audit"));
  return issues;
}

function isIsoAuditTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && /[zZ]|[+-]\d\d:\d\d$/.test(value);
}

function auditReleaseArtifact(path, content, issues) {
  if (/node:child_process|\b(?:execFile|execSync|spawn|spawnSync)\s*\(|\b(?:ssh|scp|rsync|sftp|curl|wget)\s+[^`\n]+/i.test(content)) {
    issues.push(issue("release_remote_capability", path, "release artifacts must not execute remote or deployment commands"));
  }
  if (/\b(?:automatic|auto)[-_ ]?(?:unfreeze|deploy|release|rollback)\b|\bautomatic\s+(?:deploy|unfreeze)\b/i.test(content)) {
    issues.push(issue("automatic_release_action", path, "release artifacts must not automate authorization or deployment"));
  }
  if (/(?:https?:\/\/(?:api|postgres)(?::\d+)?\b)|(?:47\.99\.80\.8|124\.222\.91\.230)/i.test(content)) {
    issues.push(issue("release_internal_authority", path, "release artifacts contain internal or node authority"));
  }
  if (/(?:["'](?:3001|5432):(?:3001|5432)["']|(?:api|postgres)[^\n]{0,40}(?:hostPublished\s*[=:]\s*true|public\s*[=:]\s*true))/i.test(content)) {
    issues.push(issue("release_public_data_plane", path, "release artifacts expose an API or PostgreSQL data plane"));
  }
  if (/\bProduction\s+READY\b|\bTLS\s+verified\b|\b(?:RPO|RTO)\s*(?:=|:)?\s*\d+\s*(?:m|h|d|min|hour|day)s?\b/i.test(content)) {
    issues.push(issue("false_production_claim", path, "release artifacts claim unverified production readiness or objectives"));
  }
  if (path === "ops/release-evidence.blocked.json") {
    try {
      const value = JSON.parse(content);
      if (value.state !== "BLOCKED" || /"artifact"\s*:|"synthetic"\s*:/i.test(content)) {
        issues.push(issue("tracked_release_ready", path, "canonical release evidence must remain locator-free and BLOCKED"));
      }
    } catch {
      issues.push(issue("tracked_release_ready", path, "canonical release evidence must be valid BLOCKED JSON"));
    }
  }
}

function isExactObject(value, keys) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function auditProductionConfig(path, content, issues) {
  try {
    const value = JSON.parse(content);
    const valid = isExactObject(value, ["format", "version", "valueSource", "variables"])
      && value.format === "blog-x-production-config-names"
      && value.version === 1
      && value.valueSource === "untracked-root-or-service-owned-mechanism"
      && Array.isArray(value.variables)
      && value.variables.every((variable) => isExactObject(variable, ["name", "class", "consumers"])
        && /^[A-Z][A-Z0-9_]*$/.test(variable.name)
        && typeof variable.class === "string"
        && Array.isArray(variable.consumers)
        && variable.consumers.every((consumer) => ["server", "migrate", "schema-verify", "seed"].includes(consumer)));
    if (!valid) issues.push(issue("invalid_production_config_contract", path, "production configuration must be name-only metadata"));
  } catch {
    issues.push(issue("invalid_production_config_contract", path, "production configuration must be valid JSON"));
  }
}

function auditTopologyPolicy(path, content, issues) {
  try {
    const value = JSON.parse(content);
    const valid = isExactObject(value, ["format", "version", "browser", "services", "futurePrivateLink"])
      && value.format === "blog-x-topology-policy"
      && value.version === 1
      && isExactObject(value.browser, ["relativeRoutes", "directDataPlane"])
      && value.browser.directDataPlane === false
      && JSON.stringify(value.browser.relativeRoutes) === JSON.stringify(["/api", "/media"])
      && isExactObject(value.services, ["web", "api", "postgres"])
      && isExactObject(value.services.web, ["hostPublished", "bind"])
      && value.services.web.hostPublished === true
      && value.services.web.bind === "edge-only"
      && isExactObject(value.services.api, ["hostPublished"])
      && value.services.api.hostPublished === false
      && isExactObject(value.services.postgres, ["hostPublished"])
      && value.services.postgres.hostPublished === false
      && isExactObject(value.futurePrivateLink, ["required", "status"])
      && value.futurePrivateLink.required === true
      && value.futurePrivateLink.status === "unresolved";
    if (!valid) issues.push(issue("unsafe_topology_policy", path, "topology policy must expose only the Web edge"));
  } catch {
    issues.push(issue("unsafe_topology_policy", path, "topology policy must be valid JSON"));
  }
}

function webRuntimeSurface(path) {
  return path === "apps/web/next.config.ts" || path.startsWith("apps/web/app/");
}

function issue(code, path, message) {
  return { code, path, message };
}

export async function auditFiles(root, files) {
  const issues = [];
  for (const relativePath of files) {
    if (/(^|\/)\.env(?:\.|$)/.test(relativePath) && relativePath !== ".env.example") {
      issues.push(issue("tracked_secret_file", relativePath, "tracked environment files are forbidden"));
    }
    if (/(^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|p12|key))$/i.test(relativePath)) {
      issues.push(issue("tracked_secret_file", relativePath, "tracked private key material is forbidden"));
    }

    let content;
    try { content = await readFile(resolve(root, relativePath), "utf8"); } catch { continue; }

    const credentialUris = [...content.matchAll(/postgres(?:ql)?:\/\/[^\s/]+@/gi)]
      .map((match) => match[0])
      .filter((value) => value.slice(value.indexOf("://") + 3, -1).includes(":") && !value.includes("${"));
    if (/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(content)
      || credentialUris.length > 0) {
      issues.push(issue("tracked_secret_value", relativePath, "credential-like material is tracked"));
    }

    if (relativePath === "ops/production-config.names.json") auditProductionConfig(relativePath, content, issues);
    if (relativePath === "ops/topology-policy.json") auditTopologyPolicy(relativePath, content, issues);
    if (releaseArtifactSurface(relativePath)) auditReleaseArtifact(relativePath, content, issues);

    if (webRuntimeSurface(relativePath)) {
      if (/(?:from\s+["'](?:pg|drizzle-orm|@blog-x\/api)|DATABASE_URL|postgres(?:ql)?:\/\/|apps\/api|src\/db|auth\/sessions|article-service|content\/markdown)/.test(content)) {
        issues.push(issue("web_database_ownership", relativePath, "Web runtime crosses the API/database ownership boundary"));
      }
      if (/(?:from\s+["'](?:node:fs|fs|node:path|path)["']|require\(["'](?:node:fs|fs|node:path|path)["']\))/.test(content)) {
        issues.push(issue("web_filesystem_ownership", relativePath, "Web runtime must not own media filesystem access"));
      }
      if (/(?:from\s+["'](?:sharp|@fastify\/multipart)["']|require\(["'](?:sharp|@fastify\/multipart)["']\))/.test(content)) {
        issues.push(issue("web_media_processor_ownership", relativePath, "Web runtime must not decode or process media"));
      }
      if (/(?:sourceKey|derivativeKey|source_key|derivative_key|MEDIA_ROOT|\/var\/lib\/blog-x\/media)/.test(content)) {
        issues.push(issue("web_media_storage_leak", relativePath, "Web runtime exposes an API-owned media storage key or root"));
      }
      if (/https?:\/\/api:\d+(?:\/|["'])/.test(content)) {
        issues.push(issue("web_internal_origin_disclosure", relativePath, "Web runtime embeds an internal API origin in public-facing code"));
      }
      if (/\bfetch\s*\(\s*["']https?:\/\//.test(content)) {
        issues.push(issue("web_outbound_request", relativePath, "Web runtime contains an outbound browser request"));
      }
      if (/huajieyu001\.top/i.test(content)) {
        issues.push(issue("web_hardcoded_public_origin", relativePath, "Web runtime hardcodes the production public hostname"));
      }
      if (/^apps\/web\/app\/api\/(?:diagnostic|test-only|test-fixture)(?:\/|$)/.test(relativePath)) {
        issues.push(issue("web_public_diagnostic_route", relativePath, "public test-only diagnostic routes are forbidden"));
      }
    }

    if (operationalSurface(relativePath)) {
      if (serverAddresses.some((address) => content.includes(address))) {
        issues.push(issue("browser_server_address", relativePath, "operational/browser-visible content contains a server public address"));
      }
      const commandPattern = new RegExp(`(?:ssh|scp|rsync|sftp|curl|wget)[^\\n]*${frozenAddress.replaceAll(".", "\\.")}`, "i");
      if (commandPattern.test(content)) {
        issues.push(issue("frozen_host_command", relativePath, "a command targets the frozen production host"));
      }
    }
  }
  if (files.includes(".planning/v1.0-MILESTONE-AUDIT.md")) {
    try { issues.push(...await auditMilestoneReceipt(root, await readFile(resolve(root, ".planning/v1.0-MILESTONE-AUDIT.md"), "utf8"))); } catch { issues.push(issue("phase5_audit_receipt_missing", ".planning/v1.0-MILESTONE-AUDIT.md", "passed audit receipt could not be checked")); }
  }
  return issues;
}

export async function trackedFiles(root) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return stdout.split("\0").filter(Boolean);
}

export async function auditRepository(root) {
  return auditFiles(root, await trackedFiles(root));
}

export async function evaluateRepositoryBoundaries(root) {
  const files = await trackedFiles(root);
  const findings = await auditFiles(root, files);
  return { filesChecked: files.length, findings: findings.length, outcome: findings.length === 0 ? "pass" : "fail" };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await evaluateRepositoryBoundaries(root);
  if (result.outcome !== "pass") {
    const issues = await auditRepository(root);
    for (const finding of issues) console.error(`${finding.code}: ${finding.path}: ${finding.message}`);
    console.log(`BLOG X BOUNDARY RESULT ${JSON.stringify(result)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`BLOG X BOUNDARY RESULT ${JSON.stringify(result)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
