import assert from "node:assert/strict";
import test from "node:test";
import { createPublicRepository, hydratePublicDistributionArticles } from "../src/content/public-repository.js";

const articleOne = {
  id: "40000000-0000-4000-8000-000000000001",
  title: "Newest article",
  summary: "Newest summary",
  slug: "newest-article",
  publishedAt: new Date("2026-09-01T12:00:00.000Z"),
  updatedAt: new Date("2026-09-02T12:00:00.000Z"),
  categoryId: "50000000-0000-4000-8000-000000000001",
  categoryName: "Engineering",
  categorySlug: "engineering",
};

const articleTwo = {
  id: "40000000-0000-4000-8000-000000000002",
  title: "Older article",
  summary: "Older summary",
  slug: "older-article",
  publishedAt: new Date("2026-08-01T12:00:00.000Z"),
  updatedAt: new Date("2026-08-02T12:00:00.000Z"),
  categoryId: null,
  categoryName: null,
  categorySlug: null,
};

test("distribution hydration loads tags once and preserves article and tag order", async () => {
  let tagQueries = 0;
  const tx = {
    select() {
      tagQueries += 1;
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: async () => [
                { articleId: articleOne.id, id: "60000000-0000-4000-8000-000000000001", name: "Alpha", slug: "alpha" },
                { articleId: articleOne.id, id: "60000000-0000-4000-8000-000000000002", name: "Beta", slug: "beta" },
                { articleId: articleTwo.id, id: "60000000-0000-4000-8000-000000000003", name: "Gamma", slug: "gamma" },
              ],
            }),
          }),
        }),
      };
    },
  } as never;

  const hydrated = await hydratePublicDistributionArticles(tx, [articleOne, articleTwo]);

  assert.equal(tagQueries, 1);
  assert.deepEqual(hydrated, [
    {
      title: "Newest article",
      summary: "Newest summary",
      slug: "newest-article",
      publishedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:00.000Z",
      category: { name: "Engineering", slug: "engineering" },
      tags: [{ name: "Alpha", slug: "alpha" }, { name: "Beta", slug: "beta" }],
    },
    {
      title: "Older article",
      summary: "Older summary",
      slug: "older-article",
      publishedAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-02T12:00:00.000Z",
      category: null,
      tags: [{ name: "Gamma", slug: "gamma" }],
    },
  ]);
});

test("distribution hydration does not query tags for no articles", async () => {
  const tx = {
    select() {
      throw new Error("empty distribution must not load tags");
    },
  } as never;

  assert.deepEqual(await hydratePublicDistributionArticles(tx, []), []);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function publicDetailDb({ article, tags, media, started }: {
  article: Record<string, unknown>;
  tags: Promise<Array<{ name: string; slug: string }>>;
  media: Promise<Array<{ id: string; width: number; height: number; mimeType: string }>>;
  started: string[];
}) {
  return {
    select(selection: Record<string, unknown>) {
      if ("markdown" in selection) {
        return {
          from: () => ({
            leftJoin: () => ({
              where: () => ({ limit: async () => [article] }),
            }),
          }),
        };
      }
      if ("mimeType" in selection) {
        started.push("media");
        return { from: () => ({ where: () => ({ limit: () => media }) }) };
      }
      started.push("tags");
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({ orderBy: () => tags }),
          }),
        }),
      };
    },
  } as never;
}

const detailArticle = {
  id: "40000000-0000-4000-8000-000000000003",
  title: "Detailed article",
  summary: "Detailed summary",
  seoDescription: "Search summary",
  slug: "detailed-article",
  markdown: "# Detailed article",
  publishedAt: new Date("2026-09-03T12:00:00.000Z"),
  status: "published",
  categoryId: "50000000-0000-4000-8000-000000000001",
  categoryName: "Engineering",
  categorySlug: "engineering",
  coverMediaId: "70000000-0000-4000-8000-000000000001",
  coverAlt: "A precise cover",
  coverDecorative: false,
};

test("detail associations start concurrently, omit absent media, and preserve exact projections", async () => {
  const tagRead = deferred<Array<{ name: string; slug: string }>>();
  const mediaRead = deferred<Array<{ id: string; width: number; height: number; mimeType: string }>>();
  const started: string[] = [];
  const covered = createPublicRepository(publicDetailDb({ article: detailArticle, tags: tagRead.promise, media: mediaRead.promise, started }));
  let settled = false;
  const detailPromise = covered.findDetailBySlug(detailArticle.slug).then((value) => {
    settled = true;
    return value;
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["tags", "media"]);
  tagRead.resolve([{ name: "Alpha", slug: "alpha" }, { name: "Beta", slug: "beta" }]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  mediaRead.resolve([{ id: detailArticle.coverMediaId, width: 1200, height: 630, mimeType: "image/webp" }]);
  assert.deepEqual(await detailPromise, {
    kind: "article",
    article: {
      title: "Detailed article",
      summary: "Detailed summary",
      seoDescription: "Search summary",
      slug: "detailed-article",
      markdown: "# Detailed article",
      status: "published",
      category: { name: "Engineering", slug: "engineering" },
      tags: [{ name: "Alpha", slug: "alpha" }, { name: "Beta", slug: "beta" }],
      publishedAt: "2026-09-03T12:00:00.000Z",
      cover: { id: detailArticle.coverMediaId, width: 1200, height: 630, mimeType: "image/webp", url: `/media/${detailArticle.coverMediaId}`, alt: "A precise cover", decorative: false },
    },
  });

  const uncoveredStarted: string[] = [];
  const uncovered = createPublicRepository(publicDetailDb({
    article: { ...detailArticle, coverMediaId: null },
    tags: Promise.resolve([{ name: "Alpha", slug: "alpha" }]),
    media: new Promise(() => {}),
    started: uncoveredStarted,
  }));
  const uncoveredDetail = await uncovered.findDetailBySlug(detailArticle.slug);
  assert.deepEqual(uncoveredStarted, ["tags"]);
  assert.equal(uncoveredDetail?.kind, "article");
  if (uncoveredDetail?.kind === "article") assert.equal("cover" in uncoveredDetail.article, false);
});
