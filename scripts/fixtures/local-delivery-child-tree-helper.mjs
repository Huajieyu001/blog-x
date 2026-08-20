import { spawn } from "node:child_process";

const port = Number(process.argv[2]);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("helper port is invalid");

const source = [
  "const { createServer } = require('node:net');",
  "const port = Number(process.argv[1]);",
  "process.on('SIGTERM', () => {});",
  "process.on('SIGINT', () => {});",
  "const server = createServer((socket) => socket.end('alive'));",
  "server.listen(port, '127.0.0.1', () => process.stdout.write(`DESCENDANT_READY ${process.pid}\\n`));",
].join("");
const descendant = spawn(process.execPath, ["-e", source, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
descendant.stdout.pipe(process.stdout);
process.on("SIGTERM", () => {});
process.on("SIGINT", () => {});
process.stdout.write(`PARENT_READY ${process.pid}\n`);
setInterval(() => undefined, 60_000);
