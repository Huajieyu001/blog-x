import { publicPostPageQuerySchema } from "@blog-x/contracts";
import Pagination from "./_components/Pagination";
import PostCard from "./_components/PostCard";
import { getPublicPosts } from "./lib/api";
import styles from "./public.module.css";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function EmptyState({ invalid = false }: { invalid?: boolean }) {
  return (
    <div className={styles.empty}>
      <h3>{invalid ? "页码无效" : "这一页还没有文章"}</h3>
      <p>{invalid ? "请使用大于零的整数页码。" : "可以返回最新文章继续阅读。"}</p>
      <a href="/">返回最新文章</a>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const rawPage = (await searchParams).page;
  const query = publicPostPageQuerySchema.safeParse({ page: rawPage });
  const result = query.success ? await getPublicPosts(query.data.page) : null;
  const page = query.success ? query.data.page : 1;

  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <a className={styles.brand} href="/">Blog X</a>
        <nav aria-label="站点导航"><a href="/admin">管理</a></nav>
      </header>
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
        {!query.success ? <EmptyState invalid /> : !result ? (
          <div className={styles.empty} role="status"><h3>暂时无法加载文章</h3><p>请稍后刷新页面重试。</p></div>
        ) : result.items.length === 0 ? <EmptyState /> : (
          <div className={styles.postList}>
            {result.items.map((post, index) => (
              <PostCard key={post.slug} post={post} position={(result.page - 1) * result.pageSize + index + 1} />
            ))}
          </div>
        )}
        {result ? <Pagination page={page} totalPages={result.totalPages} /> : null}
      </section>
    </main>
  );
}
