import { notFound } from "next/navigation";
import { publicArticleDetailSchema, publicArticleListSchema, type PublicArticleDetail, type PublishedArticle } from "@blog-x/contracts";
import TracerAdmin from "../TracerAdmin";

const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";
async function api<T>(path: string, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }): Promise<T | null> {
  try {
    const response = await fetch(`${apiOrigin}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  if (path.length === 0) {
    const articles = await api<PublishedArticle[]>("/public/articles", publicArticleListSchema) ?? [];
    return <main><h1>Blog X</h1><nav><a href="/admin">管理</a></nav><ul>{articles.map((article) => <li key={article.slug}><a href={`/posts/${article.slug}`}>{article.title}</a></li>)}</ul></main>;
  }
  if (path.length === 1 && path[0] === "admin") return <TracerAdmin />;
  if (path.length === 2 && path[0] === "posts") {
    const article = await api<PublicArticleDetail>(`/public/articles/${encodeURIComponent(path[1])}`, publicArticleDetailSchema);
    if (!article) return notFound();
    return <main><a href="/">Blog X</a><article><h1>{article.title}</h1><div dangerouslySetInnerHTML={{ __html: article.html ?? "" }} /></article></main>;
  }
  notFound();
}
