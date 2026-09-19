import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export const phase17Suites = ["scripts/ops/job-results.test.mjs", "scripts/ops-status.test.mjs", "scripts/ops/notify.test.mjs", "scripts/ops-monitor.test.mjs", "ops/systemd/monitoring-systemd.test.mjs"];
export function runAcceptance(run = (args) => new Promise((resolve) => { const child=spawn("node",args,{stdio:"inherit"}); child.once("close",(code)=>resolve(code)); })) { return run(["--test", ...phase17Suites]); }
async function main(){ const code=await runAcceptance(); if(code!==0) process.exitCode=1; }
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) main();
