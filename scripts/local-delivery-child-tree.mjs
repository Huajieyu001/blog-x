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

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function runBoundedChildTree(command, args, {
  cwd,
  env,
  maximumOutputBytes,
  timeoutMs,
  terminationGraceMs = 5_000,
  killGraceMs = 3_000,
  cleanupAcknowledgementMs = 2_000,
  confirmCleanup,
  onOutput = () => undefined,
} = {}) {
  if (typeof command !== "string" || !command || !Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new Error("bounded child tree command is invalid");
  }
  for (const [value, label] of [[maximumOutputBytes, "maximum output"], [timeoutMs, "timeout"], [terminationGraceMs, "termination grace"], [killGraceMs, "kill grace"], [cleanupAcknowledgementMs, "cleanup acknowledgement"]]) {
    positiveInteger(value, label);
  }
  if (typeof cwd !== "string" || !cwd || !env || typeof env !== "object" || Array.isArray(env) || typeof onOutput !== "function") {
    throw new Error("bounded child tree authority is invalid");
  }
  if (confirmCleanup !== undefined && typeof confirmCleanup !== "function") throw new Error("bounded child cleanup acknowledgement is invalid");

  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: exactProcessGroups });
    let combined = "";
    let capturedBytes = 0;
    let settled = false;
    let terminationPromise;
    let closeResult;
    let resolveClose;
    const closePromise = new Promise((accept) => { resolveClose = accept; });
    const settle = (operation, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      operation(value);
    };
    const terminate = (reason) => {
      if (terminationPromise) return terminationPromise;
      terminationPromise = (async () => {
        let forced = false;
        signalExactTree(child, "SIGTERM");
        if (!await waitForExactTreeClose(child, terminationGraceMs)) {
          forced = true;
          signalExactTree(child, "SIGKILL");
          if (!await waitForExactTreeClose(child, killGraceMs)) {
            throw new Error(`local delivery acceptance ${reason}; process tree termination was not confirmed`);
          }
        }
        await withTimeout(closePromise, killGraceMs, "child close acknowledgement timed out");
        if (confirmCleanup) {
          let confirmed = false;
          try {
            confirmed = await withTimeout(Promise.resolve().then(() => confirmCleanup(combined, { forced, closeResult })), cleanupAcknowledgementMs, "cleanup acknowledgement timed out");
          } catch {
            confirmed = false;
          }
          if (confirmed === true) throw new Error(`local delivery acceptance ${reason}; generated authority cleanup confirmed`);
          throw new Error(`local delivery acceptance ${reason}; process tree terminated but generated authority cleanup was not acknowledged`);
        }
        throw new Error(`local delivery acceptance ${reason}; process tree terminated without generated-authority acknowledgement`);
      })();
      terminationPromise.catch((error) => settle(reject, error));
      return terminationPromise;
    };
    const capture = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      capturedBytes += bytes.length;
      if (capturedBytes > maximumOutputBytes) {
        if (!terminationPromise) terminate("child exceeded bounded output");
        return;
      }
      const value = bytes.toString();
      combined += value;
      onOutput(value);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => settle(reject, error));
    child.once("close", async (exitCode, signal) => {
      closeResult = { exitCode, signal };
      resolveClose(closeResult);
      if (terminationPromise) return;
      if (exactTreeIsAlive(child)) {
        terminate("child left a generated descendant running");
        return;
      }
      if (exitCode !== 0 || signal !== null) {
        settle(reject, new Error("local delivery acceptance child did not complete successfully"));
        return;
      }
      if (confirmCleanup) {
        try {
          const confirmed = await withTimeout(Promise.resolve().then(() => confirmCleanup(combined, { forced: false, closeResult })), cleanupAcknowledgementMs, "cleanup acknowledgement timed out");
          if (confirmed !== true) return settle(reject, new Error("local delivery acceptance child completed without confirmed generated-authority cleanup"));
        } catch {
          return settle(reject, new Error("local delivery acceptance child completed without confirmed generated-authority cleanup"));
        }
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
