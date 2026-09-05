import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import next from "next";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const development = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3100);
const forwardingHeaderNames = new Set([
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
  "x-blog-x-client-ip",
  "x-blog-x-ingress-auth",
]);

function requestHeaderSnapshot(request) {
  const values = new Map();
  const add = (name, value) => {
    const normalized = String(name).toLowerCase();
    if (!forwardingHeaderNames.has(normalized)) return;
    const entries = values.get(normalized) ?? [];
    entries.push(String(value));
    values.set(normalized, entries);
  };
  if (Array.isArray(request.rawHeaders)) {
    for (let index = 0; index + 1 < request.rawHeaders.length; index += 2) add(request.rawHeaders[index], request.rawHeaders[index + 1]);
  } else {
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) for (const entry of value) add(name, entry);
      else if (typeof value === "string") add(name, value);
    }
  }
  for (const name of Object.keys(request.headers)) if (forwardingHeaderNames.has(name.toLowerCase())) delete request.headers[name];
  if (Array.isArray(request.rawHeaders)) {
    const preserved = [];
    for (let index = 0; index + 1 < request.rawHeaders.length; index += 2) {
      if (!forwardingHeaderNames.has(String(request.rawHeaders[index]).toLowerCase())) preserved.push(request.rawHeaders[index], request.rawHeaders[index + 1]);
    }
    request.rawHeaders.length = 0;
    request.rawHeaders.push(...preserved);
  }
  return values;
}

function scalarHeader(snapshot, name) {
  const values = snapshot.get(name);
  return values?.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

function canonicalClientAddress(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length > 45 || !isIP(value)) return undefined;
  return value;
}

function ingressSecret(environment) {
  const value = environment.BLOG_X_INGRESS_AUTH_SECRET;
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 32 ? value : undefined;
}

function matchingIngressSecret(received, expected) {
  if (typeof received !== "string" || Buffer.byteLength(received, "utf8") !== Buffer.byteLength(expected, "utf8")) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/**
 * Removes every externally-controlled forwarding header before Next can read
 * it. API rewrites then receive one canonical address from a separately
 * authenticated ingress, or (development only) their direct socket peer.
 */
export function installTrustedApiForwarding(request, environment = process.env) {
  const snapshot = requestHeaderSnapshot(request);
  if (!request.url?.startsWith("/api/")) return true;
  const production = environment.NODE_ENV === "production";
  const secret = ingressSecret(environment);
  let address;
  if (secret) {
    const suppliedAddress = canonicalClientAddress(scalarHeader(snapshot, "x-blog-x-client-ip"));
    if (!suppliedAddress || !matchingIngressSecret(scalarHeader(snapshot, "x-blog-x-ingress-auth"), secret)) return false;
    address = suppliedAddress;
  } else {
    if (production) return false;
    address = canonicalClientAddress(request.socket?.remoteAddress);
    if (!address) return false;
  }
  request.headers["x-forwarded-for"] = address;
  return true;
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("invalid PORT");
  const application = next({ dev: development, dir: appDirectory, hostname: host, port });
  await application.prepare();
  const handle = application.getRequestHandler();
  createServer((request, response) => {
    if (!installTrustedApiForwarding(request)) {
      response.writeHead(404, { "cache-control": "no-store" });
      response.end();
      return;
    }
    handle(request, response);
  }).listen(port, host);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : "web startup failed");
  process.exitCode = 1;
});
