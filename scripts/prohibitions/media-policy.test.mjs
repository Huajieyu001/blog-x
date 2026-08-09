import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const cleanFixture = join(root, "scripts/fixtures/prohibitions/external-published-media-clean.json");
const mediaPath = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function subject() {
  return JSON.parse(await readFile(process.env.GSD_PROHIB_SUBJECT ?? cleanFixture, "utf8"));
}

test("published media policy permits only exact same-origin media while preserving ordinary HTTPS anchors", async () => {
  const value = await subject();
  assert.deepEqual(Object.keys(value).sort(), ["coverUrl", "externalAnchor", "format", "images", "legacyMediaReview", "version"]);
  assert.equal(value.format, "blog-x-media-policy");
  assert.equal(value.version, 1);
  assert.ok(Array.isArray(value.images) && value.images.length > 0, "the descriptor must exercise at least one image source");
  assert.ok(value.images.every((image) => typeof image === "string" && mediaPath.test(image)), "published image paths must be canonical same-origin media paths");
  assert.equal(value.coverUrl, "", "new authoring cannot retain an arbitrary cover URL");
  assert.equal(value.legacyMediaReview, "clear");
  assert.match(value.externalAnchor, /^https:\/\/docs\.example\.test\//, "ordinary external documentation links remain distinct from image sources");

  const [policy, renderer, nextConfig] = await Promise.all([
    readFile(join(root, "apps/api/src/content/media-reference-policy.ts"), "utf8"),
    readFile(join(root, "apps/api/src/content/markdown.ts"), "utf8"),
    readFile(join(root, "apps/web/next.config.ts"), "utf8"),
  ]);
  assert.match(policy, /mediaPathPattern = \/\^/);
  assert.match(policy, /\[0-9a-f\]\{12\}/);
  assert.match(policy, /export function isMediaPath/);
  assert.doesNotMatch(policy, /\bfetch\s*\(/);
  assert.match(renderer, /constrainImageSources/);
  assert.match(renderer, /isMediaPath\(node\.properties\?\.src\)/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /img-src 'self'/);
});
