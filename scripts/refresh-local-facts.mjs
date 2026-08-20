import { createHash } from "node:crypto";

export const REFRESH_AUTHORITY = Object.freeze({
  project: "blogxlocal",
  origin: "http://127.0.0.1:3100",
  containers: Object.freeze({
    postgres: "blogxlocal-postgres-1",
    api: "blogxlocal-api-1",
    web: "blogxlocal-web-1",
  }),
  volumes: Object.freeze(["blogxlocal_media-data", "blogxlocal_postgres-data"]),
  services: Object.freeze(["api", "postgres", "web"]),
});

const FACT_KEYS = ["business", "composeAuthority", "containers", "database", "git", "ledger", "media", "portOwnerExact", "protected", "reading", "releaseState", "routes", "seeds", "sequences", "targets", "volumes"];
const BASE_FACT_KEYS = ["business", "containers", "database", "git", "ledger", "media", "portOwnerExact", "protected", "reading", "releaseState", "routes", "seeds", "sequences", "targets", "volumes"];
const PROJECTION_KEYS = ["business", "containers", "database", "git", "ledger", "media", "protected", "reading", "releaseState", "routes", "seeds", "sequences", "targets", "topology", "volumes"];
const ROUTE_KEYS = ["/", "/api/health", "/api/public/articles/phase6-unknown/related", "/api/public/search?q=", "/archives", "/categories", "/search", "/tags"];
const SELECTED_LABELS = [
  "com.docker.compose.oneoff",
  "com.docker.compose.project",
  "com.docker.compose.service",
  "io.blog-x.application",
  "io.blog-x.lockfile-sha256",
  "io.blog-x.public-origin",
  "io.blog-x.refresh-kind",
  "io.blog-x.seed-image-id",
  "org.opencontainers.image.revision",
];

