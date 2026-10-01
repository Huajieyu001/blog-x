import type { MetadataRoute } from "next";
import { publicPostPageSize } from "@blog-x/contracts";
import { getPublicDistribution } from "./lib/api";
import { publicUrl } from "./lib/site-metadata";

export const dynamic = "force-dynamic";

function pagedUrls(path: string, totalItems: number) {
  const totalPages = Math.ceil(totalItems / publicPostPageSize);
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => publicUrl(`${path}?page=${index + 2}`));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result = await getPublicDistribution();
  if (result.kind !== "ok") throw new Error("public content unavailable");
  const { articles, categories, tags, about } = result.data;
  return [
    { url: publicUrl("/") },
    ...pagedUrls("/", articles.length).map((url) => ({ url })),
    { url: publicUrl("/categories") },
    ...categories.flatMap((category) => [
      { url: publicUrl(`/categories/${encodeURIComponent(category.slug)}`) },
      ...pagedUrls(`/categories/${encodeURIComponent(category.slug)}`, category.articleCount).map((url) => ({ url })),
    ]),
    { url: publicUrl("/tags") },
    ...tags.flatMap((tag) => [
      { url: publicUrl(`/tags/${encodeURIComponent(tag.slug)}`) },
      ...pagedUrls(`/tags/${encodeURIComponent(tag.slug)}`, tag.articleCount).map((url) => ({ url })),
    ]),
    { url: publicUrl("/archives") },
    ...(about ? [{ url: publicUrl("/about"), lastModified: about.updatedAt }] : []),
    ...articles.map((article) => ({ url: publicUrl(`/posts/${encodeURIComponent(article.slug)}`), lastModified: article.updatedAt })),
  ];
}
