import type { ArticleAction, ArticleStatus } from "@blog-x/contracts";

export const articleStatuses = ["draft", "published", "unpublished", "deleted"] as const;
export const articleActions = ["edit", "publish", "unpublish", "republish", "delete"] as const;

export type StoredArticleState = (typeof articleStatuses)[number];
export type ArticleStateAction = (typeof articleActions)[number];
export type ArticleTransitionTarget = StoredArticleState | null;

export const articleState = {
  draft: { edit: "draft", publish: "published", unpublish: null, republish: null, delete: "deleted" },
  published: { edit: "published", publish: null, unpublish: "unpublished", republish: null, delete: "deleted" },
  unpublished: { edit: "unpublished", publish: null, unpublish: null, republish: "published", delete: "deleted" },
  deleted: { edit: null, publish: null, unpublish: null, republish: null, delete: null },
} as const satisfies Record<StoredArticleState, Record<ArticleStateAction, ArticleTransitionTarget>>;

export function resolveArticleTransition(status: StoredArticleState, action: ArticleStateAction) {
  return articleState[status][action];
}

export function resolveRetainedTransition(status: ArticleStatus, action: ArticleAction | "edit") {
  return resolveArticleTransition(status, action);
}
