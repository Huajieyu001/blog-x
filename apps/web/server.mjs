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

function isFrameworkHeader(name) {
  return typeof name === "string" && name.toLowerCase() === "x-powered-by";
}

function withoutFrameworkHeader(headers) {
  if (Array.isArray(headers)) {
    const filtered = [];
    for (let index = 0; index < headers.length; index += 2) {
      if (!isFrameworkHeader(headers[index])) filtered.push(headers[index], headers[index + 1]);
    }
    return filtered;
  }
  if (headers && typeof headers === "object") {
    return Object.fromEntries(Object.entries(headers).filter(([name]) => !isFrameworkHeader(name)));
  }
  return headers;
}

/**
 * Next's programmatic custom-server path can set framework headers after the
 * static config was loaded. Guard both Node response write APIs at the edge.
 */
export function installFrameworkHeaderGuard(response) {
  if (!response || typeof response.setHeader !== "function" || typeof response.writeHead !== "function" || typeof response.removeHeader !== "function") {
    throw new Error("Web response does not support header guarding");
  }
  const setHeader = response.setHeader.bind(response);
  const writeHead = response.writeHead.bind(response);
  const removeFrameworkHeader = () => response.removeHeader("x-powered-by");
  removeFrameworkHeader();
  response.setHeader = (name, value) => {
    if (isFrameworkHeader(name)) {
      removeFrameworkHeader();
      return response;
    }
    return setHeader(name, value);
  };
  response.writeHead = (...args) => {
    removeFrameworkHeader();
    if (args.length === 2 && typeof args[1] !== "string") args[1] = withoutFrameworkHeader(args[1]);
    if (args.length >= 3) args[2] = withoutFrameworkHeader(args[2]);
    return writeHead(...args);
  };
  return response;
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

export function createNextServerOptions({ dev = development, dir = appDirectory, hostname = host, listenPort = port } = {}) {
  return {
    dev,
    dir,
    hostname,
    port: listenPort,
    // The fixed preview mounts current .next/server.mjs over a seed image. Keep
    // this response policy explicit even if that image has an older config file.
    conf: { poweredByHeader: false },
  };
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("invalid PORT");
  const application = next(createNextServerOptions());
  await application.prepare();
  const handle = application.getRequestHandler();
  createServer((request, response) => {
    installFrameworkHeaderGuard(response);
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
