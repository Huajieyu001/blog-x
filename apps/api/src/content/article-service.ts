import { adminPostSchema, type AdminPost, type AdminPostInput } from "@blog-x/contracts";
import type { AdminPostRepository } from "./admin-repository.js";

function serialize(post: NonNullable<Awaited<ReturnType<AdminPostRepository["findRetainedById"]>>>): AdminPost {
  return adminPostSchema.parse({
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  });
}

export function createArticleService(repository: AdminPostRepository) {
  async function createDraft(input: AdminPostInput) {
    const post = await repository.createDraft(input);
    if (!post) throw new Error("draft was not persisted");
    return serialize(post);
  }

  async function getDraft(id: string) {
    const post = await repository.findRetainedById(id);
    return post ? serialize(post) : null;
  }

  async function updateDraft(id: string, input: AdminPostInput) {
    const post = await repository.updateDraft(id, input);
    return post ? serialize(post) : null;
  }

  return { createDraft, getDraft, updateDraft };
}

export type ArticleService = ReturnType<typeof createArticleService>;
