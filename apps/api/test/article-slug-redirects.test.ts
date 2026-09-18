import assert from "node:assert/strict";
import test from "node:test";
import { publicArticleRedirectResponseSchema } from "@blog-x/contracts";

test("a public article redirect response has one canonical root-relative location", () => {
  assert.deepEqual(
    publicArticleRedirectResponseSchema.parse({ location: "/public/articles/current-slug" }),
    { location: "/public/articles/current-slug" },
  );
});
