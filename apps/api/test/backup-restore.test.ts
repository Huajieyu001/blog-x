import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { portableExportManifestSchema } from "@blog-x/contracts";
import { createExportRepository } from "../src/content/export-repository.js";
import * as schema from "../src/db/schema.js";

const databaseUrl = process.env.BACKUP_RESTORE_TEST_DATABASE_URL;
const expectedRoot = process.env.BACKUP_RESTORE_EXPECTED_ROOT;
const mediaRoot = process.env.MEDIA_ROOT;
const phase5LegacyArticleId = process.env.PHASE5_LEGACY_ARTICLE_ID;
const expectedAnalyticsRaw = process.env.BACKUP_RESTORE_EXPECTED_ANALYTICS;

type AggregateRow = {
  articleId: string;
  day: string;
  totalPv: number;
  directPv: number;
  internalPv: number;
  searchPv: number;
  socialPv: number;
  externalPv: number;
};

function parseExpectedAnalytics(value: string | undefined): AggregateRow[] | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  assert.ok(Array.isArray(parsed), "expected analytics authority must be a row array");
  return parsed.map((row) => {
    assert.ok(row && typeof row === "object" && !Array.isArray(row), "expected analytics row must be an object");
    const value = row as Record<string, unknown>;
    assert.deepEqual(Object.keys(value).sort(), ["articleId", "day", "directPv", "externalPv", "internalPv", "searchPv", "socialPv", "totalPv"]);
    for (const key of ["articleId", "day"]) assert.equal(typeof value[key], "string");
    for (const key of ["totalPv", "directPv", "internalPv", "searchPv", "socialPv", "externalPv"]) assert.equal(typeof value[key], "number");
    return value as AggregateRow;
  }).sort((left, right) => left.articleId.localeCompare(right.articleId) || left.day.localeCompare(right.day));
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function authority(value: ReturnType<typeof portableExportManifestSchema.parse>) {
  const { exportedAt: _exportedAt, ...retained } = value;
  return {
    ...retained,
    articles: retained.articles.map(({ scheduledAt: _scheduledAt, scheduledByAdministratorId: _scheduledByAdministratorId, ...article }) => article),
  };
}

test("restored database authority and every media byte equal the complete source backup", async () => {
  if (!databaseUrl || !expectedRoot || !mediaRoot) throw new Error("managed restored database, backup, and media roots are required");
  const expected = portableExportManifestSchema.parse(JSON.parse(await readFile(join(expectedRoot, "portable-export-v1.json"), "utf8")));
  const inventory = JSON.parse(await readFile(join(expectedRoot, "config/inventory.json"), "utf8")) as {
    media: Array<{ id: string; sourcePath: string; derivativePath: string; sourceSha256: string; derivativeSha256: string }>;
  };
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  try {
    const actual = portableExportManifestSchema.parse(await createExportRepository(db).archive());
    const expectedAnalytics = parseExpectedAnalytics(expectedAnalyticsRaw);
    if (expectedAnalytics) {
      const restoredAnalytics = (await db.select().from(schema.articleDailyViews)).map((row) => ({
        articleId: row.articleId,
        day: row.day,
        totalPv: row.totalPv,
        directPv: row.directPv,
        internalPv: row.internalPv,
        searchPv: row.searchPv,
        socialPv: row.socialPv,
        externalPv: row.externalPv,
      })).sort((left, right) => left.articleId.localeCompare(right.articleId) || left.day.localeCompare(right.day));
      assert.deepEqual(restoredAnalytics, expectedAnalytics, "restored daily aggregate rows must equal the independently captured backup authority");
    }
    assert.deepEqual(authority(actual), authority(expected), "raw Markdown, lifecycle/nullability, taxonomy, About, cover, and media metadata must be identical");
    const scheduledSource = expected.articles.find((article) => article.scheduledAt != null);
    if (scheduledSource) {
      assert.ok(scheduledSource.scheduledByAdministratorId, "source backup must retain the scheduling administrator");
      const scheduledRestored = actual.articles.find((article) => article.id === scheduledSource.id);
      assert.deepEqual(scheduledRestored?.scheduledAt, scheduledSource.scheduledAt, "restored pending schedule must retain its exact UTC instant");
      assert.deepEqual(scheduledRestored?.scheduledByAdministratorId, scheduledSource.scheduledByAdministratorId, "restored pending schedule must retain its administrator attribution");
    }
    if (phase5LegacyArticleId) {
      const sourceLegacy = expected.articles.find((article) => article.id === phase5LegacyArticleId);
      const restoredLegacy = actual.articles.find((article) => article.id === phase5LegacyArticleId);
      assert.ok(sourceLegacy, "the named Phase 5 legacy source must be included in the backup");
      assert.deepEqual(restoredLegacy, sourceLegacy, "restored legacy raw Markdown, historic cover, and review state must remain byte-identical");
      assert.equal(restoredLegacy.legacyMediaReview, "review_required");
    }
    const categoryIds = new Set(actual.categories.map((item) => item.id));
    const tagIds = new Set(actual.tags.map((item) => item.id));
    const mediaIds = new Set(actual.media.map((item) => item.id));
    for (const article of actual.articles) {
      assert.ok(!article.categoryId || categoryIds.has(article.categoryId), "restored category reference must not dangle");
      assert.ok(!article.coverMediaId || mediaIds.has(article.coverMediaId), "restored cover reference must not dangle");
      for (const tagId of article.tagIds) assert.ok(tagIds.has(tagId), "restored tag reference must not dangle");
    }
    assert.deepEqual(new Set(inventory.media.map((item) => item.id)), mediaIds);
    for (const item of inventory.media) {
      const sourceRelative = item.sourcePath.replace(/^media\//, "");
      const derivativeRelative = item.derivativePath.replace(/^media\//, "");
      assert.equal(sha256(await readFile(join(mediaRoot, sourceRelative))), item.sourceSha256, `source bytes changed for ${item.id}`);
      assert.equal(sha256(await readFile(join(mediaRoot, derivativeRelative))), item.derivativeSha256, `derivative bytes changed for ${item.id}`);
    }
  } finally {
    await pool.end();
  }
});
