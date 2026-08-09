import { publicPostPageQuerySchema } from "@blog-x/contracts";
import Link from "next/link";
import Pagination from "./_components/Pagination";
import PostCard from "./_components/PostCard";
import { getPublicPosts } from "./lib/api";
import styles from "./public.module.css";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function EmptyState({ invalid = false }: { invalid?: boolean }) {
  return (
    <div className={styles.empty}>
      <h3>{invalid ? "页码无效" : "这一页还没有文章"}</h3>
      <p>{invalid ? "请使用大于零的整数页码。" : "可以返回最新文章继续阅读。"}</p>
      <Link href="/">返回最新文章</Link>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const rawPage = (await searchParams).page;
  const query = publicPostPageQuerySchema.safeParse({ page: rawPage });
  const outcome = query.success ? await getPublicPosts(query.data.page) : null;
  if (outcome && outcome.kind !== "ok") throw new Error("public content unavailable");
  const result = outcome?.kind === "ok" ? outcome.data : null;
  const page = query.success ? query.data.page : 1;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="site-title">
        <div>
          <p className={styles.eyebrow}>Personal notes · Engineering &amp; life</p>
          <h1 id="site-title">Blog X</h1>
        </div>
        <p className={styles.heroText}>记录代码、系统与长期实践。保持好奇，也保留那些值得反复阅读的思考。</p>
      </section>
      <section className={styles.feed} aria-labelledby="latest-posts">
        <header className={styles.feedHeader}>
          <h2 id="latest-posts">最新文章</h2>
          <p>{result ? `共 ${result.totalItems} 篇 · 第 ${result.page} 页` : "公开文章"}</p>
        </header>
        {!query.success ? <EmptyState invalid /> : result && result.items.length === 0 ? <EmptyState /> : result ? (
          <div className={styles.postList}>
            {result.items.map((post, index) => (
              <PostCard key={post.slug} post={post} position={(result.page - 1) * result.pageSize + index + 1} />
            ))}
          </div>
        ) : null}
        {result ? <Pagination page={page} totalPages={result.totalPages} /> : null}
      </section>
    </main>
  );
}
