// TEST-ONLY boundary wiring. Production entry points in refresh-local-live.mjs
// are zero-argument sealed factories and never import this module.
import {
  assertLocalDockerAuthority,
  assertLocalDockerSocket,
  buildMinimalChildEnvironment,
  createLiveRefreshAdapter,
  createRefreshAttemptStore,
  createRefreshFactSources,
} from "./refresh-local-live.mjs";

function fail(message) { throw new Error(`local refresh test core: ${message}`); }

export { assertLocalDockerAuthority, assertLocalDockerSocket, buildMinimalChildEnvironment };

export function createRefreshTestRuntime(boundaries) {
  const keys = ["clock", "fetch", "fs", "processBoundary", "randomHex"];
  if (!boundaries || Object.keys(boundaries).some((key) => !keys.includes(key)) || keys.some((key) => typeof boundaries[key] === "undefined")) fail("only raw process/filesystem/fetch/clock/random boundaries are accepted");
  if (typeof boundaries.processBoundary !== "function" || typeof boundaries.fetch !== "function" || typeof boundaries.clock !== "function" || typeof boundaries.randomHex !== "function" || typeof boundaries.fs !== "object") fail("test boundaries are invalid");
  const calls = [];
  const processBoundary = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], options: structuredClone(options) });
    return boundaries.processBoundary(command, args, options);
  };
  return Object.freeze({
    calls,
    createAttemptStore() { return createRefreshAttemptStore({ fs: boundaries.fs, identity: { uid: 501 }, randomHex: boundaries.randomHex }); },
    createFactSources() { return createRefreshFactSources({ run: processBoundary, fetch: boundaries.fetch, root: "/virtual-workspace", fs: boundaries.fs }); },
    createAdapter() {
      return createLiveRefreshAdapter({ runArgv: processBoundary, claimStore: createRefreshAttemptStore({ fs: boundaries.fs, identity: { uid: 501 }, randomHex: boundaries.randomHex }), fetch: boundaries.fetch, root: "/virtual-workspace", evidenceFs: boundaries.fs, randomEvidenceHex: () => boundaries.randomHex().slice(0, 16), ambientEnv: { PATH: "/usr/bin:/bin", HOME: "/Users/test", TMPDIR: "/tmp", LANG: "C" }, enforceLocalAuthority: true });
    },
  });
}
