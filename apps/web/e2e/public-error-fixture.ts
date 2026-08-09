import { createServer } from "node:http";

const port = Number(process.env.ERROR_FIXTURE_PORT ?? 3399);
let aboutAvailable = false;

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/public/articles" && url.searchParams.get("page") === "1") {
    return json(response, 200, { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, items: [] });
  }
  if (url.pathname === "/public/articles/missing") return json(response, 404, { error: "not_found" });
  if (url.pathname === "/public/articles/malformed-404") return json(response, 404, { error: "database unavailable" });
  if (url.pathname === "/public/articles/failure") return json(response, 500, { error: "database password at 127.0.0.1:3399" });
  if (url.pathname === "/public/articles/refused") return request.socket.destroy();
  if (url.pathname === "/public/articles/malformed") return json(response, 200, { title: "contract is incomplete" });
  if (url.pathname === "/public/categories") return json(response, 200, { items: [] });
  if (url.pathname === "/public/tags") return json(response, 200, { items: [] });
  if (url.pathname === "/public/archives") return json(response, 200, { years: [] });
  if (url.pathname === "/control/about/reset") {
    aboutAvailable = false;
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/control/about/recover") {
    aboutAvailable = true;
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/public/about") {
    if (!aboutAvailable) return json(response, 500, { error: "temporary internal detail" });
    return json(response, 200, {
      title: "关于错误恢复",
      renderedHtml: "<p>恢复后的公开内容</p>",
      updatedAt: "2026-08-09T00:00:00.000Z",
    });
  }
  return json(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
