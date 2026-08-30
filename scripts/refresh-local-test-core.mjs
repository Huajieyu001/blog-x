// TEST-ONLY raw boundary assembly. Production modules never import this file.
import {
  assertLocalDockerAuthority,
  assertLocalDockerSocket,
  buildMinimalChildEnvironment,
  createRawRefreshFactSources,
  createRawRefreshRuntime,
  createRefreshAttemptStore,
  deliveryAuthorityForRevision,
  inspectRefreshAttemptClaimWithStore,
  parseRevisionAddressedEvidencePath,
  verifyRawRefreshEvidence,
  runRefreshCliBoundary,
} from "./refresh-local-runtime-core.mjs";
import { createRefreshPlan, runLocalRefresh } from "./refresh-local.mjs";
import { createHash } from "node:crypto";

function fail(message) { throw new Error(`local refresh test core: ${message}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

export { assertLocalDockerAuthority, assertLocalDockerSocket, buildMinimalChildEnvironment };

export function createRefreshTestRuntime(boundaries) {
  const required = ["clock", "fetch", "fs", "processBoundary", "randomHex"];
  const keys = [...required, "verificationIdentity"];
  if (!boundaries || Object.keys(boundaries).some((key) => !keys.includes(key)) || required.some((key) => typeof boundaries[key] === "undefined")) fail("only raw process/filesystem/fetch/clock/random boundaries are accepted");
  if (typeof boundaries.processBoundary !== "function" || typeof boundaries.fetch !== "function" || typeof boundaries.clock !== "function" || typeof boundaries.randomHex !== "function" || typeof boundaries.fs !== "object") fail("test boundaries are invalid");
  const verificationIdentity = boundaries.verificationIdentity ?? { uid: 501 };
  if (!Number.isSafeInteger(verificationIdentity?.uid) || verificationIdentity.uid < 0) fail("test verification identity is invalid");
  const calls = []; const reads = []; const fetches = [];
  const processBoundary = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], options: structuredClone(options) });
    return boundaries.processBoundary(command, args, options);
  };
  const fs = new Proxy(boundaries.fs, {
    get(target, key) {
      if (key === "readFile") return async (path, ...args) => { reads.push(String(path)); return target.readFile(path, ...args); };
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const fetch = async (url, options) => { fetches.push({ url: String(url), options: structuredClone(options) }); return boundaries.fetch(url, options); };
  const claimStore = () => createRefreshAttemptStore({ fs, identity: { uid: 501 }, randomHex: boundaries.randomHex });
  let adapterConstructions = 0;
  const rawState = () => ({ seeds: { api: { reference: "unresolved", inspectedId: `sha256:${"0".repeat(64)}` }, web: { reference: "unresolved", inspectedId: `sha256:${"0".repeat(64)}` } }, targetFacts: { api: null, web: null } });
  const runtime = {
    calls, reads, fetches,
    createAttemptStore: claimStore,
    createFactSources() { return createRawRefreshFactSources({ run: processBoundary, fetch, root: "/virtual-workspace", fs, state: rawState() }); },
    createAdapter() { adapterConstructions += 1; return createRawRefreshRuntime({ runArgv: processBoundary, claimStore: claimStore(), fetch, root: "/virtual-workspace", evidenceFs: fs, randomEvidenceHex: () => boundaries.randomHex().slice(0, 16), ambientEnv: { PATH: "/usr/bin:/bin", HOME: "/Users/test", TMPDIR: "/tmp", LANG: "C" }, clock: boundaries.clock }); },
    adapterConstructionCount() { return adapterConstructions; },
    inspectClaim(revision) { return inspectRefreshAttemptClaimWithStore(revision, claimStore()); },
    verifyEvidence(path) { return verifyRawRefreshEvidence(path, { claimStore: claimStore(), fs, runArgv: processBoundary, fetch, root: "/virtual-workspace", identity: verificationIdentity }); },
    runCli({ argv = [], output = { write() {} } } = {}) {
      const resolveRevision = async () => {
        const status = String((await processBoundary("git", ["status", "--porcelain"])).stdout ?? "").trim();
        const ref = String((await processBoundary("git", ["symbolic-ref", "--quiet", "HEAD"])).stdout ?? "").trim();
        if (!/^refs\/heads\/[^\s\x00-\x1f]+$/.test(ref)) fail("raw Git worktree is detached or has an invalid branch ref");
        const revision = String((await processBoundary("git", ["rev-parse", "HEAD"])).stdout ?? "").trim();
        if (status && status !== `?? ${deliveryAuthorityForRevision(revision).evidencePath}`) fail("raw Git worktree is dirty");
        return revision;
      };
      const verifyEvidence = (revisionOrPath) => {
        const revision = /^[a-f0-9]{40}$/.test(revisionOrPath) ? revisionOrPath : parseRevisionAddressedEvidencePath(revisionOrPath);
        return runtime.verifyEvidence(`/virtual-workspace/${deliveryAuthorityForRevision(revision).evidencePath}`);
      };
      return runRefreshCliBoundary({ argv, resolveRevision, attemptStore: claimStore(), adapterFactory: () => runtime.createAdapter(), output, readLockfile: () => fs.readFile("/virtual-workspace/pnpm-lock.yaml"), materializePlan: (bytes, revision) => createRefreshPlan({ revision, lockSha256: sha256(bytes), apiSeedId: "sha256:0", webSeedId: "sha256:0" }), executeRefresh: (adapter, plan, { onStage }) => runLocalRefresh({ adapter, plan, onStage }), verifyEvidence, probeOffline: async () => { throw new Error("probe is not available in unit boundaries"); }, stageBoundary: boundaries.clock });
    },
    stage(name) { return boundaries.clock(name); },
  };
  return Object.freeze(runtime);
}
