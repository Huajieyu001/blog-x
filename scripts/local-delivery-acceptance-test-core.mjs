import {
  buildLocalDeliveryAcceptanceEnvironment,
  parseLocalDeliveryAcceptanceOutputs,
  wrapLocalDeliveryAcceptanceFailure,
} from "./local-delivery-acceptance.mjs";
import { createBoundedChildFailure } from "./local-delivery-child-tree.mjs";

function assertBoundary(processBoundary) {
  if (typeof processBoundary !== "function") throw new Error("local delivery acceptance test runtime requires a process boundary");
  return processBoundary;
}

function assertCompleted(result) {
  if (!result || typeof result !== "object") throw createBoundedChildFailure("spawn_error");
  if (result.timedOut === true) throw createBoundedChildFailure("timeout", result);
  if (result.overflow === true) throw createBoundedChildFailure("output_limit", result);
  if (result.signal !== null) throw createBoundedChildFailure("child_signal", result);
  if (result.exitCode !== 0) throw createBoundedChildFailure("child_exit", result);
  if (result.cleanupConfirmed === false) throw createBoundedChildFailure("cleanup_unconfirmed", result);
  if (typeof result.combined !== "string") throw createBoundedChildFailure("spawn_error");
  return result.combined;
}

export function createLocalDeliveryAcceptanceTestRuntime({ processBoundary, ambient = process.env }) {
  const runBoundary = assertBoundary(processBoundary);
  const env = buildLocalDeliveryAcceptanceEnvironment(ambient);
  const calls = [];
  return Object.freeze({
    calls,
    async run() {
      const generatedIntegrationArgs = ["scripts/local-verify.mjs", "--canonical-integration", "--interruption-check", "--parallel-check"];
      calls.push({ command: process.execPath, args: generatedIntegrationArgs });
      let generatedIntegrationOutput;
      try { generatedIntegrationOutput = assertCompleted(await runBoundary(process.execPath, generatedIntegrationArgs, { env })); }
      catch (error) { throw wrapLocalDeliveryAcceptanceFailure("generated", error); }
      const phase7Args = ["scripts/phase7-browser-verify.mjs"];
      calls.push({ command: process.execPath, args: phase7Args });
      let phase7Output;
      try { phase7Output = assertCompleted(await runBoundary(process.execPath, phase7Args, { env })); }
      catch (error) { throw wrapLocalDeliveryAcceptanceFailure("phase7", error); }
      return parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput, phase7Output });
    },
  });
}
