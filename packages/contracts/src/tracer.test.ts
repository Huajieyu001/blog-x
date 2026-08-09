import assert from "node:assert/strict";
import test from "node:test";
import { loginInputSchema } from "./auth.js";
import { mediaUsageReferenceSchema } from "./media.js";
import { publishInputSchema, publicArticleDetailSchema, publicArticleListSchema } from "./tracer.js";

test("login input requires bounded username and password fields", () => {
  assert.equal(loginInputSchema.safeParse({ username: "admin", password: "secret" }).success, true);
  const invalid = loginInputSchema.safeParse({ username: "", password: "" });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(invalid.error.issues.map((issue) => issue.path.join(".")), ["username", "password"]);
});

test("publish input rejects malformed wire fields", () => {
  assert.equal(publishInputSchema.safeParse({ title: "Post", slug: "post", markdown: "# Post" }).success, true);
  const invalid = publishInputSchema.safeParse({ title: "", slug: "Not a slug", markdown: "" });
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(invalid.error.issues.map((issue) => issue.path.join(".")), ["title", "slug", "markdown"]);
});

test("public response schemas allowlist only public wire fields", () => {
  assert.equal(publicArticleListSchema.safeParse([{ title: "Post", slug: "post", publishedAt: "2026-08-06T00:00:00.000Z" }]).success, true);
  assert.equal(publicArticleDetailSchema.safeParse({ title: "Post", slug: "post", publishedAt: "2026-08-06T00:00:00.000Z", html: "<h1>Post</h1>" }).success, true);
  assert.equal(publicArticleDetailSchema.safeParse({ title: "Post", slug: "post", publishedAt: "2026-08-06T00:00:00.000Z", html: "<h1>Post</h1>", passwordHash: "never" }).success, false);
});

test("purposeful media usage requires alt text while decorative media clears that requirement", () => {
  const reference = {
    id: "00000000-0000-4000-8000-000000000001",
    url: "/media/00000000-0000-4000-8000-000000000001",
    width: 120,
    height: 40,
    mimeType: "image/png",
    alt: "",
    decorative: false,
  };
  assert.equal(mediaUsageReferenceSchema.safeParse(reference).success, false);
  assert.equal(mediaUsageReferenceSchema.safeParse({ ...reference, alt: "架构图" }).success, true);
  assert.equal(mediaUsageReferenceSchema.safeParse({ ...reference, decorative: true }).success, true);
});
