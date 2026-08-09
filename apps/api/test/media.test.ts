import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import sharp from "sharp";
import { buildApp } from "../src/app.js";
import { renderMarkdown } from "../src/content/markdown.js";
import { seedAdministrator } from "../src/db/seed-admin.js";
import { administrators, media, sessions } from "../src/db/schema.js";
import { processMedia } from "../src/media/processor.js";
import { LocalMediaStorage } from "../src/media/storage.js";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const origin = "http://127.0.0.1:3100";

function sessionCookie(setCookie: string) {
  const match = /^blog_x_session=([^;]+)/.exec(setCookie);
  assert.ok(match, "login must issue a session cookie");
  return `blog_x_session=${match[1]}`;
}

function multipart(parts: Array<{ name: string; filename?: string; mimeType?: string; value: Buffer | string }>) {
  const boundary = `blog-x-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ""}\r\n${part.mimeType ? `Content-Type: ${part.mimeType}\r\n` : ""}\r\n`));
    chunks.push(typeof part.value === "string" ? Buffer.from(part.value) : part.value);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function png(width = 32, height = 18) {
  return sharp({ create: { width, height, channels: 4, background: { r: 33, g: 88, b: 77, alpha: 1 } } }).png().toBuffer();
}

test("processor rejects mismatches and pixel bombs while producing a bounded metadata-free derivative", async () => {
  const small = await png(32, 18);
  const processedSmall = await processMedia(small, "image/png");
  assert.deepEqual({ width: processedSmall.width, height: processedSmall.height, mimeType: processedSmall.mimeType }, { width: 32, height: 18, mimeType: "image/png" });

  const large = await png(3000, 1000);
  const processedLarge = await processMedia(large, "image/png");
  assert.deepEqual({ width: processedLarge.width, height: processedLarge.height }, { width: 2400, height: 800 });
  const derivativeMetadata = await sharp(processedLarge.derivative).metadata();
  assert.equal(derivativeMetadata.exif, undefined);
  assert.equal(derivativeMetadata.icc, undefined);

  await assert.rejects(processMedia(small, "image/jpeg"), /invalid media/i, "declared MIME must match magic and decode result");
  await assert.rejects(processMedia(Buffer.from("<svg onload=alert(1)></svg>"), "image/png"), /invalid media/i, "SVG polyglot content is never decoded");
  await assert.rejects(processMedia(Buffer.from("GIF89a", "ascii"), "image/gif"), /invalid media/i, "GIF and animation inputs are unsupported");
  const pixelBomb = await png(6500, 6500);
  await assert.rejects(processMedia(pixelBomb, "image/png"), /invalid media/i, "decoded pixel limits block decompression bombs");
});

test("local storage accepts only generated exact keys and blocks traversal", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "blog-x-media-storage-"));
  const storage = new LocalMediaStorage(root);
  context.after(async () => storage.removeRoot());
  await storage.putSource("source/00000000-0000-4000-8000-000000000001.bin", Buffer.from("source"));
  await storage.putDerivative("derivative/00000000-0000-4000-8000-000000000001.png", Buffer.from("derivative"));
  assert.equal((await storage.openDerivative("derivative/00000000-0000-4000-8000-000000000001.png")).toString(), "derivative");
  await assert.rejects(storage.openDerivative("../secret"), /invalid storage key/i);
  await assert.rejects(storage.putSource("source/../../secret.bin", Buffer.from("bad")), /invalid storage key/i);
});

