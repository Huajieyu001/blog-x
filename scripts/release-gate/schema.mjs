const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z][a-z0-9-]{2,63}$/;
const artifactPattern = /^(?:[a-z0-9][a-z0-9.-]*\/)*[a-z0-9][a-z0-9.-]*\.json$/;
const typePattern = /^blog-x-release-[a-z-]+$/;

function strictObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new Error(`${label} is invalid`);
  return value;
}

function iso(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || !/[zZ]|[+-]\d\d:\d\d$/.test(value)) throw new Error(`${label} timestamp is invalid`);
  return value;
}

export const evidenceReferenceSchema = {
  parse(value) {
    strictObject(value, ["artifact", "id", "observedAt", "outcome", "sha256", "type", "validUntil"], "evidence reference");
    if (!idPattern.test(value.id) || !artifactPattern.test(value.artifact) || value.artifact.includes("..")
      || !typePattern.test(value.type) || !hashPattern.test(value.sha256) || !["pass", "fail"].includes(value.outcome)) {
      throw new Error("evidence reference is invalid");
    }
    iso(value.observedAt, "observedAt");
    iso(value.validUntil, "validUntil");
    return value;
  },
};

function parseSection(value, label) {
  if (value?.status === "pending") {
    strictObject(value, ["status", "unresolved"], `${label} section`);
    if (!Array.isArray(value.unresolved) || !value.unresolved.length
      || value.unresolved.some((item) => typeof item !== "string" || !/^[a-z][a-z0-9_.-]+$/.test(item))
      || new Set(value.unresolved).size !== value.unresolved.length) throw new Error(`${label} unresolved reasons are invalid`);
    return value;
  }
  if (value?.status === "ready") {
    strictObject(value, ["references", "status"], `${label} section`);
    if (!Array.isArray(value.references)) throw new Error(`${label} references are invalid`);
    value.references.forEach((reference) => evidenceReferenceSchema.parse(reference));
    return value;
  }
  throw new Error(`${label} section status is invalid`);
}

const sectionNames = ["authorization", "hostBaselines", "networkBoundary", "backupRestore", "operations", "rollback", "postRelease"];

export const releaseEvidenceSchema = {
  parse(value) {
    strictObject(value, ["format", "version", "state", ...sectionNames], "release evidence");
    if (value.format !== "blog-x-release-evidence" || value.version !== 1 || !["BLOCKED", "READY"].includes(value.state)) {
      throw new Error("release evidence format is unsupported");
    }
    for (const name of sectionNames) parseSection(value[name], name);
    return value;
  },
};

export const releaseSectionNames = Object.freeze(sectionNames);
