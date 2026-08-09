import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  backupMemberPattern,
  backupManifestSchema,
  completenessMarkerSchema,
  hashFile,
  listBackupFiles,
  verifyCompleteBackupSetContents,
} from "./content-verifier.mjs";
import { validateBackupStaging, validateFinalBackupRoot } from "./paths.mjs";

export { backupManifestSchema, completenessMarkerSchema, hashFile } from "./content-verifier.mjs";

export async function verifyBackupSet(root) {
  return verifyCompleteBackupSetContents(root, (candidate) => {
    try { return validateFinalBackupRoot(candidate); } catch { return validateBackupStaging(candidate); }
  });
}

export async function createManifest(root, setId, createdAt) {
  const files = (await listBackupFiles(root)).filter((item) => item !== "manifest.json" && item !== "COMPLETE");
  const members = [];
  for (const path of files) {
    if (!backupMemberPattern.test(path)) throw new Error(`extra backup payload member: ${path}`);
    const full = resolve(root, path);
    const info = await lstat(full);
    members.push({ path, bytes: info.size, sha256: await hashFile(full) });
  }
  return backupManifestSchema.parse({ format: "blog-x-backup-set", version: 1, setId, createdAt, toolVersion: "04-02", members: members.sort((a, b) => a.path.localeCompare(b.path)) });
}
