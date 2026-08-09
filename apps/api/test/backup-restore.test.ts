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

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function authority(value: ReturnType<typeof portableExportManifestSchema.parse>) {
  const { exportedAt: _exportedAt, ...retained } = value;
  return retained;
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
    assert.deepEqual(authority(actual), authority(expected), "raw Markdown, lifecycle/nullability, taxonomy, About, cover, and media metadata must be identical");
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
