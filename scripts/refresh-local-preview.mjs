import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const composePrefix = Object.freeze(["-p", "blogxlocal", "-f", "compose.yaml"]);

export const FAST_LOCAL_PREVIEW_READY = "FAST LOCAL PREVIEW READY http://127.0.0.1:3100";

export function buildFastPreviewEnvironment(ambient = process.env) {
  if (!ambient || typeof ambient !== "object" || Array.isArray(ambient)) {
    throw new Error("fast local preview environment is invalid");
  }
  const value = (name, fallback = "") => typeof ambient[name] === "string" && ambient[name] ? ambient[name] : fallback;
  return Object.freeze({
    PATH: value("PATH"),
    HOME: value("HOME"),
    TMPDIR: value("TMPDIR", "/tmp"),
    LANG: value("LANG", "C"),
    LC_ALL: value("LC_ALL", "C"),
  });
}

export function createFastLocalPreviewPlan() {
  return Object.freeze([
    Object.freeze({ command: "corepack", args: Object.freeze(["pnpm", "-r", "typecheck"]) }),
    Object.freeze({ command: "docker-compose", args: Object.freeze([...composePrefix, "build", "api"]) }),
    Object.freeze({ command: "docker-compose", args: Object.freeze([...composePrefix, "build", "web"]) }),
    Object.freeze({ command: "docker-compose", args: Object.freeze([...composePrefix, "up", "-d", "--wait", "api", "web"]) }),
    Object.freeze({ command: "corepack", args: Object.freeze(["pnpm", "exec", "playwright", "test", "--config=scripts/local-preview.playwright.config.ts", "scripts/local-preview-smoke.spec.ts", "--workers=1"]) }),
  ]);
}

export function assertFastPreviewArgv(argv = process.argv) {
  if (!Array.isArray(argv) || argv.length !== 2) throw new Error("fast local preview accepts no arguments");
}

function nativeRunCommand(command, args, { cwd, env }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", (error) => reject(new Error(`fast local preview could not start ${command}: ${error.message}`)));
    child.once("close", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`fast local preview stage failed: ${command} ${args.join(" ")} (${signal ?? code ?? "unknown"})`));
    });
  });
}

export async function runFastLocalPreview({ ambientEnv = process.env, runCommand = nativeRunCommand, write = (line) => process.stdout.write(line) } = {}) {
  if (typeof runCommand !== "function" || typeof write !== "function") throw new Error("fast local preview runner is invalid");
  const env = buildFastPreviewEnvironment(ambientEnv);
  for (const { command, args } of createFastLocalPreviewPlan()) {
    await runCommand(command, args, { cwd: root, env });
  }
  write(`${FAST_LOCAL_PREVIEW_READY}\n`);
}

async function main() {
  assertFastPreviewArgv();
  await runFastLocalPreview();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
