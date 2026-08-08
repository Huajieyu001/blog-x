import { notFound } from "next/navigation";
import { publicPostPageQuerySchema } from "@blog-x/contracts";
import Pagination from "../../_components/Pagination";
import PostCard from "../../_components/PostCard";
import { getPublicTaxonomyPosts } from "../../lib/api";
import styles from "../../public.module.css";

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const parsed = publicPostPageQuerySchema.safeParse({ page: (await searchParams).page });
  if (!parsed.success) {
    return <main className={styles.page}><div className={styles.empty}><h1>页码无效</h1><p>请使用大于零的整数页码。</p><a href="/">返回最新文章</a></div></main>;
  }
  const result = await getPublicTaxonomyPosts("tags", slug, parsed.data.page);
  if (result === "not_found") notFound();
  if (!result) return <main className={styles.page}><div className={styles.empty}>暂时无法加载文章</div></main>;
  return <main className={styles.page}><section className={styles.feed}>
    <header className={styles.feedHeader}><p>标签</p><h1>{result.term.name}</h1><p>{result.posts.totalItems} 篇已发布文章</p></header>
    {result.posts.items.length
      ? result.posts.items.map((post, index) => <PostCard key={post.slug} post={post} position={(result.posts.page - 1) * 10 + index + 1} />)
      : <div className={styles.empty}><h2>这一页还没有文章</h2><p>可以返回最新文章继续阅读。</p><a href="/">返回最新文章</a></div>}
    <Pagination page={result.posts.page} totalPages={result.posts.totalPages} basePath={`/tags/${encodeURIComponent(slug)}`} />
  </section></main>;
}
