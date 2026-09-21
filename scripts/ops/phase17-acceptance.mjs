import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export const phase17Suites = [
  "scripts/ops/job-results.test.mjs",
  "scripts/ops-status.test.mjs",
  "scripts/ops/notify.test.mjs",
  "scripts/ops-monitor.test.mjs",
  "ops/systemd/monitoring-systemd.test.mjs",
  "scripts/ops/tls-evidence.test.mjs",
  "deploy/secondary/secondary.test.mjs",
];
export const secondaryTimerSuite = "deploy/secondary/secondary.test.mjs";
// This path is resolved inside the @blog-x/api workspace, i.e.
// apps/api/test/operational-retention.test.ts in the repository.
export const operationalRetentionSuite = "test/operational-retention.test.ts";
export const phase17Commands = [
  { command: "node", args: ["--test", ...phase17Suites] },
  { command: "corepack", args: ["pnpm", "--filter", "@blog-x/api", "exec", "node", "--import", "tsx", "--test", operationalRetentionSuite] },
];

function runFixedCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("close", (code) => resolve(code ?? 1));
    child.once("error", () => resolve(1));
  });
}

export async function runAcceptance(run = runFixedCommand) {
  for (const { command, args } of phase17Commands) {
    const code = await run(command, args);
    if (code !== 0) return typeof code === "number" ? code : 1;
  }
  return 0;
}
async function main(){ const code=await runAcceptance(); if(code!==0) process.exitCode=1; }
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) main();
