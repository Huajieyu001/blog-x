import assert from "node:assert/strict";
import test from "node:test";
import { loginInputSchema } from "./auth.js";
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
