import { parseLocalDeliveryAcceptanceOutputs } from "./local-delivery-acceptance.mjs";

function assertBoundary(processBoundary) {
  if (typeof processBoundary !== "function") throw new Error("local delivery acceptance test runtime requires a process boundary");
  return processBoundary;
}

function assertCompleted(result) {
  if (!result || typeof result !== "object" || result.exitCode !== 0 || result.signal !== null || result.timedOut === true || result.overflow === true || typeof result.combined !== "string") {
    throw new Error("local delivery acceptance child did not complete successfully");
  }
  return result.combined;
}

export function createLocalDeliveryAcceptanceTestRuntime({ processBoundary }) {
  const runBoundary = assertBoundary(processBoundary);
  const calls = [];
  return Object.freeze({
    calls,
    async run() {
      const generatedIntegrationArgs = ["scripts/local-verify.mjs", "--canonical-integration", "--interruption-check", "--parallel-check"];
      calls.push({ command: process.execPath, args: generatedIntegrationArgs });
      const generatedIntegrationOutput = assertCompleted(await runBoundary(process.execPath, generatedIntegrationArgs));
      const phase7Args = ["scripts/phase7-browser-verify.mjs"];
      calls.push({ command: process.execPath, args: phase7Args });
      const phase7Output = assertCompleted(await runBoundary(process.execPath, phase7Args));
      return parseLocalDeliveryAcceptanceOutputs({ generatedIntegrationOutput, phase7Output });
    },
  });
}
