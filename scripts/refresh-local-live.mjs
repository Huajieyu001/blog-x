import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_DELIVERY_CLAIM_ROOT,
  assertAllowedRefreshArgv,
  assertAllowedRefreshCommand,
  assertLocalDockerAuthority,
  assertLocalDockerSocket,
  buildMinimalChildEnvironment,
  createRawRefreshRuntime,
  createRefreshAttemptStore,
  deliveryAuthorityForRevision,
  inspectRefreshAttemptClaimWithStore,
  nativeFs,
  parseRevisionAddressedEvidencePath,
  verifyRawRefreshEvidence,
} from "./refresh-local-runtime-core.mjs";

const productionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) { throw new Error(`local refresh: ${message}`); }

function nativeProductionRun(command, args, options = {}) {
  const env = buildMinimalChildEnvironment(process.env, options.env ?? {});
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: productionRoot, env, stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} failed with code ${code}`)));
    if (options.input) child.stdin.end(options.input);
  });
}

export function createProductionRefreshAttemptStore(...args) {
  if (args.length) fail("sealed production attempt store accepts no arguments or overrides");
  return createRefreshAttemptStore();
}

export function createProductionLiveRefreshAdapter(...args) {
  if (args.length) fail("sealed production live adapter accepts no arguments or overrides");
  return createRawRefreshRuntime({ runArgv: nativeProductionRun, claimStore: createProductionRefreshAttemptStore(), fetch: globalThis.fetch, root: productionRoot, evidenceFs: nativeFs, randomEvidenceHex: () => randomBytes(8).toString("hex"), ambientEnv: process.env });
}

export function verifyProductionLiveRefreshEvidence(...args) {
  if (args.length !== 1 || typeof args[0] !== "string") fail("sealed production evidence verifier accepts one revision or strict revision-addressed path");
  const revision = /^[a-f0-9]{40}$/.test(args[0]) ? args[0] : parseRevisionAddressedEvidencePath(args[0]);
  const authority = deliveryAuthorityForRevision(revision);
  return verifyRawRefreshEvidence(resolve(productionRoot, authority.evidencePath), { claimStore: createProductionRefreshAttemptStore(), fs: nativeFs, runArgv: nativeProductionRun, fetch: globalThis.fetch, root: productionRoot });
}

export function inspectRefreshAttemptClaim(revision, ...args) {
  if (args.length) fail("sealed production claim inspection accepts only one revision");
  return inspectRefreshAttemptClaimWithStore(revision, createProductionRefreshAttemptStore());
}

export {
  LOCAL_DELIVERY_CLAIM_ROOT,
  assertAllowedRefreshArgv,
  assertAllowedRefreshCommand,
  assertLocalDockerAuthority,
  assertLocalDockerSocket,
  buildMinimalChildEnvironment,
};
