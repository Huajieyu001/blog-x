import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const serverAddresses = [
  [47, 99, 80, 8].join("."),
  [124, 222, 91, 230].join("."),
];
const frozenAddress = serverAddresses[0];

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
    || ["docs/RELEASE-GATE.md", "docs/ROLLBACK.md", "docs/OPERATIONS.md"].includes(path)
    || path === "scripts/release-gate.mjs"
    || (path.startsWith("scripts/release-gate/") && !path.endsWith(".test.mjs"));
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
  return issues;
}

export async function trackedFiles(root) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return stdout.split("\0").filter(Boolean);
}

export async function auditRepository(root) {
  return auditFiles(root, await trackedFiles(root));
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const issues = await auditRepository(root);
  if (issues.length) {
    for (const finding of issues) console.error(`${finding.code}: ${finding.path}: ${finding.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("Boundary checks passed.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
