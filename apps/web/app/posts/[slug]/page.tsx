import { publicArticleDetailSchema, type PublicArticleDetail } from "@blog-x/contracts";
import { notFound } from "next/navigation";

const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";

async function getPublicArticle(slug: string): Promise<PublicArticleDetail | null> {
  try {
    const response = await fetch(`${apiOrigin}/public/articles/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = publicArticleDetailSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function PublicArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = await getPublicArticle((await params).slug);
  if (!article) notFound();
  return <main><a href="/">Blog X</a><article><h1>{article.title}</h1><div dangerouslySetInnerHTML={{ __html: article.html }} /></article></main>;
}
