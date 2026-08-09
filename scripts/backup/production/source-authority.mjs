import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { verifyCompleteBackupSetContents } from "../content-verifier.mjs";

const setPattern = /^\d{8}T\d{6}Z-[a-z0-9]{8,32}$/;
const generatedSourceBasePattern = /^blog-x-production-source-[A-Za-z0-9_-]{6,64}$/;

function fail(message = "production backup source is invalid") {
  throw new Error(message);
}

function isWithin(child, parent) {
  return child === parent || child.startsWith(`${parent}/`);
}

function parseAuthority(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "kind,sourceBase") fail();
  if (value.kind !== "generated-test" && value.kind !== "service") fail();
  if (typeof value.sourceBase !== "string" || !value.sourceBase || value.sourceBase.includes("${") || value.sourceBase.includes("..")) fail();
  const sourceBase = resolve(value.sourceBase);
  const workspace = resolve(process.cwd());
  if (sourceBase === "/" || isWithin(sourceBase, workspace)) fail();
  if (value.kind === "generated-test") {
    if (dirname(sourceBase) !== resolve(tmpdir()) || !generatedSourceBasePattern.test(basename(sourceBase))) fail();
  } else if (sourceBase === resolve(tmpdir()) || isWithin(sourceBase, resolve(tmpdir()))) {
    fail();
  }
  return { kind: value.kind, sourceBase };
}

function restrictiveDirectory(value, label) {
  let info;
  try { info = lstatSync(value); } catch { fail(`production backup source ${label} is missing`); }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`production backup source ${label} must be a directory without links`);
  if ((info.mode & 0o077) !== 0) fail(`production backup source ${label} permissions are not restrictive`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) fail(`production backup source ${label} ownership is invalid`);
  try { return realpathSync(value); } catch { fail(`production backup source ${label} cannot be resolved`); }
}

export function validateProductionBackupSource(root, authority) {
  const parsed = parseAuthority(authority);
  if (typeof root !== "string" || !root || root.includes("${") || root.includes("..")) fail();
  const target = resolve(root);
  if (target === "/" || dirname(target) !== parsed.sourceBase || !setPattern.test(basename(target))) fail();
  const canonicalBase = restrictiveDirectory(parsed.sourceBase, "base");
  const canonicalTarget = restrictiveDirectory(target, "set");
  if (dirname(canonicalTarget) !== canonicalBase) fail("production backup source set must not resolve outside its authority");
  return target;
}

export async function verifyProductionBackupSource(root, authority) {
  const result = await verifyCompleteBackupSetContents(root, (candidate) => validateProductionBackupSource(candidate, authority));
  if (result.inventory.migration.count !== 7) throw new Error("production migration inventory count must be 7");
  return result;
}
