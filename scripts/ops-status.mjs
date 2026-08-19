import { spawn } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultComposeFile = resolve(repositoryRoot, "compose.yaml");
const requiredServices = ["postgres", "api", "web"];

export function validateLocalProject(value) {
  if (value !== "blogxlocal" && !/^blogxverify_[a-z0-9]{8,32}$/.test(value ?? "")) {
    throw new Error("status project must be blogxlocal or an exact generated verification project");
  }
  return value;
}

export function validateStatusOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("status Web origin must be an absolute loopback HTTP origin"); }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.username || parsed.password
    || parsed.pathname !== "/" || parsed.search || parsed.hash || !parsed.port) {
    throw new Error("status Web origin must be an absolute loopback HTTP origin");
  }
  return parsed.origin;
}

function parseJsonRows(value) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
}

function command(name, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(name, args, { cwd: options.cwd ?? repositoryRoot, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) accept({ stdout, stderr });
      else reject(new Error(`${name} status command failed`));
    });
  });
}

function bytes(value) {
  const match = /^([\d.]+)\s*([KMGT]?i?B)$/i.exec(String(value).trim());
  if (!match) return 0;
  const powers = { B: 0, KB: 1, KIB: 1, MB: 2, MIB: 2, GB: 3, GIB: 3, TB: 4, TIB: 4 };
  return Math.round(Number(match[1]) * 1024 ** (powers[match[2].toUpperCase()] ?? 0));
}

function strictTlsEvidence(value, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "format,observedAt,status,validUntil,version"
    || value.format !== "blog-x-tls-evidence" || value.version !== 1 || value.status !== "pass") {
    return { status: "FAIL", detail: "authorized TLS evidence is malformed" };
  }
  const observedAt = Date.parse(value.observedAt);
  const validUntil = Date.parse(value.validUntil);
  if (!Number.isFinite(observedAt) || !Number.isFinite(validUntil) || observedAt > now.getTime()
    || now.getTime() - observedAt > 24 * 60 * 60 * 1000 || validUntil <= now.getTime()) {
    return { status: "FAIL", detail: "authorized TLS evidence is stale" };
  }
  return { status: "PASS", detail: "authorized evidence is current" };
}

export function validateEffectiveCompose(config) {
  if (!config || typeof config !== "object" || !config.services) return false;
  for (const name of requiredServices) {
    const service = config.services[name];
    if (!service || service.init !== true || service.restart !== "unless-stopped" || service.pull_policy !== "never" || !service.healthcheck) return false;
    if (service.logging?.driver !== "local" || String(service.logging?.options?.["max-size"]) !== "10m" || String(service.logging?.options?.["max-file"]) !== "3") return false;
    if ((name === "api" || name === "web") && service.build?.network !== "none") return false;
  }
  if ((config.services.api.ports?.length ?? 0) !== 0 || (config.services.postgres.ports?.length ?? 0) !== 0) return false;
  const webPorts = config.services.web.ports ?? [];
  return webPorts.length === 1 && String(webPorts[0].host_ip ?? webPorts[0].host_ip) === "127.0.0.1";
}

