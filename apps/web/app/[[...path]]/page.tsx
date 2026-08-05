import { notFound } from "next/navigation";
import TracerAdmin from "../TracerAdmin";

const apiOrigin = process.env.INTERNAL_API_ORIGIN ?? "http://127.0.0.1:3001";
type Article = { title: string; slug: string; html?: string; publishedAt: string };
async function api<T>(path: string): Promise<T | null> {
  try { const response = await fetch(`${apiOrigin}${path}`, { cache: "no-store" }); return response.ok ? await response.json() as T : null; } catch { return null; }
}
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  if (path.length === 0) {
    const articles = await api<Article[]>("/public/articles") ?? [];
    return <main><h1>Blog X</h1><nav><a href="/admin">管理</a></nav><ul>{articles.map((article) => <li key={article.slug}><a href={`/posts/${article.slug}`}>{article.title}</a></li>)}</ul></main>;
  }
  if (path.length === 1 && path[0] === "admin") return <TracerAdmin />;
  if (path.length === 2 && path[0] === "posts") {
    const article = await api<Article>(`/public/articles/${encodeURIComponent(path[1])}`);
    if (!article) return notFound();
    return <main><a href="/">Blog X</a><article><h1>{article.title}</h1><div dangerouslySetInnerHTML={{ __html: article.html ?? "" }} /></article></main>;
  }
  notFound();
}
