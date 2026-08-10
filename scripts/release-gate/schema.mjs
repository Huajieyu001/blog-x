const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z][a-z0-9-]{2,63}$/;
const artifactPattern = /^(?:[a-z0-9][a-z0-9.-]*\/)*[a-z0-9][a-z0-9.-]*\.json$/;
const typePattern = /^blog-x-(?:release|pre-release)-[a-z-]+$/;

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
    if (!Array.isArray(value.references) || !value.references.length) throw new Error(`${label} references are invalid`);
    value.references.forEach((reference) => evidenceReferenceSchema.parse(reference));
    return value;
  }
  throw new Error(`${label} section status is invalid`);
}

function parsePendingOrBound(value, label) {
  if (value?.status === "pending") {
    strictObject(value, ["status", "unresolved"], `${label} predecessor`);
    if (!Array.isArray(value.unresolved) || !value.unresolved.length
      || value.unresolved.some((item) => typeof item !== "string" || !/^[a-z][a-z0-9_.-]+$/.test(item))) throw new Error(`${label} unresolved reasons are invalid`);
    return value;
  }
  if (value?.status === "bound") {
    strictObject(value, ["decision", "evidence", "status"], `${label} predecessor`);
    evidenceReferenceSchema.parse(value.evidence);
    evidenceReferenceSchema.parse(value.decision);
    if (value.evidence.type !== "blog-x-release-evidence" || value.decision.type !== "blog-x-pre-release-decision") throw new Error(`${label} predecessor types are invalid`);
    return value;
  }
  throw new Error(`${label} predecessor status is invalid`);
}

export const preReleaseSectionNames = Object.freeze(["authorization", "hostBaselines", "networkBoundary", "backupRestore", "operations", "rollback"]);

function parsePreRelease(value, states) {
  strictObject(value, ["format", "version", "state", ...preReleaseSectionNames], "pre-release evidence");
  if (value.format !== "blog-x-release-evidence" || value.version !== 2 || !states.includes(value.state)) throw new Error("pre-release evidence format is unsupported");
  for (const name of preReleaseSectionNames) parseSection(value[name], name);
  return value;
}

export const releaseEvidenceSchema = {
  parse(value) {
    return parsePreRelease(value, ["BLOCKED", "PRE_RELEASE_READY"]);
  },
};

export const preReleaseEvidenceSchema = {
  parse(value) {
    return parsePreRelease(value, ["PRE_RELEASE_READY"]);
  },
};

export const postReleaseEvidenceSchema = {
  parse(value) {
    strictObject(value, ["format", "postRelease", "predecessor", "state", "version"], "post-release evidence");
    if (value.format !== "blog-x-post-release-evidence" || value.version !== 2 || !["POST_RELEASE_VERIFIED", "POST_RELEASE_FAILED"].includes(value.state)) throw new Error("post-release evidence format is unsupported");
    parsePendingOrBound(value.predecessor, "post-release");
    parseSection(value.postRelease, "post-release");
    return value;
  },
};

export const releaseSectionNames = preReleaseSectionNames;
