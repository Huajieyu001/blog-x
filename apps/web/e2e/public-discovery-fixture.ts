import { createServer } from "node:http";
import {
  publicDistributionSchema,
  publicPostDetailSchema,
  publicRelatedPostsResponseSchema,
  publicSearchResponseSchema,
} from "@blog-x/contracts";

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

const relatedSlugs = [
  "related-populated",
  "related-one",
  "related-zero",
  "related-failure",
  "related-malformed",
  "related-refusal",
  "related-lifecycle",
  "related-concurrent",
  "related-dedup",
] as const;

const searchCounts = new Map<string, number>();
const relatedCounts = new Map<string, number>();

function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countRecord(counts: Map<string, number>) {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

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

const dedupRelated = publicRelatedPostsResponseSchema.parse({
  items: [
    { ...relatedCard(4), title: "主文章不应出现在相关阅读", slug: "related-dedup" },
    relatedCard(1),
    { ...relatedCard(1), title: "重复项不应覆盖第一次出现" },
    relatedCard(2),
  ],
});

const emptyRelated = publicRelatedPostsResponseSchema.parse({ items: [] });
const oneRelated = publicRelatedPostsResponseSchema.parse({ items: [relatedCard(1)] });
const twoRelated = publicRelatedPostsResponseSchema.parse({ items: [relatedCard(1), relatedCard(2)] });

const structuredDataDetail = publicPostDetailSchema.parse({
  title: 'Strict public </script><span data-jsonld-injected="true">never</span> title',
  summary: "A public summary with line\u2028separator and paragraph\u2029separator.",
  slug: "structured-data-hostile",
  publishedAt: "2026-09-04T08:00:00.000Z",
  status: "published",
  category: { name: "CATEGORY_EXCLUDED_SENTINEL", slug: "structured-data-category" },
  tags: [{ name: "TAG_EXCLUDED_SENTINEL", slug: "structured-data-tag" }],
  seoDescription: "SEO_DESCRIPTION_EXCLUDED_SENTINEL",
  renderedHtml: "<p>RENDERED_HTML_EXCLUDED_SENTINEL</p>",
  toc: [{ id: "structured-data-heading", depth: 2, text: "TOC_EXCLUDED_SENTINEL" }],
  cover: null,
});

const structuredDataMalformed = {
  ...structuredDataDetail,
  slug: "structured-data-malformed",
  markdown: "RAW_MARKDOWN_PRIVATE_SENTINEL",
  internalPath: "INTERNAL_PATH_PRIVATE_SENTINEL",
  administrativeState: "ADMINISTRATIVE_STATE_PRIVATE_SENTINEL",
};

const matrixResults = Array.from({ length: 11 }, (_, index) => ({
  title: `矩阵结果 ${String(index + 1).padStart(2, "0")}`,
  summary: index === 1 ? "" : `严格公开矩阵摘要 ${index + 1}`,
  slug: `matrix-result-${index + 1}`,
  publishedAt: `2026-06-${String(20 - index).padStart(2, "0")}T04:00:00.000Z`,
  status: "published" as const,
  category: index % 2 === 0 ? { name: "矩阵分类", slug: "matrix-category" } : null,
  tags: [{ name: `矩阵标签${index + 1}`, slug: `matrix-tag-${index + 1}` }],
}));

const hostileQuery = "hostile %ZZ + & 中文 e\u0301 😀".normalize("NFC");
const hostileResult = {
  title: '<script>alert("escaped")</script>',
  summary: "",
  slug: "hostile-safe-result",
  publishedAt: "2026-06-01T04:00:00.000Z",
  status: "published" as const,
  category: { name: `超长分类${"分类".repeat(60)}`, slug: "hostile-category" },
  tags: [{ name: `LongTag${"WithoutBreakOpportunity".repeat(12)}`, slug: "hostile-tag" }],
};

const responsiveResults = Array.from({ length: 11 }, (_, index) => ({
  title: index === 0
    ? "响应式长标题 LongResponsiveTitleWithoutBreakOpportunity".repeat(4)
    : `响应式搜索结果 ${index + 1}`,
  summary: index === 1 ? "" : `保持相同字段顺序的公开摘要 ${index + 1}`,
  slug: `responsive-result-${index + 1}`,
  publishedAt: `2026-07-${String(20 - index).padStart(2, "0")}T04:00:00.000Z`,
  status: "published" as const,
  category: { name: `超长分类名称${"分类".repeat(index === 0 ? 20 : 1)}`, slug: `responsive-category-${index + 1}` },
  tags: [{ name: `LongTagWithoutBreakOpportunity${index + 1}`, slug: `responsive-tag-${index + 1}` }],
}));

const distribution = publicDistributionSchema.parse({
  articles: [{
    title: publishedResult.title,
    summary: publishedResult.summary,
    slug: publishedResult.slug,
    publishedAt: publishedResult.publishedAt,
    updatedAt: "2026-08-17T05:00:00.000Z",
    category: publishedResult.category,
    tags: publishedResult.tags,
  }],
  categories: [{ name: "前端工程", slug: "frontend", articleCount: 1 }],
  tags: [{ name: "React", slug: "react", articleCount: 1 }],
  about: null,
});

function searchBody(query: string, page: number, items: typeof matrixResults, totalItems = items.length) {
  const totalPages = Math.ceil(totalItems / 10);
  return publicSearchResponseSchema.parse({
    state: "results",
    query,
    page,
    pageSize: 10,
    totalItems,
    totalPages,
    items,
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method !== "GET") return json(response, 405, { error: "method_not_allowed" });
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/control/discovery") {
    const mode = url.searchParams.get("mode");
    if (mode === "reset") {
      searchCounts.clear();
      relatedCounts.clear();
      return json(response, 200, { search: {}, related: {} });
    }
    if (mode === "stats") {
      return json(response, 200, { search: countRecord(searchCounts), related: countRecord(relatedCounts) });
    }
    return json(response, 400, { error: "unknown_discovery_control" });
  }
  if (url.pathname === "/public/distribution") return json(response, 200, distribution);
  if (url.pathname === "/public/articles" && url.searchParams.get("page") === "1") {
    return json(response, 200, {
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      items: [],
    });
  }

  if (url.pathname === "/public/articles/structured-data-hostile") return json(response, 200, structuredDataDetail);
  if (url.pathname === "/public/articles/structured-data-malformed") return json(response, 200, structuredDataMalformed);

  const articleMatch = /^\/public\/articles\/([^/]+)$/.exec(url.pathname);
  if (articleMatch && relatedSlugs.includes(articleMatch[1] as (typeof relatedSlugs)[number])) {
    return json(response, 200, articleDetail(articleMatch[1] as (typeof relatedSlugs)[number]));
  }

  const relatedMatch = /^\/public\/articles\/([^/]+)\/related$/.exec(url.pathname);
  const relatedSlug = relatedMatch?.[1];
  if (relatedSlug) increment(relatedCounts, relatedSlug);
  if (relatedSlug === "related-populated") return json(response, 200, populatedRelated);
  if (relatedSlug === "related-one") return json(response, 200, oneRelated);
  if (relatedSlug === "related-zero") return json(response, 200, emptyRelated);
  if (relatedSlug === "related-concurrent") return json(response, 200, twoRelated);
  if (relatedSlug === "related-dedup") return json(response, 200, dedupRelated);
  if (relatedSlug === "related-lifecycle") {
    return json(response, 200, (relatedCounts.get(relatedSlug) ?? 0) === 1 ? oneRelated : emptyRelated);
  }
  if (relatedSlug === "related-failure") {
    return json(response, 503, { error: "temporary related failure" });
  }
  if (relatedSlug === "related-malformed") {
    return json(response, 200, { items: [{ title: "incomplete related object" }] });
  }
  if (relatedSlug === "related-refusal") {
    response.socket?.destroy();
    return;
  }
  if (relatedSlug === "structured-data-hostile") return json(response, 200, emptyRelated);

  if (url.pathname === "/public/search") {
    const query = (url.searchParams.get("q") ?? "").normalize("NFC").trim();
    const page = Number(url.searchParams.get("page") ?? "1");
    increment(searchCounts, query);

    if (query === "http-400" || query === "http-500" || query === "http-503") {
      return json(response, Number(query.slice(5)), { error: "opaque fixture failure" });
    }
    if (query === "refusal") {
      response.socket?.destroy();
      return;
    }
    if (query === "malformed-json") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end('{"state":');
      return;
    }
    if (query === "malformed-dto") {
      return json(response, 200, {
        state: "results",
        query,
        page,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        items: [{
          ...matrixResults[0],
          draftTitle: "DRAFT_PRIVATE_SENTINEL",
          unpublishedBody: "UNPUBLISHED_PRIVATE_SENTINEL",
          deletedBody: "DELETED_PRIVATE_SENTINEL",
          markdown: "RAW_MARKDOWN_PRIVATE_SENTINEL",
          stack: "STACK_PRIVATE_SENTINEL",
        }],
      });
    }
    if (query === "contradictory-totals") {
      return json(response, 200, { state: "results", query, page, pageSize: 10, totalItems: 11, totalPages: 1, items: [matrixResults[0]] });
    }

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
      return json(response, 200, publicSearchResponseSchema.parse({
        state: "results",
        query,
        page,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        items: [publishedResult],
      }));
    }

    if (query === "matrix-one") return json(response, 200, searchBody(query, page, matrixResults.slice(0, 1), 1));
    if (query === "matrix-ten") return json(response, 200, searchBody(query, page, matrixResults.slice(0, 10), 10));
    if (query === "matrix-eleven") {
      if (page === 1) return json(response, 200, searchBody(query, page, matrixResults.slice(0, 10), 11));
      if (page === 2) return json(response, 200, searchBody(query, page, matrixResults.slice(10), 11));
      return json(response, 200, publicSearchResponseSchema.parse({
        state: "page_out_of_range", query, page, pageSize: 10, totalItems: 11, totalPages: 2, items: [],
      }));
    }
    if (query === hostileQuery) return json(response, 200, searchBody(query, page, [hostileResult], 1));

    if (query === "响应式" && (page === 1 || page === 2)) {
      return json(response, 200, publicSearchResponseSchema.parse({
        state: "results",
        query,
        page,
        pageSize: 10,
        totalItems: responsiveResults.length,
        totalPages: 2,
        items: page === 1 ? responsiveResults.slice(0, 10) : responsiveResults.slice(10),
      }));
    }

    return json(response, 200, publicSearchResponseSchema.parse({
      state: "no_results",
      query,
      page,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      items: [],
    }));
  }

  return json(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
