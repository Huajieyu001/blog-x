const roles = new Set(["local", "edge", "data"]);

export const defaultStatusPolicy = Object.freeze({
  backupFreshnessHours: 30,
  jobFreshnessHours: 30,
  tlsMinimumDays: 14,
  maximumLoadPerCore: 2,
  minimumFreeMemoryBytes: 256 * 1024 * 1024,
  minimumFreeDiskBytes: 2 * 1024 * 1024 * 1024,
  minimumFreeInodes: 10_000,
  maximumContainerCpuPercent: 95,
  maximumContainerMemoryBytes: 1400 * 1024 * 1024,
  maximumRestartCount: 20,
});

const ranges = {
  backupFreshnessHours: [1, 24 * 31], jobFreshnessHours: [1, 24 * 31], tlsMinimumDays: [1, 366],
  maximumLoadPerCore: [0.1, 32], minimumFreeMemoryBytes: [1, 64 * 1024 ** 3], minimumFreeDiskBytes: [1, 8 * 1024 ** 4],
  minimumFreeInodes: [1, 10 ** 9], maximumContainerCpuPercent: [1, 10_000], maximumContainerMemoryBytes: [1, 64 * 1024 ** 3], maximumRestartCount: [0, 1_000_000],
};

export function parseStatusPolicy(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("monitoring policy is invalid");
  const unknown = Object.keys(value).filter((key) => !(key in ranges));
  if (unknown.length) throw new Error("monitoring policy is invalid");
  const policy = { ...defaultStatusPolicy, ...value };
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    if (!Number.isFinite(policy[key]) || policy[key] < minimum || policy[key] > maximum) throw new Error("monitoring policy is invalid");
  }
  return Object.freeze(policy);
}

export function parseStatusRole(value) {
  if (!roles.has(value)) throw new Error("monitoring role is invalid");
  return value;
}

export function requiredEvidenceForRole(role) {
  role = parseStatusRole(role);
  return role === "edge" ? ["web-api", "tls"]
    : role === "data" ? ["backup", "retention", "publish-due"]
      : ["web-api", "tls", "backup", "retention", "publish-due"];
}
