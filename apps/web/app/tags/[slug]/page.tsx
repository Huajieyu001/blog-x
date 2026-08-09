import { notFound } from "next/navigation";
import Link from "next/link";
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
    return <main className={styles.page}><div className={styles.empty}><h1>页码无效</h1><p>请使用大于零的整数页码。</p><Link href="/">返回最新文章</Link></div></main>;
  }
  const result = await getPublicTaxonomyPosts("tags", slug, parsed.data.page);
  if (result.kind === "not_found") notFound();
  if (result.kind === "upstream_error") throw new Error("public content unavailable");
  const data = result.data;
  return <main className={styles.page}><section className={styles.feed}>
    <header className={styles.discoveryHeader}><p className={styles.eyebrow}>标签</p><h1>{data.term.name}</h1><p>{data.posts.totalItems} 篇已发布文章</p></header>
    {data.posts.items.length
      ? <div className={styles.postList}>{data.posts.items.map((post, index) => <PostCard key={post.slug} post={post} position={(data.posts.page - 1) * 10 + index + 1} />)}</div>
      : <div className={styles.empty}><h2>这一页还没有文章</h2><p>可以返回最新文章继续阅读。</p><Link href="/">返回最新文章</Link></div>}
    <Pagination page={data.posts.page} totalPages={data.posts.totalPages} basePath={`/tags/${encodeURIComponent(slug)}`} />
  </section></main>;
}