test("authenticated upload stores protected source and serves only the immutable derivative", async (context) => {
  if (!databaseUrl) {
    context.skip("AUTH_TEST_DATABASE_URL must name a disposable migrated PostgreSQL database");
    return;
  }

  const mediaRoot = await mkdtemp(join(tmpdir(), "blog-x-media-api-"));
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema: { administrators, media, sessions } });
  await pool.query("truncate table sessions, article_tags, articles, media, administrators cascade");
  context.after(async () => {
    await pool.query("truncate table sessions, article_tags, articles, media, administrators cascade");
    await pool.end();
    await new LocalMediaStorage(mediaRoot).removeRoot();
  });

  const username = `media-${Date.now()}`;
  const password = "media-test-password";
  await seedAdministrator(db, { username, password });
  const app = await buildApp({ publicOrigin: origin, mediaRoot });
  context.after(async () => app.close());

  const login = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { username, password } });
  const cookie = sessionCookie(String(login.headers["set-cookie"]));
  const image = await png();
  const upload = multipart([{ name: "file", filename: "../../private-name.png", mimeType: "image/png", value: image }]);

  assert.equal((await app.inject({ method: "POST", url: "/admin/media", headers: { origin, "content-type": upload.contentType }, payload: upload.body })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/admin/media", headers: { origin: "https://wrong.invalid", cookie, "content-type": upload.contentType }, payload: upload.body })).statusCode, 403);

  const uploaded = await app.inject({ method: "POST", url: "/admin/media", headers: { origin, cookie, "content-type": upload.contentType }, payload: upload.body });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  assert.deepEqual(Object.keys(uploaded.json()).sort(), ["alt", "decorative", "height", "id", "mimeType", "url", "width"]);
  assert.match(uploaded.json().id, /^[0-9a-f-]{36}$/);
  assert.equal(uploaded.json().url, `/media/${uploaded.json().id}`);
  assert.deepEqual({ width: uploaded.json().width, height: uploaded.json().height, alt: uploaded.json().alt, decorative: uploaded.json().decorative }, { width: 32, height: 18, alt: "", decorative: false });
  assert.doesNotMatch(JSON.stringify(uploaded.json()), /private-name|source|derivative|mediaRoot|\.\./i);

  const record = (await pool.query("select source_key, derivative_key, source_mime_type, derivative_mime_type from media where id = $1", [uploaded.json().id])).rows[0];
  assert.match(record.source_key, /^source\/[0-9a-f-]{36}\.bin$/);
  assert.match(record.derivative_key, /^derivative\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/);
  assert.equal(record.source_mime_type, "image/png");
  assert.equal(record.derivative_mime_type, "image/png");
  assert.doesNotMatch(`${record.source_key}${record.derivative_key}`, /private-name|\.\./);
  assert.equal((await readdir(join(mediaRoot, "source"))).length, 1);
  assert.equal((await readdir(join(mediaRoot, "derivative"))).length, 1);
  assert.deepEqual(await readFile(join(mediaRoot, record.source_key)), image, "protected source remains API-owned and byte-exact");

  const derivative = await app.inject({ method: "GET", url: uploaded.json().url });
  assert.equal(derivative.statusCode, 200);
  assert.match(String(derivative.headers["content-type"]), /^image\/png/);
  assert.equal(derivative.headers["x-content-type-options"], "nosniff");
  assert.equal(derivative.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.deepEqual({ width: (await sharp(derivative.rawPayload).metadata()).width, height: (await sharp(derivative.rawPayload).metadata()).height }, { width: 32, height: 18 });
  assert.equal((await app.inject({ method: "GET", url: `/media/${uploaded.json().id}/source` })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/media/../../etc/passwd" })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/media/not-a-uuid" })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/media/00000000-0000-4000-8000-000000000099" })).statusCode, 404);

  const invalidCases = [
    multipart([{ name: "file", filename: "mismatch.png", mimeType: "image/jpeg", value: image }]),
    multipart([{ name: "file", filename: "polyglot.png", mimeType: "image/png", value: Buffer.concat([Buffer.from("<svg>"), image]) }]),
    multipart([{ name: "file", filename: "vector.svg", mimeType: "image/svg+xml", value: Buffer.from("<svg/>") }]),
    multipart([{ name: "file", filename: "animation.gif", mimeType: "image/gif", value: Buffer.from("GIF89a", "ascii") }]),
    multipart([{ name: "file", filename: "oversize.png", mimeType: "image/png", value: Buffer.alloc(5 * 1024 * 1024 + 1) }]),
    multipart([{ name: "file", filename: "one.png", mimeType: "image/png", value: image }, { name: "file", filename: "two.png", mimeType: "image/png", value: image }]),
    multipart([{ name: "metadata", value: "unexpected" }, { name: "file", filename: "one.png", mimeType: "image/png", value: image }]),
  ];
  for (const invalid of invalidCases) {
    const response = await app.inject({ method: "POST", url: "/admin/media", headers: { origin, cookie, "content-type": invalid.contentType }, payload: invalid.body });
    assert.ok([400, 413].includes(response.statusCode), response.body);
    assert.deepEqual(response.json(), { error: "invalid_media" });
  }
  assert.equal((await pool.query("select count(*)::int as count from media")).rows[0].count, 1, "invalid uploads leave no database record");
});

test("Markdown admits only exact same-origin media UUID paths", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const { html } = await renderMarkdown([
    `![valid](/media/${id})`,
    "![traversal](/media/../../secret)",
    "![query](/media/00000000-0000-4000-8000-000000000002?source=1)",
    "![fragment](/media/00000000-0000-4000-8000-000000000003#source)",
    "![data](data:image/png;base64,AAAA)",
    "![file](file:///tmp/source.png)",
  ].join("\n\n"));
  assert.match(html, new RegExp(`src="/media/${id}"`));
  assert.doesNotMatch(html, /\.\.|source=|#source|src="(?:data:|file:)/i);
});
