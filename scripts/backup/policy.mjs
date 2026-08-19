import { validateBackupRoot } from "./paths.mjs";

const fields = [
  "alert_recipient_ref", "compose_project", "config_inventory_sources", "database_name", "destination_root",
  "encryption_key_ref", "format", "media_root", "off_host_destination_ref", "retention_decision_ref",
  "schedule", "secret_authority_ref", "version",
];

function externalReference(value) {
  return typeof value === "string" && /^external:[a-z0-9][a-z0-9-]{2,80}$/.test(value);
}

export function parseBackupPolicy(value) {
  const fail = () => { throw new Error("backup policy is invalid or incomplete"); };
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== fields.join(",")) fail();
  if (value.format !== "blog-x-backup-policy" || value.version !== 1 || value.schedule !== "daily") fail();
  const destinationRoot = validateBackupRoot(value.destination_root);
  const project = value.compose_project;
  if (!/^blogxverify_[a-z0-9]{8,32}$/.test(project ?? "")) fail();
  const suffix = project.slice("blogxverify_".length);
  if (value.database_name !== `blog_x_${suffix}` || value.media_root !== "/var/lib/blog-x/media") fail();
  for (const name of ["off_host_destination_ref", "retention_decision_ref", "encryption_key_ref", "alert_recipient_ref", "secret_authority_ref"]) {
    if (!externalReference(value[name])) fail();
  }
  if (!Array.isArray(value.config_inventory_sources) || value.config_inventory_sources.length === 0
    || value.config_inventory_sources.some((item) => typeof item !== "string" || !/^(?:ops|compose\.yaml)[/A-Za-z0-9_.-]*$/.test(item) || item.includes(".."))) fail();
  return { ...value, destination_root: destinationRoot };
}
