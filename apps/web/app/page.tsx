import { publicPostPageQuerySchema } from "@blog-x/contracts";
import Link from "next/link";
import Pagination from "./_components/Pagination";
import PostCard from "./_components/PostCard";
import { getPublicPosts } from "./lib/api";
import { pageMetadata, resolveCanonicalPage } from "./lib/site-metadata";
import styles from "./public.module.css";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

async function homeResult(searchParams: Record<string, string | string[] | undefined>) {
  const rawPage = searchParams.page;
  const query = publicPostPageQuerySchema.safeParse({ page: rawPage });
  const outcome = query.success ? await getPublicPosts(query.data.page) : null;
  if (outcome && outcome.kind !== "ok") throw new Error("public content unavailable");
  return { query, outcome, result: outcome?.kind === "ok" ? outcome.data : null };
}

export async function generateMetadata({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await searchParams;
  const { result } = await homeResult(resolvedSearchParams);
  const canonical = resolveCanonicalPage("/", resolvedSearchParams, result?.totalPages ?? 0);
  return pageMetadata({
    title: "最新文章",
    description: "记录代码、系统与长期实践。",
    path: canonical.canonical ? new URL(canonical.canonical).pathname + new URL(canonical.canonical).search : "/",
    index: canonical.index,
  });
}

function EmptyState({ kind }: { kind: "invalid" | "empty-blog" | "empty-page" }) {
  if (kind === "empty-blog") {
    return (
      <div className={`${styles.empty} ${styles.emptyWelcome}`}>
        <p className={styles.eyebrow}>COMING SOON</p>
        <h3>第一篇文章正在准备中</h3>
        <p>在内容发布前，可以先了解这个博客，浏览归档，或订阅后续更新。</p>
        <nav className={styles.emptyActions} aria-label="空博客导航">
          <Link href="/about">了解这个博客</Link>
          <Link href="/archives">查看归档</Link>
          <a href="/rss.xml">订阅 RSS</a>
        </nav>
      </div>
    );
  }

  const invalid = kind === "invalid";
  return (
    <div className={styles.empty}>
      <h3>{invalid ? "页码无效" : "这一页还没有文章"}</h3>
      <p>{invalid ? "请使用大于零的整数页码。" : "可以返回最新文章继续阅读。"}</p>
      <Link href="/">返回最新文章</Link>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { query, result } = await homeResult(await searchParams);
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
        {!query.success ? <EmptyState kind="invalid" /> : result && result.items.length === 0 ? <EmptyState kind={result.page === 1 && result.totalItems === 0 ? "empty-blog" : "empty-page"} /> : result ? (
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
