import { createServer } from "node:http";

const port = Number(process.env.DISCOVERY_FIXTURE_PORT);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("DISCOVERY_FIXTURE_PORT must be a valid local port");
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const publishedResult = {
  title: "中文 & React：一条可信搜索结果",
  summary: "严格公开摘要 <script> 不会作为标记执行",
  slug: "trusted-search-result",
  publishedAt: "2026-08-17T04:00:00.000Z",
  status: "published" as const,
  category: { name: "前端工程", slug: "frontend" },
  tags: [{ name: "React", slug: "react" }],
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method !== "GET") return json(response, 405, { error: "method_not_allowed" });
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/public/articles" && url.searchParams.get("page") === "1") {
    return json(response, 200, {
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      items: [],
    });
  }

  if (url.pathname === "/public/search") {
    const query = (url.searchParams.get("q") ?? "").normalize("NFC").trim();
    const page = Number(url.searchParams.get("page") ?? "1");

    if (query === "partial") {
      return json(response, 200, {
        state: "results",
        query,
        page,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        items: [{ title: "incomplete result" }],
      });
    }

    if (!query) {
      return json(response, 200, {
        state: "empty_query",
        query: "",
        page,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
        items: [],
      });
    }

    if (query === "中文 & React") {
      return json(response, 200, {
        state: "results",
        query,
        page,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        items: [publishedResult],
      });
    }

    return json(response, 200, {
      state: "no_results",
      query,
      page,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      items: [],
    });
  }

  return json(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