function fail(message) { throw new Error(`local refresh facts: ${message}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function isPlain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) && !isPlain(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}
function exactKeys(value, keys, label, { optional = [] } = {}) {
  if (!isPlain(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const allowed = [...keys, ...optional].sort();
  if (actual.some((key) => !allowed.includes(key)) || keys.some((key) => !actual.includes(key))) fail(`${label} has an unexpected or missing key`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isPlain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function same(a, b) { return canonical(a) === canonical(b); }
function copy(value) { return structuredClone(value); }
function validBranchRef(value) { return typeof value === "string" && /^refs\/heads\/[^\s\x00-\x1f]+$/.test(value); }
function assertDigestFact(value, label, extra = []) {
  exactKeys(value, ["count", "sha256", ...extra], label);
  if (!Number.isSafeInteger(value.count) || value.count < 0 || !/^[a-f0-9]{64}$/.test(value.sha256)) fail(`${label} digest/count is invalid`);
}
function normalizeLabels(labels = {}) {
  return Object.fromEntries(SELECTED_LABELS.filter((key) => Object.hasOwn(labels, key)).map((key) => [key, labels[key]]));
}
function containerByService(facts, service) {
  return facts.containers.find((item) => item.Config?.Labels?.["com.docker.compose.service"] === service);
}
function assertPorts(service, actual) {
  const expected = service === "api"
    ? { "3001/tcp": null }
    : service === "postgres"
      ? { "5432/tcp": null }
      : { "3100/tcp": [{ HostIp: "127.0.0.1", HostPort: "3100" }] };
  if (!same(actual, expected)) fail(`${service} port authority is not exact`);
}

function parseDockerPsRecords(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) fail("published-port owner output is empty");
  const lines = stdout.trim().split("\n");
  if (lines.some((line) => !line.trim())) fail("published-port owner output contains a blank record");
  return lines.map((line) => {
    try {
      const record = JSON.parse(line);
      if (!isPlain(record)) fail("published-port owner record is not JSON object");
      return record;
    } catch (error) {
      if (/published-port owner/.test(error?.message ?? "")) throw error;
      fail("published-port owner record is invalid JSON");
    }
  });
}

function parseDockerLabels(value) {
  if (typeof value !== "string") fail("published-port owner labels are invalid");
  const entries = value.split(",");
  if (entries.some((entry) => !entry || !entry.includes("="))) fail("published-port owner labels are invalid");
  const labels = Object.fromEntries(entries.map((entry) => {
    const index = entry.indexOf("=");
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
  if (Object.keys(labels).length !== entries.length) fail("published-port owner labels contain duplicates");
  return labels;
}

/** Proves that the sole host listener selected by Docker is the inspected canonical Web container. */
export function assertCanonicalPortOwner(stdout, containers) {
  const records = parseDockerPsRecords(stdout);
  if (!Array.isArray(containers) || records.length !== 1) fail("published port 3100 must have exactly one owner");
  const web = containers.find((item) => item?.Config?.Labels?.["com.docker.compose.service"] === "web");
  const record = records[0];
  if (!web || typeof record.ID !== "string" || !/^[a-f0-9]{12,64}$/.test(record.ID) || typeof record.Names !== "string") fail("published-port owner identity is invalid");
  const labels = parseDockerLabels(record.Labels);
  if (!String(web.Id).startsWith(record.ID) || record.Names !== REFRESH_AUTHORITY.containers.web || labels["com.docker.compose.project"] !== REFRESH_AUTHORITY.project || labels["com.docker.compose.service"] !== "web") fail("published port 3100 owner is not the canonical Web container");
  return true;
}

export function assertRouteObservations(routes) {
  exactKeys(routes, ROUTE_KEYS, "route facts");
  for (const path of ROUTE_KEYS) {
    exactKeys(routes[path], ["bodySha256", "status"], `route ${path}`, { optional: ["body"] });
    const { bodySha256, status } = routes[path];
    if (!Number.isSafeInteger(status) || status < 100 || status > 599 || status >= 300 && status < 400 || !/^[a-f0-9]{64}$/.test(bodySha256)) fail(`route ${path} observation is invalid`);
    if (Object.hasOwn(routes[path], "body") && !isJsonValue(routes[path].body)) fail(`route ${path} JSON observation is invalid`);
  }
  return true;
}

export function assertRouteFacts(routes) {
  assertRouteObservations(routes);
  for (const path of ["/", "/categories", "/tags", "/archives", "/search"]) {
    exactKeys(routes[path], ["bodySha256", "status"], `route ${path}`);
    if (routes[path].status !== 200 || !/^[a-f0-9]{64}$/.test(routes[path].bodySha256)) fail(`route ${path} contract is invalid`);
  }
  const contracts = {
    "/api/health": { status: 200, body: { ok: true } },
    "/api/public/search?q=": { status: 200, body: { state: "empty_query", query: "", page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] } },
    "/api/public/articles/phase6-unknown/related": { status: 404, body: { error: "not_found" } },
  };
  for (const [path, expected] of Object.entries(contracts)) {
    exactKeys(routes[path], ["body", "bodySha256", "status"], `route ${path}`);
    if (routes[path].status !== expected.status || !same(routes[path].body, expected.body) || !/^[a-f0-9]{64}$/.test(routes[path].bodySha256)) fail(`route ${path} contract is not exact`);
  }
  return true;
}

export function assertReadingFact(reading) {
  const keys = ["state", "listStatus", "listBodySha256", "detailStatus", "detailBodySha256", "slugSha256"];
  exactKeys(reading, keys, "reading fact");
  if (!["verified", "empty_public_set"].includes(reading.state) || reading.listStatus !== 200 || !/^[a-f0-9]{64}$/.test(reading.listBodySha256)) fail("reading list fact is invalid");
  if (reading.state === "verified") {
    if (reading.detailStatus !== 200 || !/^[a-f0-9]{64}$/.test(reading.detailBodySha256) || !/^[a-f0-9]{64}$/.test(reading.slugSha256)) fail("verified reading fact is invalid");
  } else if (reading.detailStatus !== null || reading.detailBodySha256 !== null || reading.slugSha256 !== null) fail("empty reading fact is invalid");
  return true;
}

export function assertFixedRuntimeAuthority(facts) {
  if (!isPlain(facts) || !Array.isArray(facts.containers) || facts.containers.length !== 3) fail("fixed container authority must contain exactly three containers");
  for (const service of REFRESH_AUTHORITY.services) {
    const item = containerByService(facts, service);
    const labels = item?.Config?.Labels ?? {};
    if (!item || item.Name !== `/${REFRESH_AUTHORITY.containers[service]}` || item.State?.Health?.Status !== "healthy") fail(`${service} container authority is invalid`);
    if (labels["com.docker.compose.project"] !== REFRESH_AUTHORITY.project || labels["com.docker.compose.service"] !== service || labels["com.docker.compose.oneoff"] !== "False") fail(`${service} Compose authority is invalid`);
    assertPorts(service, item.NetworkSettings?.Ports);
  }
  if (facts.composeAuthority !== undefined) {
    exactKeys(facts.composeAuthority, ["ps", "services"], "Compose authority");
    for (const key of ["services", "ps"]) {
      if (!Array.isArray(facts.composeAuthority[key]) || !same([...facts.composeAuthority[key]].sort(), REFRESH_AUTHORITY.services)) fail(`Compose ${key} authority is invalid`);
    }
  }
  if (!Array.isArray(facts.volumes) || facts.volumes.length !== 2 || !same(facts.volumes.map((item) => item.Name).sort(), REFRESH_AUTHORITY.volumes)) fail("fixed volume authority is invalid");
  for (const volume of facts.volumes) {
    if (volume.Driver !== "local" || volume.Scope !== "local" || volume.Labels?.["com.docker.compose.project"] !== REFRESH_AUTHORITY.project) fail("fixed volume Compose authority is invalid");
  }
  return true;
}

function ledgerStable(rows) {
  if (!Array.isArray(rows)) fail("ledger must be rows");
  return rows.map((row) => {
    exactKeys(row, ["applied_at", "migration_count", "migration_fingerprint", "scope"], "ledger row");
    if (typeof row.scope !== "string" || !Number.isSafeInteger(row.migration_count) || typeof row.migration_fingerprint !== "string" || Number.isNaN(Date.parse(row.applied_at))) fail("ledger row is invalid");
    return { scope: row.scope, migration_count: row.migration_count, migration_fingerprint: row.migration_fingerprint };
  });
}
function normalizedLedgerRows(rows) {
  const seen = new Set();
  return Object.fromEntries([...rows].sort((a, b) => a.scope.localeCompare(b.scope)).map((row) => {
    if (seen.has(row.scope)) fail("ledger contains a duplicate scope");
    seen.add(row.scope);
    const appliedAt = new Date(row.applied_at).toISOString();
    const stableSha256 = sha256(canonical({ scope: row.scope, migrationCount: row.migration_count, migrationFingerprint: row.migration_fingerprint }));
    return [row.scope, { appliedAt, stableSha256 }];
  }));
}
function assertPersistenceFacts(facts) {
  assertDigestFact(facts.business, "business");
  assertDigestFact(facts.sequences, "sequences");
  assertDigestFact(facts.media, "media", ["bytes"]);
  assertDigestFact(facts.protected, "protected");
  ledgerStable(facts.ledger);
  exactKeys(facts.git, ["clean", "implementationRevision", "lockfileSha256", "ref"], "Git facts");
  if (facts.git.clean !== true || !/^[a-f0-9]{40}$/.test(facts.git.implementationRevision) || !/^[a-f0-9]{64}$/.test(facts.git.lockfileSha256) || !validBranchRef(facts.git.ref)) fail("Git facts are invalid");
  exactKeys(facts.database, ["name", "schemaRows", "schemaSha256", "systemIdentifier"], "database facts");
  if (facts.database.name !== "blog_x" || typeof facts.database.systemIdentifier !== "string" || !facts.database.systemIdentifier || !Number.isSafeInteger(facts.database.schemaRows) || facts.database.schemaRows < 1 || !/^[a-f0-9]{64}$/.test(facts.database.schemaSha256)) fail("database facts are invalid");
  exactKeys(facts.seeds, ["api", "web"], "seed facts"); exactKeys(facts.targets, ["api", "web"], "target facts");
  assertReadingFact(facts.reading);
  if (facts.portOwnerExact !== true) fail("published-port ownership is not exact");
}
function persistenceEqual(before, after) {
  for (const key of ["business", "database", "git", "media", "protected", "reading", "seeds", "sequences", "targets", "volumes"]) if (!same(before[key], after[key])) fail(`${key} persistence changed`);
  const beforePg = containerByService(before, "postgres");
  const afterPg = containerByService(after, "postgres");
  if (beforePg?.Id !== afterPg?.Id || beforePg?.Image !== afterPg?.Image) fail("PostgreSQL identity changed");
}
function assertImages(facts, ids, label) {
  for (const service of ["api", "web"]) if (containerByService(facts, service)?.Image !== ids[service]) fail(`${label} ${service} immutable image ID mismatch`);
}

export function assertPersistenceTransition(before, after, { stage, targetImageIds, oldImageIds, preflightRoutes } = {}) {
  assertFixedRuntimeAuthority(before);
  assertFixedRuntimeAuthority(after);
  assertPersistenceFacts(before);
  assertPersistenceFacts(after);
  assertRouteObservations(before.routes);
  assertRouteObservations(after.routes);
  persistenceEqual(before, after);
  const stableBefore = ledgerStable(before.ledger);
  const stableAfter = ledgerStable(after.ledger);
  if (!same(stableBefore, stableAfter)) fail("ledger stable tuples changed");
  const timestampsBefore = Object.fromEntries(Object.entries(normalizedLedgerRows(before.ledger)).map(([scope, row]) => [scope, row.appliedAt]));
  const timestampsAfter = Object.fromEntries(Object.entries(normalizedLedgerRows(after.ledger)).map(([scope, row]) => [scope, row.appliedAt]));
  if (!same(Object.keys(timestampsBefore).sort(), Object.keys(timestampsAfter).sort())) fail("ledger row count changed");
  if (stage === "postMigration") {
    if (!(Date.parse(timestampsAfter.phase1) > Date.parse(timestampsBefore.phase1))) fail("phase1 applied_at must advance strictly");
    for (const scope of Object.keys(timestampsBefore).filter((value) => value !== "phase1")) if (timestampsAfter[scope] !== timestampsBefore[scope]) fail("non-phase1 ledger timestamp changed");
    for (const service of ["api", "web"]) if (containerByService(before, service)?.Image !== containerByService(after, service)?.Image) fail("runtime image changed before cutover");
    for (const service of REFRESH_AUTHORITY.services) {
      const left = containerByService(before, service); const right = containerByService(after, service);
      if (left.Id !== right.Id || !same(left.NetworkSettings?.Ports, right.NetworkSettings?.Ports) || !same(left.Config?.Labels, right.Config?.Labels)) fail("fixed runtime authority changed before cutover");
    }
    if (!same(before.routes, after.routes)) fail("pre-cutover route observations changed");
  } else if (stage === "postCutover") {
    if (!same(timestampsBefore, timestampsAfter)) fail("ledger timestamps changed after migration");
    if (!targetImageIds) fail("target image IDs are required");
    assertImages(after, targetImageIds, "cutover");
    assertRouteFacts(after.routes);
  } else if (stage === "rollback") {
    if (!same(timestampsBefore, timestampsAfter)) fail("ledger timestamps changed during rollback");
    if (!oldImageIds) fail("old image IDs are required");
    assertImages(after, oldImageIds, "rollback");
    if (!preflightRoutes) fail("rollback requires an explicit preflight route baseline");
    assertRouteObservations(preflightRoutes);
    if (!same(after.routes, preflightRoutes)) fail("rollback routes did not return to preflight observations");
  } else fail("unknown persistence transition stage");
  return true;
}

function digestProjection(value, label, extras = []) {
  assertDigestFact(value, label, extras);
  return Object.fromEntries(["count", ...extras, "sha256"].map((key) => [key, value[key]]));
}
function routeProjection(routes, routeContract) {
  if (routeContract === "final") assertRouteFacts(routes);
  else if (routeContract === "observed") assertRouteObservations(routes);
  else fail("route projection mode is invalid");
  return Object.fromEntries(ROUTE_KEYS.map((path) => [path, {
    status: routes[path].status,
    bodySha256: routes[path].bodySha256,
    ...(path.startsWith("/api/") ? { contractSha256: Object.hasOwn(routes[path], "body") ? sha256(canonical(routes[path].body)) : null } : {}),
  }]));
}

export function projectSanitizedFacts(facts, { routeContract = "final" } = {}) {
  exactKeys(facts, BASE_FACT_KEYS, "collected facts", { optional: ["composeAuthority"] });
  assertFixedRuntimeAuthority(facts);
  assertPersistenceFacts(facts);
  if (routeContract === "final") assertRouteFacts(facts.routes);
  else if (routeContract === "observed") assertRouteObservations(facts.routes);
  else fail("route projection mode is invalid");
  if (facts.releaseState !== "BLOCKED") fail("release state must remain BLOCKED");
  const containers = Object.fromEntries(REFRESH_AUTHORITY.services.map((service) => {
    const item = containerByService(facts, service);
    return [service, { id: item.Id, imageId: item.Image, labels: normalizeLabels(item.Config?.Labels), healthy: item.State?.Health?.Status === "healthy" }];
  }));
  const rows = normalizedLedgerRows(facts.ledger);
  const projection = {
    business: digestProjection(facts.business, "business"),
    containers,
    database: copy(facts.database),
    git: copy(facts.git),
    ledger: { count: facts.ledger.length, rows, stableSha256: sha256(canonical(Object.fromEntries(Object.entries(rows).map(([scope, row]) => [scope, row.stableSha256])))), timestampSha256: sha256(canonical(Object.fromEntries(Object.entries(rows).map(([scope, row]) => [scope, row.appliedAt])))) },
    media: digestProjection(facts.media, "media", ["bytes"]),
    protected: digestProjection(facts.protected, "protected"),
    reading: copy(facts.reading),
    releaseState: "BLOCKED",
    routes: routeProjection(facts.routes, routeContract),
    sequences: digestProjection(facts.sequences, "sequences"),
    seeds: copy(facts.seeds),
    targets: copy(facts.targets),
    topology: { project: REFRESH_AUTHORITY.project, servicesExact: true, fixedPortsExact: true, portOwnerExact: true, containersHealthy: true },
    volumes: { count: facts.volumes.length, sha256: sha256(canonical(facts.volumes)) },
  };
  exactKeys(projection, PROJECTION_KEYS, "sanitized projection");
  return projection;
}

function normalizeVolumes(volumes) {
  return copy(volumes).map(({ Name, Driver, Mountpoint, CreatedAt, Scope, Labels, Options }) => ({ Name, Driver, Mountpoint, CreatedAt, Scope, Labels: Labels ?? {}, Options: Options ?? null })).sort((a, b) => a.Name.localeCompare(b.Name));
}

export async function collectRefreshFacts({ sources } = {}) {
  const required = ["composeAuthority", "containers", "portOwner", "volumes", "business", "sequences", "ledger", "media", "protected", "routes", "reading", "releaseState", "git", "database", "seeds", "targets"];
  if (!isPlain(sources) || required.some((key) => typeof sources[key] !== "function")) fail("collector requires every read-only source adapter");
  const facts = {
    composeAuthority: await sources.composeAuthority(),
    containers: copy(await sources.containers()),
    volumes: normalizeVolumes(await sources.volumes()),
    business: copy(await sources.business()),
    sequences: copy(await sources.sequences()),
    ledger: copy(await sources.ledger()),
    media: copy(await sources.media()),
    protected: copy(await sources.protected()),
    routes: copy(await sources.routes()),
    reading: copy(await sources.reading()),
    releaseState: await sources.releaseState(),
  };
  facts.portOwnerExact = await sources.portOwner(facts.containers);
  for (const key of ["git", "database", "seeds", "targets"]) facts[key] = copy(await sources[key]());
  assertFixedRuntimeAuthority(facts);
  assertPersistenceFacts(facts);
  assertRouteObservations(facts.routes);
  if (facts.releaseState !== "BLOCKED") fail("release gate did not remain BLOCKED");
  return facts;
}

export function factsEqual(left, right) { return same(left, right); }
export function factsSha256(value) { return sha256(canonical(value)); }
