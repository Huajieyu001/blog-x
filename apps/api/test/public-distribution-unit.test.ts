import assert from "node:assert/strict";
import test from "node:test";
import { hydratePublicDistributionArticles } from "../src/content/public-repository.js";

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
