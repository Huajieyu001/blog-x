import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import next from "next";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const development = process.env.NODE_ENV !== "production";
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3100);

export function installTrustedApiForwarding(request) {
  if (!request.url?.startsWith("/api/")) return;
  // Next's external rewrite copies request headers to Fastify. The browser
  // controls every forwarding header, so replace them at the only public edge
  // with the address observed by this Web process's socket.
  delete request.headers.forwarded;
  delete request.headers["x-forwarded-for"];
  delete request.headers["x-forwarded-host"];
  delete request.headers["x-forwarded-port"];
  delete request.headers["x-forwarded-proto"];
  const address = request.socket.remoteAddress;
  if (typeof address === "string" && address) request.headers["x-forwarded-for"] = address;
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("invalid PORT");
  const application = next({ dev: development, dir: appDirectory, hostname: host, port });
  await application.prepare();
  const handle = application.getRequestHandler();
  createServer((request, response) => {
    installTrustedApiForwarding(request);
    handle(request, response);
  }).listen(port, host);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : "web startup failed");
  process.exitCode = 1;
});
