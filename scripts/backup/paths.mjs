import { lstat, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const rootPattern = /^blog-x-backup-verify-[A-Za-z0-9_-]{6,64}$/;
const setPattern = /^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/;

export function validateBackupRoot(value) {
  if (typeof value !== "string" || !value || value.includes("${") || value.includes("..")) throw new Error("backup root is unresolved or broad");
  const target = resolve(value);
  if (dirname(target) !== resolve(tmpdir()) || !rootPattern.test(basename(target))) throw new Error("backup root must be an exact generated temporary directory");
  return target;
}

export function validateBackupSetId(value) {
  if (!setPattern.test(value ?? "")) throw new Error("backup set id is invalid");
  return value;
}

export function validateFinalBackupRoot(value) {
  const target = resolve(value ?? "");
  validateBackupRoot(dirname(target));
  validateBackupSetId(basename(target));
  return target;
}

export function validateBackupStaging(value) {
  const target = resolve(value ?? "");
  validateBackupRoot(dirname(target));
  if (!/^\.\d{8}T\d{6}Z-[a-z0-9]{8,32}\.incomplete-[a-z0-9]{8,32}$/.test(basename(target))) throw new Error("backup staging target is not exact");
  return target;
}

export async function assertNotLink(value, label = "backup path") {
  const info = await lstat(value);
  if (info.isSymbolicLink()) throw new Error(`${label} must not be a link`);
  return info;
}

export async function cleanupBackupStaging(value) {
  const target = validateBackupStaging(value);
  await rm(target, { recursive: true, force: true });
  return true;
}

export async function cleanupGeneratedBackupRoot(value) {
  const target = validateBackupRoot(value);
  await rm(target, { recursive: true, force: true });
  return true;
}
