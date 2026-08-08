import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the disposable E2E fixture");

const pool = new Pool({ connectionString: databaseUrl });
try {
  await pool.query("truncate table articles cascade");
  const tiedPublication = new Date("2026-08-01T12:00:00.000Z");
  const olderPublication = new Date("2026-07-01T12:00:00.000Z");
  for (let index = 0; index < 12; index += 1) {
    await pool.query(
      "insert into articles (id, title, summary, slug, markdown, status, published_at) values ($1, $2, $3, $4, $5, 'published', $6)",
      [
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        `Editorial ${index + 1}`,
        `A concise summary for article ${index + 1}.`,
        `editorial-${index + 1}`,
        `# Editorial ${index + 1}`,
        index < 11 ? tiedPublication : olderPublication,
      ],
    );
  }
  await pool.query("insert into articles (title, summary, slug, markdown, status) values ('Private draft', 'must stay hidden', 'private-draft', 'secret', 'draft')");
  await pool.query("insert into articles (title, summary, slug, markdown, status, published_at) values ('Downline post', 'must stay hidden', 'downline-post', 'secret', 'unpublished', $1)", [tiedPublication]);
  await pool.query("insert into articles (title, summary, slug, markdown, status, published_at, deleted_at) values ('Deleted post', 'must stay hidden', 'deleted-post', 'secret', 'published', $1, now())", [tiedPublication]);
} finally {
  await pool.end();
}