export async function collectLocalStatus(options, dependencies = {}) {
  const project = validateLocalProject(options.project);
  const webOrigin = validateStatusOrigin(options.webOrigin);
  const composeFile = resolve(options.composeFile ?? defaultComposeFile);
  if (composeFile !== defaultComposeFile) throw new Error("status Compose file must be the repository canonical file");
  const run = dependencies.run ?? command;
  const request = dependencies.fetch ?? globalThis.fetch;
  const host = dependencies.host ?? { loadavg, cpus, freemem, totalmem };
  const fsStatus = dependencies.statfs ?? statfs;
  const read = dependencies.readFile ?? readFile;
  const now = (dependencies.now ?? (() => new Date()))();
  const composeArgs = ["-p", project, "-f", composeFile];

  const configResult = await run("docker-compose", [...composeArgs, "config", "--format", "json"]);
  const psResult = await run("docker-compose", [...composeArgs, "ps", "--format", "json"]);
  const rows = parseJsonRows(psResult.stdout);
  const ids = rows.map((row) => row.ID ?? row.Id ?? row.id).filter(Boolean);
  const inspectResult = ids.length
    ? await run("docker", ["inspect", "--format", "{{.Id}}|{{.Name}}|{{.RestartCount}}", ...ids])
    : { stdout: "" };
  const restartById = new Map();
  const restartByName = new Map();
  for (const line of String(inspectResult.stdout).trim().split(/\r?\n/).filter(Boolean)) {
    const parts = line.split("|");
    if (parts.length >= 3) { restartById.set(parts[0], Number(parts[2])); restartByName.set(parts[1].replace(/^\//, ""), Number(parts[2])); }
    else if (parts.length === 2) restartByName.set(parts[0].replace(/^\//, ""), Number(parts[1]));
  }
  const services = rows.map((row) => ({
    service: row.Service ?? row.service ?? "unknown",
    health: String(row.Health ?? row.health ?? row.State ?? row.state ?? "unknown").toLowerCase(),
    restartCount: restartById.get(row.ID ?? row.Id ?? row.id) ?? restartByName.get(row.Name ?? row.name) ?? 0,
  }));

  let webHealth;
  try {
    const response = await request(`${webOrigin}/api/health`);
    webHealth = { ok: response.ok, status: response.status };
  } catch { webHealth = { ok: false, status: 0 }; }

  const statsResult = await run("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...ids]);
  const stats = parseJsonRows(statsResult.stdout);
  const volumeResult = await run("docker", ["system", "df", "--format", "{{json .}}"]);
  const volumeRows = parseJsonRows(volumeResult.stdout).filter((row) => String(row.Type ?? "").toLowerCase().includes("volume"));
  const filesystem = await fsStatus(repositoryRoot);
  const blockSize = Number(filesystem.bsize ?? 0);
  const tls = options.tlsEvidencePath
    ? strictTlsEvidence(JSON.parse(await read(options.tlsEvidencePath, "utf8")), now)
    : { status: "NOT_EVALUATED", detail: "authorized evidence absent" };

  return {
    composeConfig: JSON.parse(configResult.stdout),
    services,
    webHealth,
    cpu: { load1: Number(host.loadavg()[0]), cores: host.cpus().length },
    memory: { availableBytes: Number(host.freemem()), totalBytes: Number(host.totalmem()) },
    filesystem: {
      availableBytes: Number(filesystem.bavail) * blockSize,
      totalBytes: Number(filesystem.blocks) * blockSize,
      availableInodes: Number(filesystem.ffree),
      totalInodes: Number(filesystem.files),
    },
    containers: {
      known: stats.length > 0,
      count: stats.length,
      maximumCpuPercent: Math.max(0, ...stats.map((row) => Number.parseFloat(row.CPUPerc) || 0)),
      maximumMemoryBytes: Math.max(0, ...stats.map((row) => bytes(String(row.MemUsage ?? "").split("/")[0] ?? "0B"))),
    },
    volumes: {
      known: volumeRows.length > 0,
      count: volumeRows.reduce((sum, row) => sum + (Number.parseInt(row.TotalCount, 10) || 0), 0),
      bytes: volumeRows.reduce((sum, row) => sum + bytes(row.Size ?? "0B"), 0),
    },
    tls,
  };
}

function check(id, ok, passDetail, failDetail = "required evidence unavailable") {
  return { id, status: ok ? "PASS" : "FAIL", detail: ok ? passDetail : failDetail };
}

export function evaluateStatus(facts) {
  const services = Array.isArray(facts?.services) ? facts.services : [];
  const serviceNames = new Set(services.filter((item) => item.health === "healthy" && Number.isInteger(item.restartCount) && item.restartCount >= 0).map((item) => item.service));
  const checks = [
    check("services", requiredServices.every((name) => serviceNames.has(name)), `${serviceNames.size}/3 healthy`),
    check("restarts", services.length === 3 && services.every((item) => Number.isInteger(item.restartCount) && item.restartCount >= 0), `total ${services.reduce((sum, item) => sum + item.restartCount, 0)}`),
    check("web-api", facts?.webHealth?.ok === true && facts?.webHealth?.status === 200, "same-origin health 200"),
    check("cpu", Number.isFinite(facts?.cpu?.load1) && Number.isInteger(facts?.cpu?.cores) && facts.cpu.cores > 0, facts?.cpu ? `load ${facts.cpu.load1.toFixed(2)} / ${facts.cpu.cores} cores` : ""),
    check("memory", Number.isFinite(facts?.memory?.availableBytes) && facts.memory.availableBytes >= 0 && facts.memory.totalBytes > 0, facts?.memory ? `${facts.memory.availableBytes} available` : ""),
    check("disk-inodes", Number.isFinite(facts?.filesystem?.availableBytes) && facts.filesystem.availableBytes >= 0 && facts.filesystem.totalBytes > 0 && Number.isFinite(facts.filesystem.availableInodes) && facts.filesystem.totalInodes > 0, facts?.filesystem ? `${facts.filesystem.availableBytes} bytes and ${facts.filesystem.availableInodes} inodes available` : ""),
    check("containers", facts?.containers?.known === true && facts.containers.count >= 3, facts?.containers ? `${facts.containers.count} measured` : ""),
    check("volumes", facts?.volumes?.known === true && facts.volumes.count >= 2, facts?.volumes ? `${facts.volumes.count} known` : ""),
    check("log-policy", validateEffectiveCompose(facts?.composeConfig), "local driver 10m x 3"),
    facts?.tls?.status === "PASS" ? { id: "tls", status: "PASS", detail: "authorized evidence is current" }
      : facts?.tls?.status === "NOT_EVALUATED" ? { id: "tls", status: "NOT_EVALUATED", detail: "authorized evidence absent" }
        : { id: "tls", status: "FAIL", detail: "authorized evidence is malformed or stale" },
  ];
  return { ok: checks.every((item) => item.status !== "FAIL"), checks };
}

function redact(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(blog_x_session=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:password|token|secret)\s*[=:]\s*[^\s]+/gi, "[REDACTED]")
    .replace(/https?:\/\/[^\s]+/gi, "[REDACTED_ORIGIN]");
}

export function formatStatus(result) {
  const lines = [`BLOG X STATUS ${result.ok ? "PASS" : "FAIL"}`];
  for (const item of result.checks) lines.push(`${item.id.toUpperCase()} ${item.status} ${redact(item.detail)}`);
  return `${lines.join("\n")}\n`;
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const facts = await collectLocalStatus({ project: argument("project"), webOrigin: argument("web-origin"), tlsEvidencePath: argument("tls-evidence") });
  const result = evaluateStatus(facts);
  process.stdout.write(formatStatus(result));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`BLOG X STATUS FAIL\n${redact(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  });
}
