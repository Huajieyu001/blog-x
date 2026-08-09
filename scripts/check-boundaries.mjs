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
    || path.startsWith("scripts/")
    || /^apps\/(?:api|web)\/Dockerfile$/.test(path)
    || path.startsWith("apps/web/");
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
