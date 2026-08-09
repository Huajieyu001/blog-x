import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const fields = ["collector", "format", "sourceAuthority", "version"];
const collectorFields = ["database", "mediaRoot", "project"];
const generatedSourceBasePattern = /^blog-x-production-source-[A-Za-z0-9_-]{6,64}$/;
const generatedMediaRootPattern = /^blog-x-production-media-[a-z0-9]{8,32}$/;
const pipelineFields = ["alertAuthority", "collector", "destination", "format", "keyAuthority", "resultAuthority", "retention", "sourceAuthority", "version"];

function fail() {
  throw new Error("production backup policy is invalid or incomplete");
}

function strictObject(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function parsedSourceAuthority(value) {
  if (!strictObject(value, ["kind", "sourceBase"]) || (value.kind !== "generated-test" && value.kind !== "service")
    || typeof value.sourceBase !== "string" || !value.sourceBase || value.sourceBase.includes("${") || value.sourceBase.includes("..")) fail();
  const sourceBase = resolve(value.sourceBase);
  if (value.kind === "generated-test") {
    if (dirname(sourceBase) !== resolve(tmpdir()) || !generatedSourceBasePattern.test(basename(sourceBase))) fail();
  } else if (sourceBase === "/" || sourceBase === resolve(process.cwd()) || sourceBase.startsWith(`${resolve(process.cwd())}/`)
    || sourceBase === resolve(tmpdir()) || sourceBase.startsWith(`${resolve(tmpdir())}/`)) {
    fail();
  }
  return { kind: value.kind, sourceBase };
}

export function parseProductionBackupPolicy(value) {
  if (!strictObject(value, fields) || value.format !== "blog-x-production-backup-policy" || value.version !== 1) fail();
  const sourceAuthority = parsedSourceAuthority(value.sourceAuthority);
  if (!strictObject(value.collector, collectorFields)) fail();
  const project = value.collector.project;
  const database = value.collector.database;
  const mediaRoot = typeof value.collector.mediaRoot === "string" ? resolve(value.collector.mediaRoot) : "";
  if (sourceAuthority.kind === "generated-test") {
    if (!/^blogxprodverify_[a-z0-9]{8,32}$/.test(project ?? "")) fail();
    const suffix = project.slice("blogxprodverify_".length);
    if (database !== `blog_x_prod_${suffix}` || dirname(mediaRoot) !== resolve(tmpdir()) || !generatedMediaRootPattern.test(basename(mediaRoot))) fail();
  } else if (project !== "blog-x" || database !== "blog_x" || mediaRoot !== "/var/lib/blog-x/media") {
    fail();
  }
  return {
    format: value.format,
    version: value.version,
    sourceAuthority,
    collector: { project, database, mediaRoot },
  };
}

export function parseProductionPipelinePolicy(value) {
  if (!strictObject(value, pipelineFields) || value.format !== "blog-x-production-pipeline-policy" || value.version !== 1) fail();
  const collectorPolicy = parseProductionBackupPolicy({
    format: "blog-x-production-backup-policy", version: 1, sourceAuthority: value.sourceAuthority, collector: value.collector,
  });
  if (!strictObject(value.destination, ["kind", "mountRoot", "profileId"]) || !strictObject(value.keyAuthority, ["keyPath", "kind"])
    || !strictObject(value.resultAuthority, ["kind", "root"]) || !strictObject(value.alertAuthority, ["kind", "root"])
    || !strictObject(value.retention, ["minimumKnownGood", "policyId"]) || !/^[a-z0-9-]{3,80}$/.test(value.retention.policyId ?? "")
    || !Number.isSafeInteger(value.retention.minimumKnownGood) || value.retention.minimumKnownGood < 1) fail();
  for (const [authority, keys] of [
    [value.destination, ["kind", "mountRoot", "profileId"]], [value.keyAuthority, ["keyPath", "kind"]],
    [value.resultAuthority, ["kind", "root"]], [value.alertAuthority, ["kind", "root"]],
  ]) {
    if ((authority.kind !== "generated-test" && authority.kind !== "service") || Object.keys(authority).sort().join(",") !== [...keys].sort().join(",")) fail();
  }
  return { ...collectorPolicy, destination: { ...value.destination }, keyAuthority: { ...value.keyAuthority }, resultAuthority: { ...value.resultAuthority }, alertAuthority: { ...value.alertAuthority }, retention: { ...value.retention } };
}
