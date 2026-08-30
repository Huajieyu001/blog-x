import type { AdminPostInput } from "@blog-x/contracts";

export const EDITOR_RECOVERY_PREFIX = "blog-x:editor-recovery:v1:";
export const EDITOR_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const EDITOR_RECOVERY_MAX_BYTES = 256 * 1024;

type CoverMedia = NonNullable<AdminPostInput["coverMedia"]>;

export type EditorRecoveryFields = {
  title: string;
  summary: string;
  coverUrl: string;
  slug: string;
  markdown: string;
  publishedAt: string;
  seoDescription: string;
  categoryId: string | null;
  tagIds: string[];
  coverMedia: CoverMedia | null;
};

export type EditorRecoveryTarget = { kind: "new" } | { kind: "post"; id: string };

export type EditorRecoverySnapshot = {
  format: "blog-x-editor-recovery";
  version: 1;
  target: EditorRecoveryTarget;
  baseVersion: string | null;
  writtenAt: string;
  fields: EditorRecoveryFields;
  slugManuallyEdited: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mediaUrlPattern = /^\/media\/[0-9a-f-]{36}$/i;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function validTarget(value: unknown): value is EditorRecoveryTarget {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "new") return hasExactKeys(value, ["kind"]);
  return value.kind === "post"
    && hasExactKeys(value, ["kind", "id"])
    && typeof value.id === "string"
    && uuidPattern.test(value.id);
}

function validMedia(value: unknown): value is CoverMedia {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "url", "width", "height", "mimeType", "alt", "decorative"])) return false;
  return typeof value.id === "string" && uuidPattern.test(value.id)
    && typeof value.url === "string" && mediaUrlPattern.test(value.url)
    && typeof value.width === "number" && Number.isSafeInteger(value.width) && value.width > 0
    && typeof value.height === "number" && Number.isSafeInteger(value.height) && value.height > 0
    && typeof value.mimeType === "string" && allowedMimeTypes.has(value.mimeType)
    && typeof value.alt === "string" && value.alt.length <= 500
    && typeof value.decorative === "boolean";
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function validFields(value: unknown): value is EditorRecoveryFields {
  if (!isRecord(value) || !hasExactKeys(value, [
    "title", "summary", "coverUrl", "slug", "markdown", "publishedAt", "seoDescription", "categoryId", "tagIds", "coverMedia",
  ])) return false;
  if (!boundedString(value.title, 240)
    || !boundedString(value.summary, 1_000)
    || value.coverUrl !== ""
    || !boundedString(value.slug, 180)
    || !boundedString(value.markdown, 200_000)
    || !boundedString(value.publishedAt, 64)
    || !boundedString(value.seoDescription, 320)) return false;
  if (value.categoryId !== null && (typeof value.categoryId !== "string" || !uuidPattern.test(value.categoryId))) return false;
  if (!Array.isArray(value.tagIds) || value.tagIds.length > 50
    || value.tagIds.some((id) => typeof id !== "string" || !uuidPattern.test(id))
    || new Set(value.tagIds).size !== value.tagIds.length) return false;
  return value.coverMedia === null || validMedia(value.coverMedia);
}

function serializedBytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function sameTarget(left: EditorRecoveryTarget, right: EditorRecoveryTarget) {
  return left.kind === right.kind && (left.kind === "new" || (right.kind === "post" && left.id === right.id));
}

function validSnapshot(value: unknown, target?: EditorRecoveryTarget, now = Date.now()): value is EditorRecoverySnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ["format", "version", "target", "baseVersion", "writtenAt", "fields", "slugManuallyEdited"])) return false;
  if (value.format !== "blog-x-editor-recovery" || value.version !== 1 || !validTarget(value.target)) return false;
  if (target && !sameTarget(value.target, target)) return false;
  if (value.target.kind === "new" ? value.baseVersion !== null : (typeof value.baseVersion !== "string" || !Number.isFinite(Date.parse(value.baseVersion)))) return false;
  if (typeof value.writtenAt !== "string" || typeof value.slugManuallyEdited !== "boolean" || !validFields(value.fields)) return false;
  const writtenAt = Date.parse(value.writtenAt);
  return Number.isFinite(writtenAt) && writtenAt <= now + 5 * 60_000 && now - writtenAt <= EDITOR_RECOVERY_TTL_MS;
}

export function editorRecoveryKey(target: EditorRecoveryTarget) {
  if (!validTarget(target)) throw new Error("editor recovery target is invalid");
  return `${EDITOR_RECOVERY_PREFIX}${target.kind === "new" ? "new" : target.id}`;
}

export function createEditorRecoverySnapshot(input: {
  target: EditorRecoveryTarget;
  baseVersion: string | null;
  fields: EditorRecoveryFields;
  slugManuallyEdited: boolean;
  now?: number;
}): EditorRecoverySnapshot {
  const now = input.now ?? Date.now();
  const snapshot: EditorRecoverySnapshot = {
    format: "blog-x-editor-recovery",
    version: 1,
    target: input.target,
    baseVersion: input.baseVersion,
    writtenAt: new Date(now).toISOString(),
    fields: input.fields,
    slugManuallyEdited: input.slugManuallyEdited,
  };
  if (!validSnapshot(snapshot, input.target, now)) throw new Error("editor recovery fields are invalid");
  const encoded = JSON.stringify(snapshot);
  if (serializedBytes(encoded) > EDITOR_RECOVERY_MAX_BYTES) throw new Error("editor recovery snapshot is too large");
  return snapshot;
}

export function writeEditorRecoverySnapshot(storage: Storage, snapshot: EditorRecoverySnapshot) {
  try {
    const encoded = JSON.stringify(snapshot);
    if (!validSnapshot(snapshot, snapshot.target) || serializedBytes(encoded) > EDITOR_RECOVERY_MAX_BYTES) return { ok: false } as const;
    storage.setItem(editorRecoveryKey(snapshot.target), encoded);
    return { ok: true } as const;
  } catch {
    return { ok: false } as const;
  }
}

export function readEditorRecoverySnapshot(storage: Storage, target: EditorRecoveryTarget, now = Date.now()):
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "found"; snapshot: EditorRecoverySnapshot } {
  const key = editorRecoveryKey(target);
  let encoded: string | null;
  try {
    encoded = storage.getItem(key);
  } catch {
    return { kind: "unavailable" };
  }
  if (encoded === null) return { kind: "none" };
  try {
    if (serializedBytes(encoded) > EDITOR_RECOVERY_MAX_BYTES) {
      storage.removeItem(key);
      return { kind: "none" };
    }
    const parsed: unknown = JSON.parse(encoded);
    if (!validSnapshot(parsed, target, now)) {
      storage.removeItem(key);
      return { kind: "none" };
    }
    return { kind: "found", snapshot: parsed };
  } catch {
    try { storage.removeItem(key); } catch { /* invalid recovery data remains inert */ }
    return { kind: "none" };
  }
}

export function removeEditorRecoverySnapshot(storage: Storage, target: EditorRecoveryTarget) {
  try {
    storage.removeItem(editorRecoveryKey(target));
    return true;
  } catch {
    return false;
  }
}

export function clearEditorRecoverySnapshots(storage: Storage) {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(EDITOR_RECOVERY_PREFIX)));
    for (const key of keys) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getEditorRecoveryStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
