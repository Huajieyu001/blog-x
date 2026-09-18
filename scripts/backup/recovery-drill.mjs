import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { cleanupDecryptedBackup, decryptBackupPayload } from "./production/encryption.mjs";
import { restoreBackupSet } from "./restore.mjs";

const setPattern = /^\d{8}T\d{6}Z-([a-z0-9]{8,32})$/;

function fail(message) {
  throw new Error(`recovery drill ${message}`);
}

function strictObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function deriveToken(setId) {
  const match = setPattern.exec(setId ?? "");
  if (!match) fail("set ID is invalid");
  return match[1];
}

export async function runRecoveryDrill(value, dependencies = {}) {
  if (!strictObject(value, ["database", "keyAuthority", "mediaVolume", "namespace", "restoreRoot", "retentionPolicyId", "setId", "transport", "webOrigin"])
    || typeof value.retentionPolicyId !== "string" || !/^[a-z0-9-]{3,80}$/.test(value.retentionPolicyId)) fail("input is invalid");
  const token = deriveToken(value.setId);
  if (value.namespace !== `blogxrestore_${token}` || value.database !== `blog_x_restore_${token}` || value.mediaVolume !== `${value.namespace}_media-data`) fail("generated restore authority is invalid");
  const transport = value.transport;
  if (!transport || typeof transport.readSet !== "function" || !["generated-mounted-fixture", "service-mounted-directory"].includes(transport.scope)) fail("transport is invalid");
  const stagingRoot = resolve(tmpdir(), `blog-x-backup-verify-recovery-${token}`);
  let decrypted = false;
  try {
    const remote = await transport.readSet(value.setId);
    if (!remote || remote.setId !== value.setId || !Buffer.isBuffer(remote.ciphertext) || !remote.receipt || Object.hasOwn(remote, "cipherPath") || Object.hasOwn(remote, "receiptPath")) fail("read-back object is invalid");
    const backup = await decryptBackupPayload({
      ciphertext: remote.ciphertext, receipt: remote.receipt, retentionPolicyId: value.retentionPolicyId,
      keyAuthority: value.keyAuthority, stagingRoot,
    });
    decrypted = true;
    const restore = await restoreBackupSet({
      backupRoot: backup.backupRoot, restoreRoot: value.restoreRoot, namespace: value.namespace,
      database: value.database, mediaVolume: value.mediaVolume, webOrigin: value.webOrigin,
    }, dependencies);
    return { ...restore, setId: value.setId, receiptSha256: remote.receiptSha256 };
  } finally {
    if (decrypted) await cleanupDecryptedBackup(stagingRoot);
  }
}

export function generatedRecoveryDrillInput({ setId, transport, keyAuthority, retentionPolicyId, restoreRoot, webOrigin }) {
  const token = deriveToken(setId);
  return {
    setId, transport, keyAuthority, retentionPolicyId, restoreRoot, webOrigin,
    namespace: `blogxrestore_${token}`, database: `blog_x_restore_${token}`, mediaVolume: `blogxrestore_${token}_media-data`,
  };
}

export function generatedRecoveryRunId() {
  return randomBytes(8).toString("hex");
}
