import { createServer } from "node:http";
import { publicPostDetailSchema, publicRelatedPostsResponseSchema } from "@blog-x/contracts";

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

const relatedSlugs = ["related-populated", "related-zero", "related-failure", "related-malformed"] as const;

function relatedCard(position: number) {
  return {
    title: `相关阅读 ${position}：保持 API 顺序`,
    summary: position === 2 ? "" : `第 ${position} 篇严格公开摘要`,
    slug: `related-result-${position}`,
    publishedAt: `2026-08-${String(16 - position).padStart(2, "0")}T04:00:00.000Z`,
    status: "published" as const,
    category: position % 2 === 0 ? null : { name: "前端工程", slug: "frontend" },
    tags: [{ name: `标签${position}`, slug: `tag-${position}` }],
  };
}

function articleDetail(slug: (typeof relatedSlugs)[number]) {
  return publicPostDetailSchema.parse({
    title: `主文章 ${slug}`,
    summary: "相关文章失败也不能影响这篇文章。",
    slug,
    publishedAt: "2026-08-17T04:00:00.000Z",
    status: "published",
    category: { name: "前端工程", slug: "frontend" },
    tags: [{ name: "React", slug: "react" }],
    seoDescription: "用于验证相关文章隔离的公开文章。",
    renderedHtml: '<p>完整正文内容仍然可读。</p><h2 id="article-ending">正文尾部<a class="heading-permalink" href="#article-ending" aria-label="正文尾部的永久链接">#</a></h2>',
    toc: [{ id: "article-ending", depth: 2, text: "正文尾部" }],
    cover: null,
  });
}

const populatedRelated = publicRelatedPostsResponseSchema.parse({
  items: [1, 2, 3, 4].map(relatedCard),
});

const emptyRelated = publicRelatedPostsResponseSchema.parse({ items: [] });

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

  const articleMatch = /^\/public\/articles\/([^/]+)$/.exec(url.pathname);
  if (articleMatch && relatedSlugs.includes(articleMatch[1] as (typeof relatedSlugs)[number])) {
    return json(response, 200, articleDetail(articleMatch[1] as (typeof relatedSlugs)[number]));
  }

  const relatedMatch = /^\/public\/articles\/([^/]+)\/related$/.exec(url.pathname);
  if (relatedMatch?.[1] === "related-populated") return json(response, 200, populatedRelated);
  if (relatedMatch?.[1] === "related-zero") return json(response, 200, emptyRelated);
  if (relatedMatch?.[1] === "related-failure") {
    return json(response, 503, { error: "temporary related failure" });
  }
  if (relatedMatch?.[1] === "related-malformed") {
    return json(response, 200, { items: [{ title: "incomplete related object" }] });
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
