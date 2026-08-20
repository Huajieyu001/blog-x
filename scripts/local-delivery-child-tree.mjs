import { spawn } from "node:child_process";

const exactProcessGroups = process.platform !== "win32";

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function exactTreeIsAlive(child) {
  if (!exactProcessGroups || !child.pid) return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

function signalExactTree(child, signal) {
  if (!exactProcessGroups || !child.pid) return child.kill(signal);
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForExactTreeClose(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (exactTreeIsAlive(child) && Date.now() < deadline) {
    await new Promise((accept) => setTimeout(accept, 25));
  }
  return !exactTreeIsAlive(child);
}

export function runBoundedChildTree(command, args, {
  cwd,
  env,
  maximumOutputBytes,
  timeoutMs,
  terminationGraceMs = 5_000,
  killGraceMs = 3_000,
  onOutput = () => undefined,
} = {}) {
  if (typeof command !== "string" || !command || !Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new Error("bounded child tree command is invalid");
  }
  for (const [value, label] of [[maximumOutputBytes, "maximum output"], [timeoutMs, "timeout"], [terminationGraceMs, "termination grace"], [killGraceMs, "kill grace"]]) {
    positiveInteger(value, label);
  }
  if (typeof cwd !== "string" || !cwd || !env || typeof env !== "object" || Array.isArray(env) || typeof onOutput !== "function") {
    throw new Error("bounded child tree authority is invalid");
  }

  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: exactProcessGroups });
    let combined = "";
    let capturedBytes = 0;
    let settled = false;
    let terminationPromise;
    const settle = (operation, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      operation(value);
    };
    const terminate = (reason) => {
      if (terminationPromise) return terminationPromise;
      terminationPromise = (async () => {
        signalExactTree(child, "SIGTERM");
        if (!await waitForExactTreeClose(child, terminationGraceMs)) {
          signalExactTree(child, "SIGKILL");
          if (!await waitForExactTreeClose(child, killGraceMs)) {
            throw new Error(`local delivery acceptance ${reason}; exact child tree cleanup was not confirmed`);
          }
        }
        throw new Error(`local delivery acceptance ${reason}; exact child tree cleanup confirmed`);
      })();
      terminationPromise.catch((error) => settle(reject, error));
      return terminationPromise;
    };
    const capture = (chunk) => {
      if (terminationPromise) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      capturedBytes += bytes.length;
      if (capturedBytes > maximumOutputBytes) {
        terminate("child exceeded bounded output");
        return;
      }
      const value = bytes.toString();
      combined += value;
      onOutput(value);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => settle(reject, error));
    child.once("close", (exitCode, signal) => {
      if (terminationPromise) return;
      if (exactTreeIsAlive(child)) {
        terminate("child left a generated descendant running");
        return;
      }
      if (exitCode !== 0 || signal !== null) {
        settle(reject, new Error("local delivery acceptance child did not complete successfully"));
        return;
      }
      settle(resolveResult, combined);
    });
    const timeout = setTimeout(() => terminate("child exceeded bounded time"), timeoutMs);
  });
}

export function installCooperativeShutdown(onSignal) {
  if (typeof onSignal !== "function") throw new Error("cooperative shutdown handler is required");
  let shutdownPromise;
  const handler = (signal) => {
    shutdownPromise ??= Promise.resolve().then(() => onSignal(signal));
    shutdownPromise.catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", handler);
  process.once("SIGINT", handler);
  return Object.freeze({
    wait() { return shutdownPromise ?? Promise.resolve(); },
    dispose() {
      process.removeListener("SIGTERM", handler);
      process.removeListener("SIGINT", handler);
    },
  });
}
